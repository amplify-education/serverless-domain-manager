"use strict";

import chalk from "chalk";
import DomainInfo = require("./DomainInfo");
import { ServerlessInstance, ServerlessOptions } from "./types";

const certStatuses = ["PENDING_VALIDATION", "ISSUED", "INACTIVE"];

class ServerlessCustomDomain {

    // AWS SDK resources
    public apigateway: any;
    public apigatewayv2: any;
    public route53: any;
    public acm: any;
    public acmRegion: string;
    public cloudformation: any;

    // Serverless specific properties
    public serverless: ServerlessInstance;
    public options: ServerlessOptions;
    public commands: object;
    public hooks: object;

    // Domain Manager specific properties
    public domains: Map<string, any>;

    constructor(serverless: ServerlessInstance, options: ServerlessOptions) {
        this.serverless = serverless;
        this.options = options;

        this.commands = {
            create_domain: {
                lifecycleEvents: [
                    "create",
                    "initialize",
                ],
                usage: "Creates a domain using the domain name defined in the serverless file",
            },
            delete_domain: {
                lifecycleEvents: [
                    "delete",
                    "initialize",
                ],
                usage: "Deletes a domain using the domain name defined in the serverless file",
            },
        };
        this.hooks = {
            "after:deploy:deploy": this.hookWrapper.bind(this, this.propogateMappings),
            "after:info:info": this.hookWrapper.bind(this, this.domainSummary),
            "before:remove:remove": this.hookWrapper.bind(this, this.removeMappings),
            "create_domain:create": this.hookWrapper.bind(this, this.createDomains),
            "delete_domain:delete": this.hookWrapper.bind(this, this.deleteDomains),
        };
    }

    /**
     * Wrapper for lifecycle function, initializes variables and checks if enabled.
     * @param lifecycleFunc lifecycle function that actually does desired action
     */
    public async hookWrapper(lifecycleFunc: any) {

        this.initializeDomainManager();

        if (this.domains.size === 0) {
            const msg = "No domains are enabled. To use Domain Manager pass 'enabled: true' in your serverless.yaml";
            this.domainManagerLog(msg);
        }

        return await lifecycleFunc.call(this);
    }

    /**
     * Lifecycle function to create a domain
     * Wraps creating a domain and resource record set
     */
    public async createDomains(): Promise<void> {

        const iterator = this.domains.entries();
        const results = new Map();

        let domain = iterator.next();
        while (!domain.done) {
            const domainInfo = domain.value[1];
            try {
                await this.getAliasInfo(domainInfo);
            } catch (err) {
                if (err.code === "NotFoundException") {
                    const msg = `Domain ${domainInfo.domainName} not found. Creating...`;
                    this.logIfDebug(msg);
                }
            }
            try {
                if (!domainInfo.aliasTarget) {
                    if (!domainInfo.certificateArn) {
                        await this.getCertArn(domainInfo);
                    }
                    await this.createCustomDomain(domainInfo);
                    await this.changeResourceRecordSet("UPSERT", domainInfo);
                    const msg = `${domainInfo.domainName} was created. Could take up to 40 minutes to be initialized.`;
                    results.set(domain.value[0], msg);
                    domain = iterator.next();
                } else {
                    const msg = `Domain ${domainInfo.domainName} already exists. Skipping...`;
                    results.set(domain.value[0], msg);
                    domain = iterator.next();
                }
            } catch (err) {
                if (err.code === "TooManyRequestsException") {
                    this.logIfDebug("Too many requests. Retrying in 5s.");
                    await this.sleep(5000);
                }
            }
        }

        [...results.values()].forEach((msg) => {
            this.domainManagerLog(msg);
        });
    }

    /**
     * Lifecycle function to delete a domain
     * Wraps deleting a domain and resource record set
     */
    public async deleteDomains(): Promise<void> {

        const iterator = this.domains.entries();
        const results = new Map();

        let domain = iterator.next();
        while (!domain.done) {
            const domainInfo = domain.value[1];
            try {
                await this.getAliasInfo(domainInfo);
                await this.deleteCustomDomain(domainInfo);
                await this.changeResourceRecordSet("DELETE", domainInfo);

                const msg = `Domain ${domainInfo.domainName} was deleted.`;
                results.set(domain.value[0], msg);
                domain = iterator.next();
            } catch (err) {
                switch (err.code) {
                    case "NotFoundException":
                        this.domainManagerLog(`Couldn't find ${domainInfo.domainName}. Skipping delete...`);
                        domain = iterator.next();
                        break;
                    case "TooManyRequestsException":
                        this.logIfDebug("Too many requests. Retrying in 5s.");
                        await this.sleep(5000);
                        break;
                    default:
                        this.logIfDebug(err);
                        const msg = `Unable to delete ${domainInfo.domainName}. SLS_DEBUG=* for more info.`;
                        this.domainManagerLog(msg);
                        results.set(domain.value[0], err);
                        domain = iterator.next();
                }
            }
        }

        results.forEach((msg) => {
            this.domainManagerLog(msg);
        });
    }

    /**
     * Lifecycle function to setup API mappings for HTTP and websocket endpoints
     */

    public async propogateMappings(): Promise<void> {
        const iterator = this.domains.entries();
        const successful = new Map();

        let domain = iterator.next();
        while (!domain.done) {
            const domainInfo = domain.value[1];
            try {

                if (domainInfo.enabled) {

                    const apiId = await this.getApiId(domainInfo);
                    this.serverless.cli.log(apiId);
                    const mapping = await this.getMapping(apiId, domainInfo);

                    if (!mapping) {
                        await this.createApiMapping(apiId, domainInfo);
                        domain = iterator.next();
                        this.addOutputs(domainInfo);
                        successful.set(domainInfo, "successful");
                        continue;
                    }

                    if (mapping.apiMappingKey !== domainInfo.basePath) {
                        await this.updateApiMapping(mapping.apiMappingId, domainInfo, apiId);
                        domain = iterator.next();
                        this.addOutputs(domainInfo);
                        successful.set(domainInfo, "successful");
                        continue;
                    } else {
                        this.logIfDebug(`Path for ${domainInfo.domainName} is already current. Skipping...`);
                        domain = iterator.next();
                    }

                }
            } catch (err) {
                this.logIfDebug(err.message);
                domain = iterator.next();
            }
        }

        if (successful.size > 0) {
            await this.domainSummary();
        }
    }

    /**
     * Lifecycle function to print domain summary
     * Wraps printing of all domain manager related info
     */
    public async domainSummary(): Promise<void> {
        const iterator = this.domains.entries();
        const results = new Map();

        let domain = iterator.next();
        while (!domain.done) {
            const domainInfo = domain.value[1];
            if (domainInfo.createRoute53Record !== false) {
                try {
                    await this.getAliasInfo(domainInfo);
                    results.set(domain.value[0], {
                       aliasHostedZoneId: domainInfo.aliasHostedZoneId,
                       aliasTarget: domainInfo.aliasTarget,
                       domainName: domainInfo.domainName,
                       websocket: domainInfo.websocket,
                    });
                    domain = iterator.next();
                } catch (err) {
                   const msg = `Unable to print Serverless Domain Manager Summary for ${domainInfo.domainName}`;
                   this.domainManagerLog(err);
                   results.set(domain.value[0], msg);
                   domain = iterator.next();
                }
            }
        }

        const sorted = [...results.values()].sort();
        this.printDomainSummary(sorted);

    }

    /**
     * Initializes DomainInfo class with domain specific variables, and
     * SDK APIs if and only if there are enabled domains. Otherwise will
     * return undefined.
     */

    public initializeDomainManager(): void {

        if (typeof this.serverless.service.custom === "undefined") {
            throw new Error("serverless-domain-manager: Plugin configuration is missing.");
        } else if (typeof this.serverless.service.custom.customDomain === "undefined") {
            throw new Error("serverless-domain-manager: Plugin configuration is missing.");
        }

        this.domains = new Map();

        this.serverless.service.custom.customDomain
        .map((customDomain) => {
            const domain = new DomainInfo(customDomain, this.serverless, this.options);
            if (!domain.enabled) {
                const msg = `Domain generation for ${domain.domainName} has been disabled. Skipping...`;
                this.domainManagerLog(msg);
                return;
            }

            this.domains.set(domain.domainName, domain);
        });

        if (this.domains.size > 0) {

            let credentials;
            credentials = this.serverless.providers.aws.getCredentials();

            this.apigateway = new this.serverless.providers.aws.sdk.APIGateway(credentials);
            this.apigatewayv2 = new this.serverless.providers.aws.sdk.ApiGatewayV2(credentials);
            this.route53 = new this.serverless.providers.aws.sdk.Route53(credentials);
            this.cloudformation = new this.serverless.providers.aws.sdk.CloudFormation(credentials);
            this.acm = new this.serverless.providers.aws.sdk.ACM(credentials);
        }
    }

    /**
     * Gets Certificate ARN that most closely matches domain name OR given Cert ARN if provided
     */
    public async getCertArn(domain: DomainInfo): Promise<string> {
        if (domain.certificateArn) {
            this.domainManagerLog(`Selected specific certificateArn ${domain.certificateArn}`);
            return;
        }

        let certificateArn; // The arn of the choosen certificate
        let certificateName = domain.certificateName; // The certificate name
        let certData;
        try {

            if (domain.isRegional()) {
                this.acmRegion = this.serverless.providers.aws.getRegion();
                this.acm.config.update({region: this.acmRegion});
                certData = await this.acm.listCertificates({ CertificateStatuses: certStatuses }).promise();
            } else {
                this.acm.config.update({region: "us-east-1"});
                certData = await this.acm.listCertificates({ CertificateStatuses: certStatuses }).promise();
            }

            // The more specific name will be the longest
            let nameLength = 0;
            const certificates = certData.CertificateSummaryList;

            // Checks if a certificate name is given
            if (certificateName != null) {
                const foundCertificate = certificates
                    .find((certificate) => (certificate.DomainName === certificateName));
                if (foundCertificate != null) {
                    certificateArn = foundCertificate.CertificateArn;
                }
            } else {
                certificateName = domain.domainName;
                certificates.forEach((certificate) => {
                    let certificateListName = certificate.DomainName;
                    // Looks for wild card and takes it out when checking
                    if (certificateListName[0] === "*") {
                        certificateListName = certificateListName.substr(1);
                    }
                    // Looks to see if the name in the list is within the given domain
                    // Also checks if the name is more specific than previous ones
                    if (certificateName.includes(certificateListName)
                        && certificateListName.length > nameLength) {
                        nameLength = certificateListName.length;
                        certificateArn = certificate.CertificateArn;
                    }
                });
            }
        } catch (err) {
            this.logIfDebug(err);
            throw Error(`Error: Could not list certificates in Certificate Manager.\n${err}`);
        }
        if (certificateArn == null) {
            throw Error(`Error: Could not find the certificate ${certificateName}.`);
        }
        domain.certificateArn = certificateArn;
    }

    /**
     * Gets domain info as DomainInfo object if domain exists, otherwise returns false
     */
    public async getAliasInfo(domain: DomainInfo) {
        try {
            const domainInfo = await this.apigatewayv2.getDomainName({ DomainName: domain.domainName }).promise();
            domain.SetApiGatewayRespV2(domainInfo);
            this.domains.set(domain.domainName, domain);
        } catch (err) {
            if (err.code === "NotFoundException") {
                throw err;
            }
            throw new Error(`Error: Unable to fetch information about ${domain.domainName}`);
        }
    }

    /**
     * Creates Custom Domain Name through API Gateway
     * @param certificateArn: Certificate ARN to use for custom domain
     */
    public async createCustomDomain(domain: DomainInfo) {
        let createdDomain = {};
        try {

            if (!domain.websocket) {
                // Set up parameters
                const params = {
                    certificateArn: domain.certificateArn,
                    domainName: domain.domainName,
                    endpointConfiguration: {
                        types: [domain.endpointType],
                    },
                    regionalCertificateArn: domain.certificateArn,
                };
                if (!domain.isRegional()) {
                    params.regionalCertificateArn = undefined;
                } else {
                    params.certificateArn = undefined;
                }

                createdDomain = await this.apigateway.createDomainName(params).promise();
                domain.SetApiGatewayRespV1(createdDomain);
                this.domains.set(domain.domainName, domain);
            } else {
                const params = {
                    DomainName: domain.domainName,
                    DomainNameConfigurations: [
                        {
                            CertificateArn: domain.certificateArn,
                            EndpointType: domain.endpointType,
                        },
                    ],
                };

                createdDomain = await this.apigatewayv2.createDomainName(params).promise();
                domain.SetApiGatewayRespV2(createdDomain);
                this.domains.set(domain.domainName, domain);
            }

        } catch (err) {
            if (err.code === "TooManyRequestsException") {
                throw err;
            }
            throw new Error(`Error: Failed to create custom domain ${domain.domainName}\n`);
        }
    }

    /**
     * Delete Custom Domain Name through API Gateway
     */
    public async deleteCustomDomain(domain: DomainInfo): Promise<void> {
        const params = {
            DomainName: domain.domainName,
        };

        // Make API call
        try {
            await this.apigatewayv2.deleteDomainName(params).promise();
        } catch (err) {
            if (err.code === "TooManyRequestsException") {
                throw err;
            }
            throw new Error(`Error: Failed to delete custom domain ${domain.domainName}\n`);
        }
    }

    /**
     * Change A Alias record through Route53 based on given action
     * @param action: String descriptor of change to be made. Valid actions are ['UPSERT', 'DELETE']
     * @param domain: DomainInfo object containing info about custom domain
     */
    public async changeResourceRecordSet(action: string, domain: DomainInfo): Promise<void> {
        if (action !== "UPSERT" && action !== "DELETE") {
            throw new Error(`Error: Invalid action "${action}" when changing Route53 Record.
                Action must be either UPSERT or DELETE.\n`);
        }

        if (domain.createRoute53Record !== undefined && domain.createRoute53Record === false) {
            this.domainManagerLog("Skipping creation of Route53 record.");
            return;
        }
        // Set up parameters
        const route53HostedZoneId = await this.getRoute53HostedZoneId(domain);
        const Changes = ["A", "AAAA"].map((Type) => ({
                Action: action,
                ResourceRecordSet: {
                    AliasTarget: {
                        DNSName: domain.aliasTarget,
                        EvaluateTargetHealth: false,
                        HostedZoneId: domain.aliasHostedZoneId,
                    },
                    Name: domain.domainName,
                    Type,
                },
        }));
        const params = {
            ChangeBatch: {
                Changes,
                Comment: "Record created by serverless-domain-manager",
            },
            HostedZoneId: route53HostedZoneId,
        };
        // Make API call
        try {
            await this.route53.changeResourceRecordSets(params).promise();
        } catch (err) {
            this.logIfDebug(err);
            throw new Error(`Error: Failed to ${action} A Alias for ${domain.domainName}\n`);
        }
    }

    /**
     * Gets Route53 HostedZoneId from user or from AWS
     */
    public async getRoute53HostedZoneId(domain: DomainInfo): Promise<string> {
        if (domain.hostedZoneId) {
            this.domainManagerLog(`Selected specific hostedZoneId ${domain.hostedZoneId}`);
            return domain.hostedZoneId;
        }

        const filterZone = domain.hostedZonePrivate !== undefined;
        if (filterZone && domain.hostedZonePrivate) {
            this.domainManagerLog("Filtering to only private zones.");
        } else if (filterZone && !domain.hostedZonePrivate) {
            this.domainManagerLog("Filtering to only public zones.");
        }

        let hostedZoneData;
        const givenDomainNameReverse = domain.domainName.split(".").reverse();

        try {
            hostedZoneData = await this.route53.listHostedZones({}).promise();
            const targetHostedZone = hostedZoneData.HostedZones
                .filter((hostedZone) => {
                    let hostedZoneName;
                    if (hostedZone.Name.endsWith(".")) {
                        hostedZoneName = hostedZone.Name.slice(0, -1);
                    } else {
                        hostedZoneName = hostedZone.Name;
                    }
                    if (!filterZone || domain.hostedZonePrivate === hostedZone.Config.PrivateZone) {
                        const hostedZoneNameReverse = hostedZoneName.split(".").reverse();

                        if (givenDomainNameReverse.length === 1
                            || (givenDomainNameReverse.length >= hostedZoneNameReverse.length)) {
                            for (let i = 0; i < hostedZoneNameReverse.length; i += 1) {
                                if (givenDomainNameReverse[i] !== hostedZoneNameReverse[i]) {
                                    return false;
                                }
                            }
                            return true;
                        }
                    }
                    return false;
                })
                .sort((zone1, zone2) => zone2.Name.length - zone1.Name.length)
                .shift();

            if (targetHostedZone) {
                const hostedZoneId = targetHostedZone.Id;
                // Extracts the hostzone Id
                const startPos = hostedZoneId.indexOf("e/") + 2;
                const endPos = hostedZoneId.length;
                return hostedZoneId.substring(startPos, endPos);
            }
        } catch (err) {
            this.logIfDebug(err);
            throw new Error(`Error: Unable to list hosted zones in Route53.\n${err}`);
        }
        throw new Error(`Error: Could not find hosted zone "${domain.domainName}"`);
    }

    public async getMapping(ApiId: string, domain: DomainInfo): Promise<any> {

        const params = {
            DomainName: domain.domainName,
        };

        let mappingInfo;
        let apiMappingId;
        let apiMappingKey;

        try {
            mappingInfo = await this.apigatewayv2.getApiMappings(params).promise();
        } catch (err) {
            this.logIfDebug(err);
            if (err.code === "NotFoundException") {
                throw err;
            }
            throw new Error(`Error: Unable to get mappings for ${domain.domainName}`);
        }
        if (mappingInfo.Items !== undefined && mappingInfo.Items instanceof Array) {
            for (const m of mappingInfo.Items) {
                if (m.ApiId === ApiId) {
                    apiMappingId = m.ApiMappingId;
                    apiMappingKey = m.ApiMappingKey;
                    break;
                }
            }
        }

        return apiMappingId ? {apiMappingId, apiMappingKey} : undefined;
    }

    /**
     * Creates basepath mapping
     */
    public async createApiMapping(apiId: string, domain: DomainInfo): Promise<void> {
        const params = {
            ApiId: apiId,
            ApiMappingKey: domain.basePath,
            DomainName: domain.domainName,
            Stage: domain.stage,
        };

        try {
            await this.apigatewayv2.createApiMapping(params).promise();
            this.domainManagerLog(`Created API mapping for ${domain.domainName}.`);
        } catch (err) {
            throw new Error(`${err}`);
        }
    }

    /**
     * Updates basepath mapping
     */
    public async updateApiMapping(oldMappingId: string, domain: DomainInfo, apiId: string): Promise<void> {

        const params = {
            ApiId: apiId,
            ApiMappingId: oldMappingId,
            ApiMappingKey: domain.basePath,
            DomainName: domain.domainName,
            Stage: domain.stage,
        };

        // Make API call
        try {
            await this.apigatewayv2.updateApiMapping(params).promise();
            this.domainManagerLog(`Updated API mapping for ${domain.domainName}`);
        } catch (err) {
            this.logIfDebug(err);
            throw new Error(`Error: Unable to update mapping for ${domain.domainName}.\n`);
        }
    }

    /**
     * Gets rest API id from CloudFormation stack
     */
    public async getApiId(domain: DomainInfo): Promise<string> {

        const provider = this.serverless.service.provider;
        if (!domain.websocket && provider.apiGateway && provider.apiGateway.restApiId) {
            const restApiId = provider.apiGateway.restApiId;
            const msg = `Mapping ${domain.domainName} to existing API ${restApiId}.`;
            this.domainManagerLog(msg);
            return provider.apiGateway.restApiId;
        } else if (domain.websocket && provider.apiGateway && provider.apiGateway.websocketApiId) {
            const websocketApiId = provider.apiGateway.websocketApiId;
            const msg = `Mapping ${domain.domainName} to existing API ${websocketApiId}.`;
            this.domainManagerLog(msg);
            return provider.apiGateway.websocketApiId;
        }

        const stackName = provider.stackName || `${this.serverless.service.service}-${domain.stage}`;

        const params = {
            LogicalResourceId: "",
            StackName: stackName,
        };

        if (!domain.websocket) {
            params.LogicalResourceId = "ApiGatewayRestApi";
        } else {
            params.LogicalResourceId = "WebsocketsApi";
        }
        const str = JSON.stringify(params, null, 4);
        this.serverless.cli.log(str);

        let response;
        try {
            response = await this.cloudformation.describeStackResource(params).promise();
        } catch (err) {
            this.logIfDebug(err);
            throw new Error(`Error: Failed to find CloudFormation resources for ${domain.domainName}\n`);
        }
        const apiID = response.StackResourceDetail.PhysicalResourceId;
        if (!apiID) {
            const conditional = !domain.websocket ? "RestApiId" : "WebsocketApiId";
            throw new Error(`Error: No ${conditional} associated with CloudFormation stack ${stackName}`);
        }
        return apiID;
    }

    /**
     * Deletes basepath mapping
     */
    public async deleteMapping(apiMappingId: string, domain: DomainInfo): Promise<void> {
        const params = {
            ApiMappingId: apiMappingId,
            DomainName: domain.domainName,
        };
        // Make API call
        try {
            await this.apigatewayv2.deleteApiMapping(params).promise();
            this.domainManagerLog(`Removed mapping for ${domain.domainName}.`);
        } catch (err) {
            this.logIfDebug(err);
            this.domainManagerLog(`Unable to remove mapping for ${domain.domainName}.`);
        }
    }

    /**
     *  Adds the domain name and distribution domain name to the CloudFormation outputs
     */
    public addOutputs(domainInfo: DomainInfo): void {
        const service = this.serverless.service;
        if (!service.provider.compiledCloudFormationTemplate.Outputs) {
            service.provider.compiledCloudFormationTemplate.Outputs = {};
        }
        service.provider.compiledCloudFormationTemplate.Outputs.aliasTarget = {
            Value: domainInfo.aliasTarget,
        };
        if (domainInfo.aliasHostedZoneId) {
            service.provider.compiledCloudFormationTemplate.Outputs.aliasHostedZoneId = {
                Value: domainInfo.aliasHostedZoneId,
            };
        }
    }

    /**
     * Logs message if SLS_DEBUG is set
     * @param message message to be printed
     */
    public logIfDebug(message: any): void {
        if (process.env.SLS_DEBUG) {
            this.serverless.cli.log(message, "Domain Manager");
        }
    }

    /**
     * Logs domain manager specific messages
     * @param message message to be printed
     */
    public domainManagerLog(message: any) {
        this.serverless.cli.log(message, "Domain Manager");
    }

    /**
     * Lifecycle function to remove API mappings for HTTP and websocket endpoints
     */
    public async removeMappings(): Promise<void> {
        const iterator = this.domains.entries();

        let domain = iterator.next();
        while (!domain.done) {
            const domainInfo = domain.value[1];
            try {
                if (domainInfo.enabled) {
                    const apiId = await this.getApiId(domainInfo);
                    const currentMapping = await this.getMapping(apiId, domainInfo);
                    await this.deleteMapping(currentMapping, domainInfo);
                    domain = iterator.next();
                }
            } catch (err) {
                switch (err.code) {
                    case "NotFoundException":
                        this.logIfDebug(`Mappings for domain ${domainInfo} not found. Skipping...`);
                        break;
                    default:
                        this.logIfDebug(err);
                        const msg = `Unable to remove mapping for ${domainInfo.domainName}. SLS_DEBUG=* for more info.`;
                        this.domainManagerLog(msg);
                }
                domain = iterator.next();
            }
        }
    }

    /**
     * Prints out a summary of all domain manager related info
     */
    private printDomainSummary(print: any): void {

        this.serverless.cli.consoleLog(chalk.yellow.underline("Serverless Domain Manager Summary"));

        print.forEach((v) => {
            if (typeof v === "object") {
                const apiType = !v.websocket ? "REST" : "Websocket";
                this.serverless.cli.consoleLog(chalk.yellow(`${v.domainName} (${apiType}):`));
                this.serverless.cli.consoleLog(`  Target Domain: ${v.aliasTarget}`);
                this.serverless.cli.consoleLog(`  Hosted Zone Id: ${v.aliasHostedZoneId}`);
            } else {
                this.serverless.cli.consoleLog(print);
            }
        });
    }

    private sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

export = ServerlessCustomDomain;

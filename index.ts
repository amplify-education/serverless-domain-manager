"use strict";

import chalk from "chalk";
import DomainInfo = require("./DomainInfo");
import { ServerlessInstance, ServerlessOptions } from "./types";

const endpointTypes = {
    edge: "EDGE",
    regional: "REGIONAL",
};

const tlsVersions = {
    tls_1_0: "TLS_1_0",
    tls_1_2: "TLS_1_2",
};

const certStatuses = ["PENDING_VALIDATION", "ISSUED", "INACTIVE"];

class ServerlessCustomDomain {

    // AWS SDK resources
    public apigateway: any;
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
    public enabled: boolean;
    public givenDomainName: string;
    public hostedZonePrivate: boolean;
    public basePath: string;
    private endpointType: string;
    private stage: string;
    private securityPolicy: string;

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
            "after:deploy:deploy": this.hookWrapper.bind(this, this.setupBasePathMapping),
            "after:info:info": this.hookWrapper.bind(this, this.domainSummary),
            "before:remove:remove": this.hookWrapper.bind(this, this.removeBasePathMapping),
            "create_domain:create": this.hookWrapper.bind(this, this.createDomain),
            "delete_domain:delete": this.hookWrapper.bind(this, this.deleteDomain),
        };
    }

    /**
     * Wrapper for lifecycle function, initializes variables and checks if enabled.
     * @param lifecycleFunc lifecycle function that actually does desired action
     */
    public async hookWrapper(lifecycleFunc: any) {
        this.initializeVariables();
        if (!this.enabled) {
            this.serverless.cli.log("serverless-domain-manager: Custom domain is disabled.");
            return;
        } else {
            return await lifecycleFunc.call(this);
        }
    }

    /**
     * Lifecycle function to create a domain
     * Wraps creating a domain and resource record set
     */
    public async createDomain(): Promise<void> {
        let domainInfo;
        try {
            domainInfo = await this.getDomainInfo();
        } catch (err) {
            if (err.message !== `Error: ${this.givenDomainName} not found.`) {
                throw err;
            }
        }
        if (!domainInfo) {
            const certArn = await this.getCertArn();
            domainInfo = await this.createCustomDomain(certArn);
            await this.changeResourceRecordSet("UPSERT", domainInfo);
            this.serverless.cli.log(
                `Custom domain ${this.givenDomainName} was created.
            New domains may take up to 40 minutes to be initialized.`,
            );
        } else {
            this.serverless.cli.log(`Custom domain ${this.givenDomainName} already exists.`);
        }
    }

    /**
     * Lifecycle function to delete a domain
     * Wraps deleting a domain and resource record set
     */
    public async deleteDomain(): Promise<void> {
        let domainInfo;
        try {
            domainInfo = await this.getDomainInfo();
        } catch (err) {
            if (err.message === `Error: ${this.givenDomainName} not found.`) {
                this.serverless.cli.log(`Unable to delete custom domain ${this.givenDomainName}.`);
                return;
            }
            throw err;
        }
        await this.deleteCustomDomain();
        await this.changeResourceRecordSet("DELETE", domainInfo);
        this.serverless.cli.log(`Custom domain ${this.givenDomainName} was deleted.`);
    }

    /**
     * Lifecycle function to create basepath mapping
     * Wraps creation of basepath mapping and adds domain name info as output to cloudformation stack
     */
    public async setupBasePathMapping(): Promise<void> {
        // check if basepathmapping exists
        const restApiId = await this.getRestApiId();
        const currentBasePath = await this.getBasePathMapping(restApiId);
        // if basepath that matches restApiId exists, update; else, create
        if (!currentBasePath) {
            await this.createBasePathMapping(restApiId);
        } else {
            await this.updateBasePathMapping(currentBasePath);
        }
        const domainInfo = await this.getDomainInfo();
        this.addOutputs(domainInfo);
        await this.printDomainSummary(domainInfo);
    }

    /**
     * Lifecycle function to delete basepath mapping
     * Wraps deletion of basepath mapping
     */
    public async removeBasePathMapping(): Promise<void> {
        await this.deleteBasePathMapping();
    }

    /**
     * Lifecycle function to print domain summary
     * Wraps printing of all domain manager related info
     */
    public async domainSummary(): Promise<void> {
        const domainInfo = await this.getDomainInfo();
        if (domainInfo) {
            this.printDomainSummary(domainInfo);
        } else {
            this.serverless.cli.log("Unable to print Serverless Domain Manager Summary");
        }
    }

    /**
     * Goes through custom domain property and initializes local variables and cloudformation template
     */
    public initializeVariables(): void {
        this.enabled = this.evaluateEnabled();
        if (this.enabled) {
            const credentials = this.serverless.providers.aws.getCredentials();
            credentials.region = this.serverless.providers.aws.getRegion();

            this.serverless.providers.aws.sdk.config.update({maxRetries: 20});
            this.apigateway = new this.serverless.providers.aws.sdk.APIGateway(credentials);
            this.route53 = new this.serverless.providers.aws.sdk.Route53(credentials);
            this.cloudformation = new this.serverless.providers.aws.sdk.CloudFormation(credentials);

            this.givenDomainName = this.serverless.service.custom.customDomain.domainName;
            this.hostedZonePrivate = this.serverless.service.custom.customDomain.hostedZonePrivate;
            let basePath = this.serverless.service.custom.customDomain.basePath;
            if (basePath == null || basePath.trim() === "") {
                basePath = "(none)";
            }
            this.basePath = basePath;
            let stage = this.serverless.service.custom.customDomain.stage;
            if (typeof stage === "undefined") {
                stage = this.options.stage || this.serverless.service.provider.stage;
            }
            this.stage = stage;

            const endpointTypeWithDefault = this.serverless.service.custom.customDomain.endpointType ||
                endpointTypes.edge;
            const endpointTypeToUse = endpointTypes[endpointTypeWithDefault.toLowerCase()];
            if (!endpointTypeToUse) {
                throw new Error(`${endpointTypeWithDefault} is not supported endpointType, use edge or regional.`);
            }
            this.endpointType = endpointTypeToUse;

            const securityPolicyDefault = this.serverless.service.custom.customDomain.securityPolicy ||
                tlsVersions.tls_1_2;
            const tlsVersionToUse = tlsVersions[securityPolicyDefault.toLowerCase()];
            if (!tlsVersionToUse) {
                throw new Error(`${securityPolicyDefault} is not a supported securityPolicy, use tls_1_0 or tls_1_2.`);
            }
            this.securityPolicy = tlsVersionToUse;

            this.acmRegion = this.endpointType === endpointTypes.regional ?
                this.serverless.providers.aws.getRegion() : "us-east-1";
            const acmCredentials = Object.assign({}, credentials, { region: this.acmRegion });
            this.acm = new this.serverless.providers.aws.sdk.ACM(acmCredentials);
        }
    }

    /**
     * Determines whether this plug-in is enabled.
     *
     * This method reads the customDomain property "enabled" to see if this plug-in should be enabled.
     * If the property's value is undefined, a default value of true is assumed (for backwards
     * compatibility).
     * If the property's value is provided, this should be boolean, otherwise an exception is thrown.
     * If no customDomain object exists, an exception is thrown.
     */
    public evaluateEnabled(): boolean {
        if (typeof this.serverless.service.custom === "undefined"
            || typeof this.serverless.service.custom.customDomain === "undefined") {
            throw new Error("serverless-domain-manager: Plugin configuration is missing.");
        }

        const enabled = this.serverless.service.custom.customDomain.enabled;
        if (enabled === undefined) {
            return true;
        }
        if (typeof enabled === "boolean") {
            return enabled;
        } else if (typeof enabled === "string" && enabled === "true") {
            return true;
        } else if (typeof enabled === "string" && enabled === "false") {
            return false;
        }
        throw new Error(`serverless-domain-manager: Ambiguous enablement boolean: "${enabled}"`);
    }

    /**
     * Gets Certificate ARN that most closely matches domain name OR given Cert ARN if provided
     */
    public async getCertArn(): Promise<string> {
        if (this.serverless.service.custom.customDomain.certificateArn) {
            this.serverless.cli.log(
                `Selected specific certificateArn ${this.serverless.service.custom.customDomain.certificateArn}`);
            return this.serverless.service.custom.customDomain.certificateArn;
        }

        let certificateArn; // The arn of the choosen certificate
        let certificateName = this.serverless.service.custom.customDomain.certificateName; // The certificate name
        let certData;
        try {
            certData = await this.acm.listCertificates(
                { CertificateStatuses: certStatuses }).promise();
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
                certificateName = this.givenDomainName;
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
        return certificateArn;
    }

    /**
     * Gets domain info as DomainInfo object if domain exists, otherwise returns false
     */
    public async getDomainInfo(): Promise<DomainInfo> {
        let domainInfo;
        try {
            domainInfo = await this.apigateway.getDomainName({ domainName: this.givenDomainName }).promise();
            return new DomainInfo(domainInfo);
        } catch (err) {
            this.logIfDebug(err);
            if (err.code === "NotFoundException") {
                throw new Error(`Error: ${this.givenDomainName} not found.`);
            }
            throw new Error(`Error: Unable to fetch information about ${this.givenDomainName}`);
        }
    }

    /**
     * Creates Custom Domain Name through API Gateway
     * @param certificateArn: Certificate ARN to use for custom domain
     */
    public async createCustomDomain(certificateArn: string): Promise<DomainInfo> {
        // Set up parameters
        const params = {
            certificateArn,
            domainName: this.givenDomainName,
            endpointConfiguration: {
                types: [this.endpointType],
            },
            regionalCertificateArn: certificateArn,
            securityPolicy: this.securityPolicy,
        };
        if (this.endpointType === endpointTypes.edge) {
            params.regionalCertificateArn = undefined;
        } else if (this.endpointType === endpointTypes.regional) {
            params.certificateArn = undefined;
        }

        // Make API call
        let createdDomain = {};
        try {
            createdDomain = await this.apigateway.createDomainName(params).promise();
        } catch (err) {
            this.logIfDebug(err);
            throw new Error(`Error: Failed to create custom domain ${this.givenDomainName}\n`);
        }
        return new DomainInfo(createdDomain);
    }

    /**
     * Delete Custom Domain Name through API Gateway
     */
    public async deleteCustomDomain(): Promise<void> {
        const params = {
            domainName: this.givenDomainName,
        };

        // Make API call
        try {
            await this.apigateway.deleteDomainName(params).promise();
        } catch (err) {
            this.logIfDebug(err);
            throw new Error(`Error: Failed to delete custom domain ${this.givenDomainName}\n`);
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

        const createRoute53Record = this.serverless.service.custom.customDomain.createRoute53Record;
        if (createRoute53Record !== undefined && createRoute53Record === false) {
            this.serverless.cli.log("Skipping creation of Route53 record.");
            return;
        }
        // Set up parameters
        const route53HostedZoneId = await this.getRoute53HostedZoneId();
        const Changes = ["A", "AAAA"].map((Type) => ({
                Action: action,
                ResourceRecordSet: {
                    AliasTarget: {
                        DNSName: domain.domainName,
                        EvaluateTargetHealth: false,
                        HostedZoneId: domain.hostedZoneId,
                    },
                    Name: this.givenDomainName,
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
            throw new Error(`Error: Failed to ${action} A Alias for ${this.givenDomainName}\n`);
        }
    }

    /**
     * Gets Route53 HostedZoneId from user or from AWS
     */
    public async getRoute53HostedZoneId(): Promise<string> {
        if (this.serverless.service.custom.customDomain.hostedZoneId) {
            this.serverless.cli.log(
                `Selected specific hostedZoneId ${this.serverless.service.custom.customDomain.hostedZoneId}`);
            return this.serverless.service.custom.customDomain.hostedZoneId;
        }

        const filterZone = this.hostedZonePrivate !== undefined;
        if (filterZone && this.hostedZonePrivate) {
            this.serverless.cli.log("Filtering to only private zones.");
        } else if (filterZone && !this.hostedZonePrivate) {
            this.serverless.cli.log("Filtering to only public zones.");
        }

        let hostedZoneData;
        const givenDomainNameReverse = this.givenDomainName.split(".").reverse();

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
                    if (!filterZone || this.hostedZonePrivate === hostedZone.Config.PrivateZone) {
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
        throw new Error(`Error: Could not find hosted zone "${this.givenDomainName}"`);
    }

    public async getBasePathMapping(restApiId: string): Promise<string> {
        const params = {
            domainName: this.givenDomainName,
        };
        let basepathInfo;
        let currentBasePath;
        try {
            basepathInfo = await this.apigateway.getBasePathMappings(params).promise();
        } catch (err) {
            this.logIfDebug(err);
            throw new Error(`Error: Unable to get BasePathMappings for ${this.givenDomainName}`);
        }
        if (basepathInfo.items !== undefined && basepathInfo.items instanceof Array) {
            for (const basepathObj of basepathInfo.items) {
                if (basepathObj.restApiId === restApiId) {
                    currentBasePath = basepathObj.basePath;
                    break;
                }
            }
        }
        return currentBasePath;
    }

    /**
     * Creates basepath mapping
     */
    public async createBasePathMapping(restApiId: string): Promise<void> {
        const params = {
            basePath: this.basePath,
            domainName: this.givenDomainName,
            restApiId,
            stage: this.stage,
        };
        // Make API call
        try {
            await this.apigateway.createBasePathMapping(params).promise();
            this.serverless.cli.log("Created basepath mapping.");
        } catch (err) {
            this.logIfDebug(err);
            throw new Error(`Error: Unable to create basepath mapping.\n`);
        }
    }

    /**
     * Updates basepath mapping
     */
    public async updateBasePathMapping(oldBasePath: string): Promise<void> {
        const params = {
            basePath: oldBasePath,
            domainName: this.givenDomainName,
            patchOperations: [
                {
                    op: "replace",
                    path: "/basePath",
                    value: this.basePath,
                },
            ],
        };
        // Make API call
        try {
            await this.apigateway.updateBasePathMapping(params).promise();
            this.serverless.cli.log("Updated basepath mapping.");
        } catch (err) {
            this.logIfDebug(err);
            throw new Error(`Error: Unable to update basepath mapping.\n`);
        }
    }

    /**
     * Gets rest API id from CloudFormation stack
     */
    public async getRestApiId(): Promise<string> {
        if (this.serverless.service.provider.apiGateway && this.serverless.service.provider.apiGateway.restApiId) {
            this.serverless.cli.log(`Mapping custom domain to existing API
                ${this.serverless.service.provider.apiGateway.restApiId}.`);
            return this.serverless.service.provider.apiGateway.restApiId;
        }
        const stackName = this.serverless.service.provider.stackName ||
            `${this.serverless.service.service}-${this.stage}`;
        const params = {
            LogicalResourceId: "ApiGatewayRestApi",
            StackName: stackName,
        };

        let response;
        try {
            response = await this.cloudformation.describeStackResource(params).promise();
        } catch (err) {
            this.logIfDebug(err);
            throw new Error(`Error: Failed to find CloudFormation resources for ${this.givenDomainName}\n`);
        }
        const restApiId = response.StackResourceDetail.PhysicalResourceId;
        if (!restApiId) {
            throw new Error(`Error: No RestApiId associated with CloudFormation stack ${stackName}`);
        }
        return restApiId;
    }

    /**
     * Deletes basepath mapping
     */
    public async deleteBasePathMapping(): Promise<void> {
        const params = {
            basePath: this.basePath,
            domainName: this.givenDomainName,
        };
        // Make API call
        try {
            await this.apigateway.deleteBasePathMapping(params).promise();
            this.serverless.cli.log("Removed basepath mapping.");
        } catch (err) {
            this.logIfDebug(err);
            this.serverless.cli.log("Unable to remove basepath mapping.");
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
        service.provider.compiledCloudFormationTemplate.Outputs.DomainName = {
            Value: domainInfo.domainName,
        };
        if (domainInfo.hostedZoneId) {
            service.provider.compiledCloudFormationTemplate.Outputs.HostedZoneId = {
                Value: domainInfo.hostedZoneId,
            };
        }
    }

    /**
     * Logs message if SLS_DEBUG is set
     * @param message message to be printed
     */
    public logIfDebug(message: any): void {
        if (process.env.SLS_DEBUG) {
            this.serverless.cli.log(message, "Serverless Domain Manager");
        }
    }

    /**
     * Prints out a summary of all domain manager related info
     */
    private printDomainSummary(domainInfo: DomainInfo): void {
        this.serverless.cli.consoleLog(chalk.yellow.underline("Serverless Domain Manager Summary"));

        if (this.serverless.service.custom.customDomain.createRoute53Record !== false) {
            this.serverless.cli.consoleLog(chalk.yellow("Domain Name"));
            this.serverless.cli.consoleLog(`  ${this.givenDomainName}`);
        }

        this.serverless.cli.consoleLog(chalk.yellow("Distribution Domain Name"));
        this.serverless.cli.consoleLog(`  Target Domain: ${domainInfo.domainName}`);
        this.serverless.cli.consoleLog(`  Hosted Zone Id: ${domainInfo.hostedZoneId}`);
    }
}

export = ServerlessCustomDomain;

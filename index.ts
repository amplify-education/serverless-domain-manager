"use strict";

import chalk from "chalk";
import DomainInfo = require("./DomainInfo");
import { format } from "path";
import { Domain, endpointTypes } from "./domain";
import { ServerlessInstance, ServerlessOptions } from "./types";

const certStatuses = ["PENDING_VALIDATION", "ISSUED", "INACTIVE"];

class ServerlessCustomDomain {

    // AWS SDK resources
    public apigateway: any;
    public route53: any;
    public cloudformation: any;

    // Serverless specific properties
    public serverless: ServerlessInstance;
    public options: ServerlessOptions;
    public commands: object;
    public hooks: object;

    public domains: Domain[];

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
            "before:deploy:deploy": this.hookWrapper.bind(this, this.updateCloudFormationOutputs),
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

        await Promise.all(this.domains.map(async (domain) => {
            if (!domain.evaluateEnabled()) {
                this.serverless.cli.log(`serverless-domain-manager: Custom domain ${domain.DomainName} is disabled.`);
                return;
            } else {
                return await lifecycleFunc.call(this, domain);
            }
        }));
    }

    /**
     * Lifecycle function to create a domain
     * Wraps creating a domain and resource record set
     */
    public async createDomain(domain: Domain): Promise<void> {
        let domainInfo;
        try {
            domainInfo = await this.getDomainInfo(domain);
        } catch (err) {
            if (err.message !== `Error: ${domain.DomainName} not found.`) {
                throw err;
            }
        }
        if (!domainInfo) {
            domainInfo = await this.createCustomDomain(domain);
            await this.changeResourceRecordSet("UPSERT", domainInfo, domain);
            this.serverless.cli.log(
                `Custom domain ${domain.DomainName} was created.
            New domains may take up to 40 minutes to be initialized.`,
            );
        } else {
            this.serverless.cli.log(`Custom domain ${domain.DomainName} already exists.`);
        }
    }

    /**
     * Lifecycle function to delete a domain
     * Wraps deleting a domain and resource record set
     */
    public async deleteDomain(domain: Domain): Promise<void> {
        let domainInfo;
        try {
            domainInfo = await this.getDomainInfo(domain);
        } catch (err) {
            if (err.message === `Error: ${domain.DomainName} not found.`) {
                this.serverless.cli.log(`Unable to delete custom domain ${domain.DomainName}.`);
                return;
            }
            throw err;
        }
        await this.deleteCustomDomain(domain);
        await this.changeResourceRecordSet("DELETE", domainInfo, domain);
        this.serverless.cli.log(`Custom domain ${domain.DomainName} was deleted.`);
    }

    /**
     * Lifecycle function to add domain info to the CloudFormation stack's Outputs
     */
    public async updateCloudFormationOutputs(domain: Domain): Promise<void> {
        const domainInfo = await this.getDomainInfo(domain);
        this.addOutputs(domainInfo, domain);
    }

    /**
     * Lifecycle function to create basepath mapping
     * Wraps creation of basepath mapping and adds domain name info as output to cloudformation stack
     */
    public async setupBasePathMapping(domain: Domain): Promise<void> {
        // check if basepathmapping exists
        const restApiId = await this.getRestApiId(domain);
        const currentBasePath = await this.getBasePathMapping(restApiId, domain);
        // if basepath that matches restApiId exists, update; else, create
        if (!currentBasePath) {
            await this.createBasePathMapping(restApiId, domain);
        } else {
            await this.updateBasePathMapping(currentBasePath, domain);
        }
        const domainInfo = await this.getDomainInfo(domain);
        await this.printDomainSummary(domainInfo, domain);
    }

    /**
     * Lifecycle function to delete basepath mapping
     * Wraps deletion of basepath mapping
     */
    public async removeBasePathMapping(domain: Domain): Promise<void> {
        await this.deleteBasePathMapping(domain);
    }

    /**
     * Lifecycle function to print domain summary
     * Wraps printing of all domain manager related info
     */
    public async domainSummary(domain: Domain): Promise<void> {
        const domainInfo = await this.getDomainInfo(domain);
        if (domainInfo) {
            this.printDomainSummary(domainInfo, domain);
        } else {
            this.serverless.cli.log("Unable to print Serverless Domain Manager Summary");
        }
    }

    /**
     * Goes through custom domain property and initializes local variables and cloudformation template
     */
    public initializeVariables(): void {
        if (!this.evaluateEnabled()) {
            return;
        }

        const credentials = this.serverless.providers.aws.getCredentials();
        credentials.region = this.serverless.providers.aws.getRegion();

        this.serverless.providers.aws.sdk.config.update({maxRetries: 20});
        this.apigateway = new this.serverless.providers.aws.sdk.APIGateway(credentials);
        this.route53 = new this.serverless.providers.aws.sdk.Route53(credentials);
        this.cloudformation = new this.serverless.providers.aws.sdk.CloudFormation(credentials);

        if (this.serverless.service.custom.customDomains) {
            this.domains = this.serverless.service.custom.customDomains.map((domain) => {
                return new Domain(this.serverless, this.options, domain);
            });
        } else {
            this.domains = [
                new Domain(this.serverless, this.options, this.serverless.service.custom.customDomain),
            ];
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
            || ( typeof this.serverless.service.custom.customDomain === "undefined"
            && typeof this.serverless.service.custom.customDomains === "undefined")) {
            throw new Error("serverless-domain-manager: Plugin configuration is missing.");
        }
        return true;
    }

    /**
     * Gets Certificate ARN that most closely matches domain name OR given Cert ARN if provided
     */
    public async getCertArn(domain: Domain): Promise<string> {
        if (domain.CertificateARN) {
            this.serverless.cli.log(
                `Selected specific certificateArn ${domain.CertificateARN}`);
            return domain.CertificateARN;
        }

        let certificateArn; // The arn of the choosen certificate
        let certificateName = domain.CertificateName; // The certificate name
        try {
            let certificates = [];
            let nextToken;
            do {
                const certData = await domain.acm.listCertificates(
                    { CertificateStatuses: certStatuses, NextToken: nextToken }).promise();
                certificates = certificates.concat(certData.CertificateSummaryList);
                nextToken = certData.NextToken;
            } while (nextToken);

            // The more specific name will be the longest
            let nameLength = 0;

            // Checks if a certificate name is given
            if (certificateName != null) {
                const foundCertificate = certificates
                    .find((certificate) => (certificate.DomainName === certificateName));
                if (foundCertificate != null) {
                    certificateArn = foundCertificate.CertificateArn;
                }
            } else {
                certificateName = domain.DomainName;
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
    public async getDomainInfo(domain: Domain): Promise<DomainInfo> {
        let domainInfo;
        try {
            domainInfo = await this.apigateway.getDomainName({ domainName: domain.DomainName }).promise();
            return new DomainInfo(domainInfo);
        } catch (err) {
            this.logIfDebug(err);
            if (err.code === "NotFoundException") {
                throw new Error(`Error: ${domain.DomainName} not found.`);
            }
            throw new Error(`Error: Unable to fetch information about ${domain.DomainName}`);
        }
    }

    /**
     * Creates Custom Domain Name through API Gateway
     * @param certificateArn: Certificate ARN to use for custom domain
     */
    public async createCustomDomain(domain: Domain): Promise<DomainInfo> {
        // Set up parameters
        const certArn = await this.getCertArn(domain)
        const params = {
            certificateArn: certArn,
            domainName: domain.DomainName,
            endpointConfiguration: {
                types: [domain.EndpointType],
            },
            regionalCertificateArn: certArn,
            securityPolicy: domain.SecurityPolicy,
        };
        if (domain.EndpointType === endpointTypes.edge) {
            params.regionalCertificateArn = undefined;
        } else if (domain.EndpointType === endpointTypes.regional) {
            params.certificateArn = undefined;
        }

        // Make API call
        let createdDomain = {};
        try {
            createdDomain = await this.apigateway.createDomainName(params).promise();
        } catch (err) {
            this.logIfDebug(err);
            throw new Error(`Error: Failed to create custom domain ${domain.DomainName}\n`);
        }
        return new DomainInfo(createdDomain);
    }

    /**
     * Delete Custom Domain Name through API Gateway
     */
    public async deleteCustomDomain(domain: Domain): Promise<void> {
        const params = {
            domainName: domain.DomainName,
        };

        // Make API call
        try {
            await this.apigateway.deleteDomainName(params).promise();
        } catch (err) {
            this.logIfDebug(err);
            throw new Error(`Error: Failed to delete custom domain ${domain.DomainName}\n`);
        }
    }

    /**
     * Change A Alias record through Route53 based on given action
     * @param action: String descriptor of change to be made. Valid actions are ['UPSERT', 'DELETE']
     * @param domain: DomainInfo object containing info about custom domain
     */
    public async changeResourceRecordSet(action: string, info: DomainInfo, domain: Domain): Promise<void> {
        if (action !== "UPSERT" && action !== "DELETE") {
            throw new Error(`Error: Invalid action "${action}" when changing Route53 Record.
                Action must be either UPSERT or DELETE.\n`);
        }

        const createRoute53Record = domain.CreateRoute53Record;
        if (createRoute53Record !== undefined && createRoute53Record === false) {
            this.serverless.cli.log("Skipping creation of Route53 record.");
            return;
        }
        // Set up parameters
        const route53HostedZoneId = await this.getRoute53HostedZoneId(domain);
        const Changes = ["A", "AAAA"].map((Type) => ({
                Action: action,
                ResourceRecordSet: {
                    AliasTarget: {
                        DNSName: info.domainName,
                        EvaluateTargetHealth: false,
                        HostedZoneId: info.hostedZoneId,
                    },
                    Name: domain.DomainName,
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
            throw new Error(`Error: Failed to ${action} A Alias for ${domain.DomainName}\n`);
        }
    }

    /**
     * Gets Route53 HostedZoneId from user or from AWS
     */
    public async getRoute53HostedZoneId(domain: Domain): Promise<string> {
        if (domain.HostedZoneId) {
            this.serverless.cli.log(
                `Selected specific hostedZoneId ${domain.HostedZoneId}`);
            return domain.HostedZoneId;
        }

        const filterZone = domain.HostedZonePrivate !== undefined;
        if (filterZone && domain.HostedZonePrivate) {
            this.serverless.cli.log("Filtering to only private zones.");
        } else if (filterZone && !domain.HostedZonePrivate) {
            this.serverless.cli.log("Filtering to only public zones.");
        }

        let hostedZoneData;
        const givenDomainNameReverse = domain.DomainName.split(".").reverse();

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
                    if (!filterZone || domain.HostedZonePrivate === hostedZone.Config.PrivateZone) {
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
        throw new Error(`Error: Could not find hosted zone "${domain.DomainName}"`);
    }

    public async getBasePathMapping(restApiId: string, domain: Domain): Promise<string> {
        const params = {
            domainName: domain.DomainName,
        };
        let basepathInfo;
        let currentBasePath;
        try {
            basepathInfo = await this.apigateway.getBasePathMappings(params).promise();
        } catch (err) {
            this.logIfDebug(err);
            throw new Error(`Error: Unable to get BasePathMappings for ${domain.DomainName}`);
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
    public async createBasePathMapping(restApiId: string, domain: Domain): Promise<void> {
        const params = {
            basePath: domain.BasePath,
            domainName: domain.DomainName,
            restApiId,
            stage: domain.Stage,
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
    public async updateBasePathMapping(oldBasePath: string, domain: Domain): Promise<void> {
        const params = {
            basePath: oldBasePath,
            domainName: domain.DomainName,
            patchOperations: [
                {
                    op: "replace",
                    path: "/basePath",
                    value: domain.BasePath,
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
    public async getRestApiId(domain: Domain): Promise<string> {
        if (this.serverless.service.provider.apiGateway && this.serverless.service.provider.apiGateway.restApiId) {
            this.serverless.cli.log(`Mapping custom domain to existing API
                ${this.serverless.service.provider.apiGateway.restApiId}.`);
            return this.serverless.service.provider.apiGateway.restApiId;
        }
        const stackName = this.serverless.service.provider.stackName ||
            `${this.serverless.service.service}-${domain.Stage}`;
        const params = {
            LogicalResourceId: "ApiGatewayRestApi",
            StackName: stackName,
        };

        let response;
        try {
            response = await this.cloudformation.describeStackResource(params).promise();
        } catch (err) {
            this.logIfDebug(err);
            throw new Error(`Error: Failed to find CloudFormation resources for ${domain.DomainName}\n`);
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
    public async deleteBasePathMapping(domain: Domain): Promise<void> {
        const params = {
            basePath: domain.BasePath,
            domainName: domain.DomainName,
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
    public addOutputs(domainInfo: DomainInfo, domain: Domain): void {
        const service = this.serverless.service;
        if (!service.provider.compiledCloudFormationTemplate.Outputs) {
            service.provider.compiledCloudFormationTemplate.Outputs = {};
        }
        service.provider.compiledCloudFormationTemplate.Outputs.DistributionDomainName = {
            Value: domainInfo.domainName,
        };
        service.provider.compiledCloudFormationTemplate.Outputs.DomainName = {
            Value: domain.DomainName,
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
    private printDomainSummary(domainInfo: DomainInfo, domain: Domain): void {
        this.serverless.cli.consoleLog(chalk.yellow.underline("\nServerless Domain Manager Summary"));

        if (domain.CreateRoute53Record !== false) {
            this.serverless.cli.consoleLog(chalk.yellow("Domain Name"));
            this.serverless.cli.consoleLog(`  ${domain.DomainName}`);
        }

        this.serverless.cli.consoleLog(chalk.yellow("Distribution Domain Name"));
        this.serverless.cli.consoleLog(`  Target Domain: ${domainInfo.domainName}`);
        this.serverless.cli.consoleLog(`  Hosted Zone Id: ${domainInfo.hostedZoneId}`);
    }
}

export = ServerlessCustomDomain;

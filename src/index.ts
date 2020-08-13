"use strict";

import chalk from "chalk";
import DomainConfig = require("./DomainConfig");
import DomainInfo = require("./DomainInfo");
import Globals from "./Globals";
import { CustomDomain, ServerlessInstance, ServerlessOptions } from "./types";
import {getAWSPagedResults, sleep, throttledCall} from "./utils";

const certStatuses = ["PENDING_VALIDATION", "ISSUED", "INACTIVE"];

class ServerlessCustomDomain {

    // AWS SDK resources
    public apigateway: any;
    public apigatewayV2: any;
    public route53: any;
    public cloudformation: any;

    // Serverless specific properties
    public serverless: ServerlessInstance;
    public options: ServerlessOptions;
    public commands: object;
    public hooks: object;

    // Domain Manager specific properties
    public domains: DomainConfig[] = [];

    constructor(serverless: ServerlessInstance, options: ServerlessOptions) {
        this.serverless = serverless;
        Globals.serverless = serverless;

        this.options = options;
        Globals.options = options;

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
            "after:deploy:deploy": this.hookWrapper.bind(this, this.setupBasePathMappings),
            "after:info:info": this.hookWrapper.bind(this, this.domainSummaries),
            "before:deploy:deploy": this.hookWrapper.bind(this, this.createOrGetDomainForCfOutputs),
            "before:remove:remove": this.hookWrapper.bind(this, this.removeBasePathMappings),
            "create_domain:create": this.hookWrapper.bind(this, this.createDomains),
            "delete_domain:delete": this.hookWrapper.bind(this, this.deleteDomains),
        };
    }

    /**
     * Wrapper for lifecycle function, initializes variables and checks if enabled.
     * @param lifecycleFunc lifecycle function that actually does desired action
     */
    public async hookWrapper(lifecycleFunc: any) {

        this.initializeVariables();

        return await lifecycleFunc.call(this);
    }

    /**
     * Lifecycle function to create a domain
     * Wraps creating a domain and resource record set
     */
    public async createDomains(): Promise<void> {

        await this.getDomainInfo();

        await Promise.all(this.domains.map(async (domain) => {
            try {
                if (!domain.domainInfo) {

                    domain.certificateArn = await this.getCertArn(domain);

                    await this.createCustomDomain(domain);

                    await this.changeResourceRecordSet("UPSERT", domain);

                    this.serverless.cli.log(
                        `Custom domain ${domain.givenDomainName} was created.
                        New domains may take up to 40 minutes to be initialized.`,
                    );
                } else {
                    this.serverless.cli.log(`Custom domain ${domain.givenDomainName} already exists.`);
                }
            } catch (err) {
                this.logIfDebug(err, domain.givenDomainName);
                throw new Error(`Error: Unable to create domain ${domain.givenDomainName}`);
            }
        }));
    }

    /**
     * Lifecycle function to delete a domain
     * Wraps deleting a domain and resource record set
     */
    public async deleteDomains(): Promise<void> {

        await this.getDomainInfo();

        await Promise.all(this.domains.map(async (domain) => {
            try {
                if (domain.domainInfo) {
                    await this.deleteCustomDomain(domain);
                    await this.changeResourceRecordSet("DELETE", domain);
                    domain.domainInfo = undefined;
                    this.serverless.cli.log(`Custom domain ${domain.givenDomainName} was deleted.`);
                } else {
                    this.serverless.cli.log(`Custom domain ${domain.givenDomainName} does not exist.`);
                }
            } catch (err) {
                this.logIfDebug(err, domain.givenDomainName);
                throw new Error(`Error: Unable to delete domain ${domain.givenDomainName}`);
            }
        }));
    }

    /**
     * Lifecycle function to createDomain before deploy and add domain info to the CloudFormation stack's Outputs
     */
    public async createOrGetDomainForCfOutputs(): Promise<void> {
        await Promise.all(this.domains.map(async (domain) => {
            const autoDomain = domain.autoDomain;
            if (autoDomain === true) {
                this.serverless.cli.log("Creating domain name before deploy.");
                await this.createDomains();
            }

            await this.getDomainInfo();

            if (autoDomain === true) {
                const atLeastOneDoesNotExist = () => this.domains.some((d) => !d.domainInfo);
                const maxWaitFor = parseInt(domain.autoDomainWaitFor, 10) || 120;
                const pollInterval = 3;
                for (let i = 0; i * pollInterval < maxWaitFor && atLeastOneDoesNotExist() === true; i++) {
                    this.serverless.cli.log(`
                        Poll #${i + 1}: polling every ${pollInterval} seconds
                        for domain to exist or until ${maxWaitFor} seconds
                        have elapsed before starting deployment
                    `);

                    await sleep(pollInterval);
                    await this.getDomainInfo();
                }
            }
        }));

        await Promise.all(this.domains.map(async (domain) => {
            this.addOutputs(domain);
        }));
    }

    /**
     * Lifecycle function to create basepath mapping
     * Wraps creation of basepath mapping and adds domain name info as output to cloudformation stack
     */
    public async setupBasePathMappings(): Promise<void> {
        await Promise.all(this.domains.map(async (domain) => {
            try {
                domain.apiId = await this.getApiId(domain);

                domain.apiMapping = await this.getBasePathMapping(domain);

                await this.getDomainInfo();

                if (!domain.apiMapping) {
                    await this.createBasePathMapping(domain);
                } else {
                    await this.updateBasePathMapping(domain);
                }

            } catch (err) {
                this.logIfDebug(err, domain.givenDomainName);
                throw new Error(`Error: Unable to setup base domain mappings for ${domain.givenDomainName}`);
            }
        })).then(() => {
            // Print summary upon completion
            this.domains.forEach((domain) => {
                this.printDomainSummary(domain);
            });
        });
    }

    /**
     * Lifecycle function to delete basepath mapping
     * Wraps deletion of basepath mapping
     */
    public async removeBasePathMappings(): Promise<void> {
        await Promise.all(this.domains.map(async (domain) => {
            try {
                domain.apiId = await this.getApiId(domain);

                // Unable to find the corresponding API, manual clean up will be required
                if (!domain.apiId) {
                    this.serverless.cli.log(`Unable to find corresponding API for ${domain.givenDomainName},
                        API Mappings may need to be manually removed.`, "Serverless Domain Manager");
                } else {
                    domain.apiMapping = await this.getBasePathMapping(domain);
                    await this.deleteBasePathMapping(domain);
                }
            } catch (err) {
                if (err.message.indexOf("Failed to find CloudFormation") > -1) {
                    this.serverless.cli.log(`Unable to find Cloudformation Stack for ${domain.givenDomainName},
                        API Mappings may need to be manually removed.`, "Serverless Domain Manager");
                } else {
                    this.logIfDebug(err, domain.givenDomainName);
                    this.serverless.cli.log(`Error: Unable to remove base path mappings
                        for domain ${domain.givenDomainName}`);
                }
            }

            const autoDomain = domain.autoDomain;
            if (autoDomain === true) {
                this.serverless.cli.log("Deleting domain name after removing base path mapping.");
                await this.deleteDomains();
            }
        }));
    }

    /**
     * Lifecycle function to print domain summary
     * Wraps printing of all domain manager related info
     */
    public async domainSummaries(): Promise<void> {
        await this.getDomainInfo();

        this.domains.forEach((domain) => {
            if (domain.domainInfo) {
                this.printDomainSummary(domain);
            } else {
                this.serverless.cli.log(
                    `Unable to print Serverless Domain Manager Summary for ${domain.givenDomainName}`,
                );
            }
        });
    }

    /**
     * Goes through custom domain property and initializes local variables and cloudformation template
     */
    public initializeVariables(): void {

        // Make sure customDomain configuration exists, stop if not
        if (typeof this.serverless.service.custom === "undefined"
            || ( typeof this.serverless.service.custom.customDomain === "undefined"
                 && typeof this.serverless.service.custom.customDomains === "undefined" )) {
            throw new Error("serverless-domain-manager: Plugin configuration is missing.");
        }

        const credentials = this.serverless.providers.aws.getCredentials();
        credentials.region = this.serverless.providers.aws.getRegion();

        this.apigateway = new this.serverless.providers.aws.sdk.APIGateway(credentials);
        this.apigatewayV2 = new this.serverless.providers.aws.sdk.ApiGatewayV2(credentials);
        this.route53 = new this.serverless.providers.aws.sdk.Route53(credentials);
        this.cloudformation = new this.serverless.providers.aws.sdk.CloudFormation(credentials);

        // Loop over the domain configurations and populate the domains array with DomainConfigs
        this.domains = [];

        const customDomains: CustomDomain[] = this.serverless.service.custom.customDomains ?
                            this.serverless.service.custom.customDomains :
                            [ this.serverless.service.custom.customDomain ];

        customDomains.forEach((d) => {
             // If the key of the item in config is an api type it is using per api type domain structure
            if (Globals.apiTypes[Object.keys(d)[0]]) {
                for (const configApiType in d) {
                    if (Globals.apiTypes[configApiType]) { // If statement check to follow tslint
                        d[configApiType].apiType = configApiType;
                        this.domains.push(new DomainConfig(d[configApiType]));
                    } else {
                        throw Error(`Error: Invalid API Type, ${configApiType}`);
                    }
                }
            } else { // Default to single domain config
                this.domains.push(new DomainConfig(d));
            }
        });

        // Filter inactive domains
        this.domains = this.domains.filter((domain) => domain.enabled);

        // Validate the domain configurations
        this.validateDomainConfigs();
    }

    /**
     * Validates domain configs to make sure they are valid, ie HTTP api cannot be used with EDGE domain
     */
    public validateDomainConfigs() {
        this.domains.forEach((domain) => {

            // Show warning if allowPathMatching is set to true
            if (domain.allowPathMatching) {
                this.serverless.cli.log(`WARNING: "allowPathMatching" is set for ${domain.givenDomainName}.
                    This should only be used when migrating a path to a different API type. e.g. REST to HTTP.`);
            }

            if (domain.apiType === Globals.apiTypes.rest) {
                // Currently no validation for REST API types

            } else if (domain.apiType === Globals.apiTypes.http) { // Validation for http apis
                // HTTP Apis do not support edge domains
                if (domain.endpointType === Globals.endpointTypes.edge) {
                    throw Error(`Error: 'edge' endpointType is not compatible with HTTP APIs`);
                }

            } else if (domain.apiType === Globals.apiTypes.websocket) { // Validation for WebSocket apis
                // Websocket Apis do not support edge domains
                if (domain.endpointType === Globals.endpointTypes.edge) {
                    throw Error(`Error: 'edge' endpointType is not compatible with WebSocket APIs`);
                }
            }
        });
    }

    /**
     * Gets Certificate ARN that most closely matches domain name OR given Cert ARN if provided
     */
    public async getCertArn(domain: DomainConfig): Promise<string> {
        if (domain.certificateArn) {
            this.serverless.cli.log(`Selected specific certificateArn ${domain.certificateArn}`);
            return domain.certificateArn;
        }

        let certificateArn; // The arn of the selected certificate

        let certificateName = domain.certificateName; // The certificate name

        try {
            const certificates = await getAWSPagedResults(
                domain.acm,
                "listCertificates",
                "CertificateSummaryList",
                "NextToken",
                "NextToken",
                { CertificateStatuses: certStatuses },
            );

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
                certificateName = domain.givenDomainName;
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
            this.logIfDebug(err, domain.givenDomainName);
            throw Error(`Error: Could not list certificates in Certificate Manager.\n${err}`);
        }
        if (certificateArn == null) {
            throw Error(`Error: Could not find the certificate ${certificateName}.`);
        }
        return certificateArn;
    }

    /**
     * Populates the DomainInfo object on the Domains if custom domain in aws exists
     */
    public async getDomainInfo(): Promise<void> {
        await Promise.all(this.domains.map(async (domain) => {
            try {
                const domainInfo = await throttledCall(this.apigatewayV2, "getDomainName", {
                    DomainName: domain.givenDomainName,
                });

                domain.domainInfo = new DomainInfo(domainInfo);
            } catch (err) {
                this.logIfDebug(err, domain.givenDomainName);
                if (err.code !== "NotFoundException") {
                    throw new Error(`Error: Unable to fetch information about ${domain.givenDomainName}`);
                }
            }
        }));
    }

    /**
     * Creates Custom Domain Name through API Gateway
     * @param certificateArn: Certificate ARN to use for custom domain
     */
    public async createCustomDomain(domain: DomainConfig): Promise<void> {

        let createdDomain = {};

        // For EDGE domain name or TLS 1.0, create with APIGateway (v1)
        if (domain.endpointType === Globals.endpointTypes.edge || domain.securityPolicy === "TLS_1_0") {
            // Set up parameters
            const params = {
                domainName: domain.givenDomainName,
                endpointConfiguration: {
                    types: [domain.endpointType],
                },
                securityPolicy: domain.securityPolicy,
            };

            /* tslint:disable:no-string-literal */
            if (domain.endpointType === Globals.endpointTypes.edge) {
                params["certificateArn"] = domain.certificateArn;
            } else {
                params["regionalCertificateArn"] = domain.certificateArn;
            }
            /* tslint:enable:no-string-literal */

            // Make API call to create domain
            try {
                // Creating EDGE domain so use APIGateway (v1) service
                createdDomain = await throttledCall(this.apigateway, "createDomainName", params);
                domain.domainInfo = new DomainInfo(createdDomain);
            } catch (err) {
                this.logIfDebug(err, domain.givenDomainName);
                throw new Error(`Error: Failed to create custom domain ${domain.givenDomainName}\n`);
            }

        } else { // For Regional domain name create with ApiGatewayV2
            const params = {
                DomainName: domain.givenDomainName,
                DomainNameConfigurations: [{
                    CertificateArn: domain.certificateArn,
                    EndpointType: domain.endpointType,
                    SecurityPolicy: domain.securityPolicy,
                }],
            };

            // Make API call to create domain
            try {
                // Creating Regional domain so use ApiGatewayV2
                createdDomain = await throttledCall(this.apigatewayV2, "createDomainName", params);
                domain.domainInfo = new DomainInfo(createdDomain);
            } catch (err) {
                this.logIfDebug(err, domain.givenDomainName);
                throw new Error(`Error: Failed to create custom domain ${domain.givenDomainName}\n`);
            }
        }
    }

    /**
     * Delete Custom Domain Name through API Gateway
     */
    public async deleteCustomDomain(domain: DomainConfig): Promise<void> {
        // Make API call
        try {
            await throttledCall(this.apigatewayV2, "deleteDomainName", {
                DomainName: domain.givenDomainName,
            });
        } catch (err) {
            this.logIfDebug(err, domain.givenDomainName);
            throw new Error(`Error: Failed to delete custom domain ${domain.givenDomainName}\n`);
        }
    }

    /**
     * Change A Alias record through Route53 based on given action
     * @param action: String descriptor of change to be made. Valid actions are ['UPSERT', 'DELETE']
     * @param domain: DomainInfo object containing info about custom domain
     */
    public async changeResourceRecordSet(action: string, domain: DomainConfig): Promise<void> {
        if (action !== "UPSERT" && action !== "DELETE") {
            throw new Error(`Error: Invalid action "${action}" when changing Route53 Record.
                Action must be either UPSERT or DELETE.\n`);
        }

        const createRoute53Record = domain.createRoute53Record;
        if (createRoute53Record !== undefined && createRoute53Record === false) {
            this.serverless.cli.log(`Skipping ${action === "DELETE" ? "removal" : "creation"} of Route53 record.`);
            return;
        }
        // Set up parameters
        const route53HostedZoneId = await this.getRoute53HostedZoneId(domain);
        const Changes = ["A", "AAAA"].map((Type) => ({
                Action: action,
                ResourceRecordSet: {
                    AliasTarget: {
                        DNSName: domain.domainInfo.domainName,
                        EvaluateTargetHealth: false,
                        HostedZoneId: domain.domainInfo.hostedZoneId,
                    },
                    Name: domain.givenDomainName,
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
            await throttledCall(this.route53, "changeResourceRecordSets", params);
        } catch (err) {
            this.logIfDebug(err, domain.givenDomainName);
            throw new Error(`Error: Failed to ${action} A Alias for ${domain.givenDomainName}\n`);
        }
    }

    /**
     * Gets Route53 HostedZoneId from user or from AWS
     */
    public async getRoute53HostedZoneId(domain: DomainConfig): Promise<string> {
        if (domain.hostedZoneId) {
            this.serverless.cli.log(
                `Selected specific hostedZoneId ${domain.hostedZoneId}`);
            return domain.hostedZoneId;
        }

        const filterZone = domain.hostedZonePrivate !== undefined;
        if (filterZone && domain.hostedZonePrivate) {
            this.serverless.cli.log("Filtering to only private zones.");
        } else if (filterZone && !domain.hostedZonePrivate) {
            this.serverless.cli.log("Filtering to only public zones.");
        }

        let hostedZoneData;
        const givenDomainNameReverse = domain.givenDomainName.split(".").reverse();

        try {
            hostedZoneData = await throttledCall(this.route53, "listHostedZones", {});
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
            this.logIfDebug(err, domain.givenDomainName);
            throw new Error(`Error: Unable to list hosted zones in Route53.\n${err}`);
        }
        throw new Error(`Error: Could not find hosted zone "${domain.givenDomainName}"`);
    }

    public async getBasePathMapping(domain: DomainConfig): Promise<AWS.ApiGatewayV2.GetApiMappingResponse> {
        try {
            const mappings = await getAWSPagedResults(
                this.apigatewayV2,
                "getApiMappings",
                "Items",
                "NextToken",
                "NextToken",
                { DomainName: domain.givenDomainName },
            );
            for (const mapping of mappings) {
                if (mapping.ApiId === domain.apiId
                    || (mapping.ApiMappingKey === domain.basePath && domain.allowPathMatching) ) {
                    return mapping;
                }
            }
        } catch (err) {
            this.logIfDebug(err, domain.givenDomainName);
            throw new Error(`Error: Unable to get API Mappings for ${domain.givenDomainName}`);
        }
    }

    /**
     * Creates basepath mapping
     */
    public async createBasePathMapping(domain: DomainConfig): Promise<void> {
        // Use APIGateway (v1) for EDGE or TLS 1.0 domains
        if (domain.endpointType === Globals.endpointTypes.edge || domain.securityPolicy === "TLS_1_0") {
            const params = {
                basePath: domain.basePath,
                domainName: domain.givenDomainName,
                restApiId: domain.apiId,
                stage: domain.stage,
            };
            // Make API call
            try {
                await throttledCall(this.apigateway, "createBasePathMapping", params);
                this.serverless.cli.log(`Created API mapping '${domain.basePath}' for ${domain.givenDomainName}`);
            } catch (err) {
                this.logIfDebug(err, domain.givenDomainName);
                throw new Error(`Error: ${domain.givenDomainName}: Unable to create basepath mapping.\n`);
            }

        } else { // Use ApiGatewayV2 for Regional domains
            const params = {
                ApiId: domain.apiId,
                ApiMappingKey: domain.basePath,
                DomainName: domain.givenDomainName,
                Stage: domain.apiType === Globals.apiTypes.http ? "$default" : domain.stage,
            };
            // Make API call
            try {
                await throttledCall(this.apigatewayV2, "createApiMapping", params);
                this.serverless.cli.log(`Created API mapping '${domain.basePath}' for ${domain.givenDomainName}`);
            } catch (err) {
                this.logIfDebug(err, domain.givenDomainName);
                throw new Error(`Error: ${domain.givenDomainName}: Unable to create basepath mapping.\n`);
            }
        }
    }

    /**
     * Updates basepath mapping
     */
    public async updateBasePathMapping(domain: DomainConfig): Promise<void> {
        // Use APIGateway (v1) for EDGE or TLS 1.0 domains
        // check here if the EXISTING domain is using TLS 1.0 regardless of what is configured
        // We don't support updating custom domains so switching from TLS 1.0 to 1.2 will require recreating
        // the domain
        if (domain.endpointType === Globals.endpointTypes.edge || domain.domainInfo.securityPolicy === "TLS_1_0") {
            const params = {
                basePath: domain.apiMapping.ApiMappingKey || "(none)",
                domainName: domain.givenDomainName,
                patchOperations: [
                    {
                        op: "replace",
                        path: "/basePath",
                        value: domain.basePath,
                    },
                ],
            };

            // Make API call
            try {
                await throttledCall(this.apigateway, "updateBasePathMapping", params);
                this.serverless.cli.log(`Updated API mapping from '${domain.apiMapping.ApiMappingKey}'
                     to '${domain.basePath}' for ${domain.givenDomainName}`);
            } catch (err) {
                this.logIfDebug(err, domain.givenDomainName);
                throw new Error(`Error: ${domain.givenDomainName}: Unable to update basepath mapping.\n`);
            }

        } else { // Use ApiGatewayV2 for Regional domains

            const params = {
                ApiId: domain.apiId,
                ApiMappingId: domain.apiMapping.ApiMappingId,
                ApiMappingKey: domain.basePath,
                DomainName: domain.givenDomainName,
                Stage: domain.apiType === Globals.apiTypes.http ? "$default" : domain.stage,
            };

            // Make API call
            try {
                await throttledCall(this.apigatewayV2, "updateApiMapping", params);
                this.serverless.cli.log(`Updated API mapping to '${domain.basePath}' for ${domain.givenDomainName}`);
            } catch (err) {
                this.logIfDebug(err, domain.givenDomainName);
                throw new Error(`Error: ${domain.givenDomainName}: Unable to update basepath mapping.\n`);
            }
        }
    }

    /**
     * Gets rest API id from CloudFormation stack
     */
    public async getApiId(domain: DomainConfig): Promise<string> {
        if (this.serverless.service.provider.apiGateway && this.serverless.service.provider.apiGateway.restApiId) {
            this.serverless.cli.log(`Mapping custom domain to existing API
                ${this.serverless.service.provider.apiGateway.restApiId}.`);
            return this.serverless.service.provider.apiGateway.restApiId;
        }

        const stackName = this.serverless.service.provider.stackName ||
            `${this.serverless.service.service}-${domain.stage}`;

        let LogicalResourceId = "ApiGatewayRestApi";
        if (domain.apiType === Globals.apiTypes.http) {
            LogicalResourceId = "HttpApi";
        } else if (domain.apiType === Globals.apiTypes.websocket) {
            LogicalResourceId = "WebsocketsApi";
        }

        const params = {
            LogicalResourceId,
            StackName: stackName,
        };

        let response;
        try {
            response = await throttledCall(this.cloudformation, "describeStackResource", params);
        } catch (err) {
            this.logIfDebug(err, domain.givenDomainName);
            throw new Error(`Error: Failed to find CloudFormation resources for ${domain.givenDomainName}\n`);
        }

        const apiId = response.StackResourceDetail.PhysicalResourceId;
        if (!apiId) {
            throw new Error(`Error: No ApiId associated with CloudFormation stack ${stackName}`);
        }
        return apiId;
    }

    /**
     * Deletes basepath mapping
     */
    public async deleteBasePathMapping(domain: DomainConfig): Promise<void> {
        const params = {
            ApiMappingId: domain.apiMapping.ApiMappingId,
            DomainName: domain.givenDomainName,
        };

        // Make API call
        try {
            await throttledCall(this.apigatewayV2, "deleteApiMapping", params);
            this.serverless.cli.log("Removed basepath mapping.");
        } catch (err) {
            this.logIfDebug(err, domain.givenDomainName);
            this.serverless.cli.log(`Unable to remove basepath mapping for ${domain.givenDomainName}`);
        }
    }

    /**
     *  Adds the domain name and distribution domain name to the CloudFormation outputs
     */
    public addOutputs(domain: DomainConfig): void {
        const service = this.serverless.service;
        if (!service.provider.compiledCloudFormationTemplate.Outputs) {
            service.provider.compiledCloudFormationTemplate.Outputs = {};
        }

        // Defaults for REST and backwards compatibility
        let distributionDomainNameOutputKey = "DistributionDomainName";
        let domainNameOutputKey = "DomainName";
        let hostedZoneIdOutputKey = "HostedZoneId";

        if (domain.apiType === Globals.apiTypes.http) {
            distributionDomainNameOutputKey += "Http";
            domainNameOutputKey += "Http";
            hostedZoneIdOutputKey += "Http";

        } else if (domain.apiType === Globals.apiTypes.websocket) {
            distributionDomainNameOutputKey += "Websocket";
            domainNameOutputKey += "Websocket";
            hostedZoneIdOutputKey += "Websocket";
        }

        service.provider.compiledCloudFormationTemplate.Outputs[distributionDomainNameOutputKey] = {
            Value: domain.domainInfo.domainName,
        };

        service.provider.compiledCloudFormationTemplate.Outputs[domainNameOutputKey] = {
            Value: domain.givenDomainName,
        };

        if (domain.domainInfo.hostedZoneId) {
            service.provider.compiledCloudFormationTemplate.Outputs[hostedZoneIdOutputKey] = {
                Value: domain.domainInfo.hostedZoneId,
            };
        }
    }

    /**
     * Logs message if SLS_DEBUG is set
     * @param message message to be printed
     */
    public logIfDebug(message: any, domain?: string): void {
        if (process.env.SLS_DEBUG) {
            this.serverless.cli.log(`Error: ${domain ? domain + ": " : ""} ${message}`, "Serverless Domain Manager");
        }
    }

    /**
     * Prints out a summary of all domain manager related info
     */

    private printDomainSummary(domain: DomainConfig): void {
        this.serverless.cli.consoleLog(chalk.yellow.underline("\nServerless Domain Manager Summary"));

        this.serverless.cli.consoleLog(chalk.yellow("Distribution Domain Name"));
        this.serverless.cli.consoleLog(`  Domain Name: ${domain.givenDomainName}`);
        this.serverless.cli.consoleLog(`  Target Domain: ${domain.domainInfo.domainName}`);
        this.serverless.cli.consoleLog(`  Hosted Zone Id: ${domain.domainInfo.hostedZoneId}`);
    }
}

export = ServerlessCustomDomain;

"use strict";

import ACMWrapper = require("./aws/acm-wrapper");
import APIGatewayWrapper = require("./aws/api-gateway-wrapper");
import CloudFormationWrapper = require("./aws/cloud-formation-wrapper");
import Route53Wrapper = require("./aws/route53-wrapper");
import DomainConfig = require("./domain-config");
import Globals from "./globals";
import {CustomDomain, ServerlessInstance, ServerlessOptions, ServerlessUtils} from "./types";
import {sleep} from "./utils";

class ServerlessCustomDomain {

    // AWS SDK resources
    public apiGatewayWrapper: APIGatewayWrapper;
    public cloudFormationWrapper: CloudFormationWrapper;

    // Serverless specific properties
    public serverless: ServerlessInstance;
    public options: ServerlessOptions;
    public commands: object;
    public hooks: object;

    // Domain Manager specific properties
    public domains: DomainConfig[] = [];

    constructor(serverless: ServerlessInstance, options: ServerlessOptions, v3Utils?: ServerlessUtils) {
        this.serverless = serverless;
        Globals.serverless = serverless;

        this.options = options;
        Globals.options = options;

        if (v3Utils) {
            Globals.log = v3Utils.log
            Globals.progress = v3Utils.progress
        }

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

        const customConfig = this.serverless.service.custom;
        let basePathHook = "after:deploy:deploy";
        if (customConfig && customConfig.customDomain && customConfig.customDomain.setupOnPackaging) {
            basePathHook = "after:package:finalize";
        }

        this.hooks = {
            [basePathHook]: this.hookWrapper.bind(this, this.setupBasePathMappings),
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
        // check if `customDomain` or `customDomains` config exists
        this.validateConfigExists();
        // init config variables
        this.initializeVariables();
        // Validate the domain configurations
        this.validateDomainConfigs();
        // setup AWS resources
        this.initAWSResources();

        return lifecycleFunc.call(this);
    }

    /**
     * Validate if the plugin config exists
     */
    public validateConfigExists(): void {
        // Make sure customDomain configuration exists, stop if not
        const config = this.serverless.service.custom;
        const domainExists = config && typeof config.customDomain !== "undefined";
        const domainsExists = config && typeof config.customDomains !== "undefined";
        if (typeof config === "undefined" || (!domainExists && !domainsExists)) {
            throw new Error(`${Globals.pluginName}: Plugin configuration is missing.`);
        }
    }

    /**
     * Goes through custom domain property and initializes local variables and cloudformation template
     */
    public initializeVariables(): void {
        const config = this.serverless.service.custom;
        const domainConfig = config.customDomain ? [config.customDomain] : [];
        const domainsConfig = config.customDomains || [];
        const customDomains: CustomDomain[] = domainConfig.concat(domainsConfig);

        // Loop over the domain configurations and populate the domains array with DomainConfigs
        this.domains = [];
        customDomains.forEach((domain) => {
            const apiTypes = Object.keys(Globals.apiTypes);

            const configKeys = Object.keys(domain);
            // If the key of the item in config is an api type it is using per api type domain structure
            if (apiTypes.some((apiType) => configKeys.includes(apiType))) {
                // validate invalid api types
                const invalidApiTypes = configKeys.filter((configType) => !apiTypes.includes(configType));
                if (invalidApiTypes.length) {
                    throw Error(`Invalid API Type(s): ${invalidApiTypes}-${invalidApiTypes.join("; ")}`);
                }
                // init config for each type
                for (const configApiType of configKeys) {
                    const typeConfig = domain[configApiType];
                    typeConfig.apiType = configApiType;
                    this.domains.push(new DomainConfig(typeConfig));
                }
            } else { // Default to single domain config
                this.domains.push(new DomainConfig(domain));
            }
        });

        // Filter inactive domains
        this.domains = this.domains.filter((domain) => domain.enabled);
    }

    /**
     * Validates domain configs to make sure they are valid, ie HTTP api cannot be used with EDGE domain
     */
    public validateDomainConfigs() {
        this.domains.forEach((domain) => {

            // Show warning if allowPathMatching is set to true
            if (domain.allowPathMatching) {
                Globals.logWarning(`"allowPathMatching" is set for ${domain.givenDomainName}.
                    This should only be used when migrating a path to a different API type. e.g. REST to HTTP.`);
            }

            if (domain.apiType === Globals.apiTypes.rest) {
                // Currently no validation for REST API types

            } else if (domain.apiType === Globals.apiTypes.http) { // Validation for http apis
                // HTTP Apis do not support edge domains
                if (domain.endpointType === Globals.endpointTypes.edge) {
                    throw Error(`'edge' endpointType is not compatible with HTTP APIs`);
                }

            } else if (domain.apiType === Globals.apiTypes.websocket) { // Validation for WebSocket apis
                // Websocket Apis do not support edge domains
                if (domain.endpointType === Globals.endpointTypes.edge) {
                    throw Error(`'edge' endpointType is not compatible with WebSocket APIs`);
                }
            }
        });
    }

    /**
     * Setup AWS resources
     */
    public initAWSResources(): void {
        const credentials = this.serverless.providers.aws.getCredentials();
        credentials.region = this.serverless.providers.aws.getRegion();
        credentials.httpOptions = this.serverless.providers.aws.sdk.config.httpOptions;

        this.apiGatewayWrapper = new APIGatewayWrapper(credentials);
        this.cloudFormationWrapper = new CloudFormationWrapper(credentials);
    }

    /**
     * Lifecycle function to create a domain
     * Wraps creating a domain and resource record set
     */
    public async createDomains(): Promise<void> {
        await Promise.all(this.domains.map(async (domain) => {
            await this.createDomain(domain);
        }));
    }

    /**
     * Lifecycle function to create a domain
     * Wraps creating a domain and resource record set
     */
    public async createDomain(domain: DomainConfig): Promise<void> {
        domain.domainInfo = await this.apiGatewayWrapper.getCustomDomainInfo(domain);
        const creationProgress = Globals.log && Globals.progress.get(`create-${domain.givenDomainName}`);
        const route53 = new Route53Wrapper(domain.route53Profile, domain.route53Region);
        const acm = new ACMWrapper(domain.endpointType);
        try {
            if (!domain.domainInfo) {
                domain.certificateArn = await acm.getCertArn(domain);
                await this.apiGatewayWrapper.createCustomDomain(domain);
            } else {
                Globals.logInfo(`Custom domain ${domain.givenDomainName} already exists.`);
            }
            await route53.changeResourceRecordSet("UPSERT", domain);
            Globals.logInfo(
                `Custom domain ${domain.givenDomainName} was created.
                 New domains may take up to 40 minutes to be initialized.`
            );
        } catch (err) {
            Globals.logError(err, domain.givenDomainName);
            throw new Error(`Unable to create domain ${domain.givenDomainName}: ${err.message}`);
        } finally {
            if (creationProgress) {
                creationProgress.remove();
            }
        }

    }

    /**
     * Lifecycle function to delete a domain
     * Wraps deleting a domain and resource record set
     */
    public async deleteDomains(): Promise<void> {
        await Promise.all(this.domains.map(async (domain) => {
            await this.deleteDomain(domain);
        }));
    }

    /**
     * Wraps deleting a domain and resource record set
     */
    public async deleteDomain(domain: DomainConfig): Promise<void> {
        domain.domainInfo = await this.apiGatewayWrapper.getCustomDomainInfo(domain);
        const route53 = new Route53Wrapper(domain.route53Profile, domain.route53Region);
        try {
            if (domain.domainInfo) {
                await this.apiGatewayWrapper.deleteCustomDomain(domain);
                await route53.changeResourceRecordSet("DELETE", domain);
                domain.domainInfo = undefined;
                Globals.logInfo(`Custom domain ${domain.givenDomainName} was deleted.`);
            } else {
                Globals.logInfo(`Custom domain ${domain.givenDomainName} does not exist.`);
            }
        } catch (err) {
            Globals.logError(err, domain.givenDomainName);
            throw new Error(`Unable to delete domain ${domain.givenDomainName}`);
        }
    }

    /**
     * Lifecycle function to createDomain before deploy and add domain info to the CloudFormation stack's Outputs
     */
    public async createOrGetDomainForCfOutputs(): Promise<void> {
        await Promise.all(this.domains.map(async (domain) => {
            const autoDomain = domain.autoDomain;
            if (autoDomain === true) {
                Globals.logInfo("Creating domain name before deploy.");
                await this.createDomain(domain);
            }

            domain.domainInfo = await this.apiGatewayWrapper.getCustomDomainInfo(domain);

            if (autoDomain === true) {
                const atLeastOneDoesNotExist = () => this.domains.some((d) => !d.domainInfo);
                const maxWaitFor = parseInt(domain.autoDomainWaitFor, 10) || 120;
                const pollInterval = 3;
                for (let i = 0; i * pollInterval < maxWaitFor && atLeastOneDoesNotExist() === true; i++) {
                    Globals.logInfo(`
                        Poll #${i + 1}: polling every ${pollInterval} seconds
                        for domain to exist or until ${maxWaitFor} seconds
                        have elapsed before starting deployment
                    `);
                    await sleep(pollInterval);
                    domain.domainInfo = await this.apiGatewayWrapper.getCustomDomainInfo(domain);
                }
            }
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
                const mappings = await this.apiGatewayWrapper.getApiMappings(domain);
                const filteredMappings = mappings.filter((mapping) => {
                    return mapping.ApiId === domain.apiId || (
                        mapping.ApiMappingKey === domain.basePath && domain.allowPathMatching
                    )
                });
                domain.apiMapping = filteredMappings ? filteredMappings[0] : null;
                domain.domainInfo = await this.apiGatewayWrapper.getCustomDomainInfo(domain);

                if (!domain.apiMapping) {
                    await this.apiGatewayWrapper.createBasePathMapping(domain);
                } else {
                    await this.apiGatewayWrapper.updateBasePathMapping(domain);
                }

            } catch (err) {
                Globals.logError(err, domain.givenDomainName);
                throw new Error(`Unable to setup base domain mappings for ${domain.givenDomainName}`);
            }
        })).then(() => {
            // Print summary upon completion
            this.domains.forEach((domain) => {
                Globals.printDomainSummary(domain);
            });
        });
    }

    /**
     * Lifecycle function to delete basepath mapping
     * Wraps deletion of basepath mapping
     */
    public async removeBasePathMappings(): Promise<void> {
        await Promise.all(this.domains.map(async (domain) => {
            let externalBasePathExists = false;
            try {
                domain.apiId = await this.getApiId(domain);

                // Unable to find the corresponding API, manual clean up will be required
                if (!domain.apiId) {
                    Globals.logInfo(`Unable to find corresponding API for ${domain.givenDomainName},
                        API Mappings may need to be manually removed.`);
                } else {
                    const mappings = await this.apiGatewayWrapper.getApiMappings(domain);
                    const filteredMappings = mappings.filter((mapping) => {
                        return mapping.ApiId === domain.apiId || (
                            mapping.ApiMappingKey === domain.basePath && domain.allowPathMatching
                        )
                    });
                    if (domain.preserveExternalPathMappings) {
                        externalBasePathExists = mappings.length > filteredMappings.length;
                    }

                    domain.apiMapping = filteredMappings ? filteredMappings[0] : null;
                    await this.apiGatewayWrapper.deleteBasePathMapping(domain);
                }
            } catch (err) {
                if (err.message.indexOf("Failed to find CloudFormation") > -1) {
                    Globals.logInfo(`Unable to find Cloudformation Stack for ${domain.givenDomainName},
                        API Mappings may need to be manually removed.`);
                } else {
                    Globals.logError(err, domain.givenDomainName);
                    Globals.logError(
                        `Unable to remove base path mappings`, domain.givenDomainName, false,
                    );
                }
            }

            if (domain.autoDomain === true && !externalBasePathExists) {
                Globals.logInfo("Deleting domain name after removing base path mapping.");
                await this.deleteDomain(domain);
            }
        }));
    }

    /**
     * Lifecycle function to print domain summary
     * Wraps printing of all domain manager related info
     */
    public async domainSummaries(): Promise<void> {
        for (const domain of this.domains) {
            domain.domainInfo = await this.apiGatewayWrapper.getCustomDomainInfo(domain);
            if (domain.domainInfo) {
                Globals.printDomainSummary(domain);
            } else {
                Globals.logInfo(
                    `Unable to print ${Globals.pluginName} Summary for ${domain.givenDomainName}`,
                );
            }
        }
    }

    /**
     * Gets rest API id from existing config or CloudFormation stack
     */
    public async getApiId(domain: DomainConfig): Promise<string> {
        const apiGateway = this.serverless.service.provider.apiGateway || {};
        const apiIdKey = Globals.gatewayAPIIdKeys[domain.apiType];
        const apiId = apiGateway[apiIdKey];
        if (apiId) {
            // if string value exists return the value
            if (typeof apiId === "string") {
                Globals.logInfo(`Mapping custom domain to existing API  ${apiId}.`);
                return apiId;
            }
            // in case object and Fn::ImportValue try to get restApiId from the CloudFormation exports
            if (typeof apiId === "object" && apiId["Fn::ImportValue"]) {
                const importName = apiId["Fn::ImportValue"];
                let importValues;
                try {
                    importValues = await this.cloudFormationWrapper.getImportValues([importName]);
                } catch (err) {
                    Globals.logError(err, domain.givenDomainName);
                    throw new Error(`Failed to find CloudFormation ImportValue by ${importName}\n`);
                }
                if (!importValues[importName]) {
                    throw new Error(`CloudFormation ImportValue not found by ${importName}\n`);
                }
                return importValues[importName];
            }
            // throw an exception in case not supported restApiId
            throw new Error("Unsupported apiGateway.restApiId object");
        }

        const stackName = this.serverless.service.provider.stackName ||
            `${this.serverless.service.service}-${domain.stage}`;

        try {
            return await this.cloudFormationWrapper.getApiId(domain, stackName);
        } catch (err) {
            Globals.logError(err, domain.givenDomainName);
            throw new Error(`Failed to find CloudFormation resources for ${domain.givenDomainName}\n`);
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
            Export: {
                Name: `sls-${service.service}-${domain.stage}-${distributionDomainNameOutputKey}`,
            },
        };

        service.provider.compiledCloudFormationTemplate.Outputs[domainNameOutputKey] = {
            Value: domain.givenDomainName,
            Export: {
                Name: `sls-${service.service}-${domain.stage}-${domainNameOutputKey}`,
            },
        };

        if (domain.domainInfo.hostedZoneId) {
            service.provider.compiledCloudFormationTemplate.Outputs[hostedZoneIdOutputKey] = {
                Value: domain.domainInfo.hostedZoneId,
                Export: {
                    Name: `sls-${service.service}-${domain.stage}-${hostedZoneIdOutputKey}`,
                },
            };
        }
    }
}

export = ServerlessCustomDomain;

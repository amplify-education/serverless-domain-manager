"use strict";

import ACMWrapper = require("./aws/acm-wrapper");
import CloudFormationWrapper = require("./aws/cloud-formation-wrapper");
import Route53Wrapper = require("./aws/route53-wrapper");
import S3Wrapper = require("./aws/s3-wrapper");
import DomainConfig = require("./models/domain-config");
import Globals from "./globals";
import {CustomDomain, ServerlessInstance, ServerlessOptions, ServerlessUtils} from "./types";
import {sleep} from "./utils";
import APIGatewayV1Wrapper = require("./aws/api-gateway-v1-wrapper");
import APIGatewayV2Wrapper = require("./aws/api-gateway-v2-wrapper");
import APIGatewayBase = require("./models/apigateway-base");
import Logging from "./logging";
import {loadConfig} from "@aws-sdk/node-config-provider";
import {NODE_REGION_CONFIG_FILE_OPTIONS, NODE_REGION_CONFIG_OPTIONS} from "@aws-sdk/config-resolver";
import {ChangeAction} from "@aws-sdk/client-route-53";

class ServerlessCustomDomain {

    // AWS SDK resources
    public apiGatewayV1Wrapper: APIGatewayV1Wrapper;
    public apiGatewayV2Wrapper: APIGatewayV2Wrapper;
    public cloudFormationWrapper: CloudFormationWrapper;
    public s3Wrapper: S3Wrapper;

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

        if (v3Utils && v3Utils.log) {
            Globals.v3Utils = v3Utils;
        }

        /*eslint camelcase: ["error", {allow: ["create_domain", "delete_domain"]}]*/
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
        // check if `customDomain` or `customDomains` config exists
        this.validateConfigExists();
        // init config variables
        this.initializeVariables();
        // Validate the domain configurations
        this.validateDomainConfigs();
        // setup AWS resources
        await this.initSLSCredentials();
        await this.initAWSRegion();
        await this.initAWSResources();

        // start of the legacy AWS SDK V2 creds support
        // TODO: remove it in case serverless will add V3 support
        const domain = this.domains[0];
        if (domain) {
            try {
                await this.getApiGateway(domain).getCustomDomain(domain);
            } catch (error) {
                if (error.message.includes('Could not load credentials from any providers')) {
                    Globals.credentials = this.serverless.providers.aws.getCredentials();
                    await this.initAWSResources();
                }
            }
        }
        // end of the legacy AWS SDK V2 creds support

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
            // If the key of the item in config is an API type then using per API type domain structure
            let isTypeConfigFound = false;
            Object.keys(Globals.apiTypes).forEach((apiType) => {
                const domainTypeConfig = domain[apiType];
                if (domainTypeConfig) {
                    domainTypeConfig.apiType = apiType;
                    this.domains.push(new DomainConfig(domainTypeConfig));
                    isTypeConfigFound = true;
                }
            });

            if (!isTypeConfigFound) {
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
            if (domain.allowPathMatching) {
                Logging.logWarning(`"allowPathMatching" is set for ${domain.givenDomainName}.
                    This should only be used when migrating a path to a different API type. e.g. REST to HTTP.`);
            }

            if (domain.apiType === Globals.apiTypes.rest) {
                // Currently no validation for REST API types

            } else if (domain.apiType === Globals.apiTypes.http) {
                // HTTP APIs do not support edge domains
                if (domain.endpointType === Globals.endpointTypes.edge) {
                    // https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html
                    throw Error(
                        "'EDGE' endpointType is not compatible with HTTP APIs\n" +
                        "https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html"
                    );
                }

            } else if (domain.apiType === Globals.apiTypes.websocket) {
                // Websocket APIs do not support edge domains
                if (domain.endpointType === Globals.endpointTypes.edge) {
                    throw Error("'EDGE' endpointType is not compatible with WebSocket APIs");
                }
            }
        });
    }

    /**
     * Init AWS credentials based on sls `provider.profile`
     */
    public async initSLSCredentials(): Promise<void> {
        const slsProfile = Globals.options["aws-profile"] || Globals.serverless.service.provider.profile;
        Globals.credentials = slsProfile ? await Globals.getProfileCreds(slsProfile) : null;
    }

    /**
     * Init AWS current region based on Node options
     */
    public async initAWSRegion(): Promise<void> {
        try {
            Globals.currentRegion = await loadConfig(NODE_REGION_CONFIG_OPTIONS, NODE_REGION_CONFIG_FILE_OPTIONS)();
        } catch (err) {
            Logging.logInfo("Node region was not found.");
        }
    }

    /**
     * Setup AWS resources
     */
    public async initAWSResources(): Promise<void> {
        this.apiGatewayV1Wrapper = new APIGatewayV1Wrapper(Globals.credentials);
        this.apiGatewayV2Wrapper = new APIGatewayV2Wrapper(Globals.credentials);
        this.cloudFormationWrapper = new CloudFormationWrapper(Globals.credentials);
        this.s3Wrapper = new S3Wrapper(Globals.credentials);
    }

    public getApiGateway(domain: DomainConfig): APIGatewayBase {
        // 1. https://stackoverflow.com/questions/72339224/aws-v1-vs-v2-api-for-listing-apis-on-aws-api-gateway-return-different-data-for-t
        // 2. https://aws.amazon.com/blogs/compute/announcing-http-apis-for-amazon-api-gateway/
        // There are currently two API Gateway namespaces for managing API Gateway deployments.
        // The API V1 namespace represents REST APIs and API V2 represents WebSocket APIs and the new HTTP APIs.
        // You can create an HTTP API by using the AWS Management Console, CLI, APIs, CloudFormation, SDKs, or the Serverless Application Model (SAM).
        if (domain.apiType !== Globals.apiTypes.rest) {
            return this.apiGatewayV2Wrapper;
        }

        // multi-level base path mapping is supported by Gateway V2
        // https://github.com/amplify-education/serverless-domain-manager/issues/558
        // https://aws.amazon.com/blogs/compute/using-multiple-segments-in-amazon-api-gateway-base-path-mapping/
        if (domain.basePath.includes("/")) {
            return this.apiGatewayV2Wrapper;
        }

        return this.apiGatewayV1Wrapper;
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
        const creationProgress = Globals.v3Utils && Globals.v3Utils.progress.get(`create-${domain.givenDomainName}`);
        const route53Creds = domain.route53Profile ? await Globals.getProfileCreds(domain.route53Profile) : Globals.credentials;

        const apiGateway = this.getApiGateway(domain);
        const route53 = new Route53Wrapper(route53Creds, domain.route53Region);
        const acm = new ACMWrapper(Globals.credentials, domain.endpointType);

        domain.domainInfo = await apiGateway.getCustomDomain(domain);

        try {
            if (!domain.domainInfo) {
                if (domain.tlsTruststoreUri) {
                    await this.s3Wrapper.assertTlsCertObjectExists(domain);
                }
                if (!domain.certificateArn) {
                    const searchName = domain.certificateName || domain.givenDomainName;
                    Logging.logInfo(`Searching for a certificate with the '${searchName}' domain`);
                    domain.certificateArn = await acm.getCertArn(domain);
                }
                domain.domainInfo = await apiGateway.createCustomDomain(domain);
                Logging.logInfo(`Custom domain '${domain.givenDomainName}' was created.
                 New domains may take up to 40 minutes to be initialized.`);
            } else {
                Logging.logInfo(`Custom domain '${domain.givenDomainName}' already exists.`);
            }
            Logging.logInfo(`Creating/updating route53 record for '${domain.givenDomainName}'.`);
            await route53.changeResourceRecordSet(ChangeAction.UPSERT, domain);
        } catch (err) {
            throw new Error(`Unable to create domain '${domain.givenDomainName}':\n${err.message}`);
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
        const apiGateway = this.getApiGateway(domain);
        const route53Creds = domain.route53Profile ? await Globals.getProfileCreds(domain.route53Profile) : null;
        const route53 = new Route53Wrapper(route53Creds, domain.route53Region);

        domain.domainInfo = await apiGateway.getCustomDomain(domain);
        try {
            if (domain.domainInfo) {
                await apiGateway.deleteCustomDomain(domain);
                await route53.changeResourceRecordSet(ChangeAction.DELETE, domain);
                domain.domainInfo = null;
                Logging.logInfo(`Custom domain ${domain.givenDomainName} was deleted.`);
            } else {
                Logging.logInfo(`Custom domain ${domain.givenDomainName} does not exist.`);
            }
        } catch (err) {
            throw new Error(`Unable to delete domain '${domain.givenDomainName}':\n${err.message}`);
        }
    }

    /**
     * Lifecycle function to createDomain before deploy and add domain info to the CloudFormation stack's Outputs
     */
    public async createOrGetDomainForCfOutputs(): Promise<void> {
        await Promise.all(this.domains.map(async (domain) => {
            if (domain.autoDomain) {
                Logging.logInfo("Creating domain name before deploy.");
                await this.createDomain(domain);
            }

            const apiGateway = this.getApiGateway(domain);
            domain.domainInfo = await apiGateway.getCustomDomain(domain);

            if (domain.autoDomain) {
                const atLeastOneDoesNotExist = () => this.domains.some((d) => !d.domainInfo);
                const maxWaitFor = parseInt(domain.autoDomainWaitFor, 10) || 120;
                const pollInterval = 3;
                for (let i = 0; i * pollInterval < maxWaitFor && atLeastOneDoesNotExist() === true; i++) {
                    Logging.logInfo(`
                        Poll #${i + 1}: polling every ${pollInterval} seconds
                        for domain to exist or until ${maxWaitFor} seconds
                        have elapsed before starting deployment
                    `);
                    await sleep(pollInterval);
                    domain.domainInfo = await apiGateway.getCustomDomain(domain);
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
            domain.apiId = await this.cloudFormationWrapper.findApiId(domain.apiType);

            const apiGateway = this.getApiGateway(domain);
            const mappings = await apiGateway.getBasePathMappings(domain);

            const filteredMappings = mappings.filter((mapping) => {
                return mapping.apiId === domain.apiId || (
                    mapping.basePath === domain.basePath && domain.allowPathMatching
                );
            });
            domain.apiMapping = filteredMappings ? filteredMappings[0] : null;
            domain.domainInfo = await apiGateway.getCustomDomain(domain);

            if (!domain.apiMapping) {
                await apiGateway.createBasePathMapping(domain);
            } else {
                await apiGateway.updateBasePathMapping(domain);
            }
        })).finally(() => {
            Logging.printDomainSummary(this.domains);
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
                domain.apiId = await this.cloudFormationWrapper.findApiId(domain.apiType);
                // Unable to find the corresponding API, manual clean up will be required
                if (!domain.apiId) {
                    Logging.logInfo(`Unable to find corresponding API for '${domain.givenDomainName}',
                        API Mappings may need to be manually removed.`);
                } else {
                    const apiGateway = this.getApiGateway(domain);
                    const mappings = await apiGateway.getBasePathMappings(domain);
                    const filteredMappings = mappings.filter((mapping) => {
                        return mapping.apiId === domain.apiId || (
                            mapping.basePath === domain.basePath && domain.allowPathMatching
                        );
                    });
                    if (domain.preserveExternalPathMappings) {
                        externalBasePathExists = mappings.length > filteredMappings.length;
                    }
                    domain.apiMapping = filteredMappings ? filteredMappings[0] : null;
                    if (domain.apiMapping) {
                        await apiGateway.deleteBasePathMapping(domain);
                    } else {
                        Logging.logWarning(
                            `Api mapping was not found for '${domain.givenDomainName}'. Skipping base path deletion.`
                        );
                    }
                }
            } catch (err) {
                if (err.message.indexOf("Failed to find CloudFormation") > -1) {
                    Logging.logWarning(`Unable to find Cloudformation Stack for ${domain.givenDomainName},
                        API Mappings may need to be manually removed.`);
                } else {
                    Logging.logWarning(
                        `Unable to remove base path mappings for '${domain.givenDomainName}':\n${err.message}`
                    );
                }
            }

            if (domain.autoDomain === true && !externalBasePathExists) {
                Logging.logInfo("Deleting domain name after removing base path mapping.");
                await this.deleteDomain(domain);
            }
        }));
    }

    /**
     * Lifecycle function to print domain summary
     * Wraps printing of all domain manager related info
     */
    public async domainSummaries(): Promise<void> {
        await Promise.all(this.domains.map(async (domain) => {
            const apiGateway = this.getApiGateway(domain);
            domain.domainInfo = await apiGateway.getCustomDomain(domain);
        })).finally(() => {
            Logging.printDomainSummary(this.domains);
        });
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

        // for the CloudFormation stack we should use the `base` stage not the plugin custom stage
        // Remove all special characters
        const safeStage = Globals.getBaseStage().replace(/[^a-zA-Z\d]/g, "");
        service.provider.compiledCloudFormationTemplate.Outputs[domainNameOutputKey] = {
            Value: domain.givenDomainName,
            Export: {
                Name: `sls-${service.service}-${safeStage}-${domainNameOutputKey}`,
            },
        };

        if (domain.domainInfo) {
            service.provider.compiledCloudFormationTemplate.Outputs[distributionDomainNameOutputKey] = {
                Value: domain.domainInfo.domainName,
                Export: {
                    Name: `sls-${service.service}-${safeStage}-${distributionDomainNameOutputKey}`,
                },
            };
            service.provider.compiledCloudFormationTemplate.Outputs[hostedZoneIdOutputKey] = {
                Value: domain.domainInfo.hostedZoneId,
                Export: {
                    Name: `sls-${service.service}-${safeStage}-${hostedZoneIdOutputKey}`,
                },
            };
        }
    }
}

export = ServerlessCustomDomain;

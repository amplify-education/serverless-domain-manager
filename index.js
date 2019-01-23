"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const chalk_1 = require("chalk");
const DomainResponse = require("./DomainResponse");
const endpointTypes = {
    edge: "EDGE",
    regional: "REGIONAL",
};
class ServerlessCustomDomain {
    constructor(serverless, options) {
        this.serverless = serverless;
        this.options = options;
        this.initialized = false;
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
            "after:deploy:deploy": this.setupBasePathMapping.bind(this),
            "after:info:info": this.domainSummary.bind(this),
            "before:remove:remove": this.removeBasePathMapping.bind(this),
            "create_domain:create": this.createDomain.bind(this),
            "delete_domain:delete": this.deleteDomain.bind(this),
        };
    }
    /**
     * Lifecycle function to create a domain
     * Wraps creating a domain and resource record set
     */
    createDomain() {
        return __awaiter(this, void 0, void 0, function* () {
            this.initializeVariables();
            if (!this.enabled) {
                this.reportDisabled();
                return;
            }
            const certArn = yield this.getCertArn();
            const domainInfo = yield this.createCustomDomain(certArn);
            yield this.changeResourceRecordSet("UPSERT", domainInfo);
            this.serverless.cli.log(`Custom domain ${this.givenDomainName} was created/updated.
      New domains may take up to 40 minutes to be initialized.`);
        });
    }
    /**
     * Lifecycle function to delete a domain
     * Wraps deleting a domain and resource record set
     */
    deleteDomain() {
        return __awaiter(this, void 0, void 0, function* () {
            this.initializeVariables();
            if (!this.enabled) {
                this.reportDisabled();
                return;
            }
            const domainInfo = yield this.getDomainInfo();
            yield this.deleteCustomDomain();
            yield this.changeResourceRecordSet("DELETE", domainInfo);
            this.serverless.cli.log(`Custom domain ${this.givenDomainName} was deleted.`);
        });
    }
    /**
     * Lifecycle function to create basepath mapping
     * Wraps creation of basepath mapping and adds domain name info as output to cloudformation stack
     */
    setupBasePathMapping() {
        return __awaiter(this, void 0, void 0, function* () {
            this.initializeVariables();
            if (!this.enabled) {
                this.reportDisabled();
                return;
            }
            const basePathCreated = yield this.createBasePathMapping();
            const domainInfo = yield this.getDomainInfo();
            this.addOutputs(domainInfo);
            yield this.printDomainSummary(domainInfo);
            return basePathCreated;
        });
    }
    /**
     * Lifecycle function to delete basepath mapping
     * Wraps deletion of basepath mapping
     */
    removeBasePathMapping() {
        return __awaiter(this, void 0, void 0, function* () {
            this.initializeVariables();
            if (!this.enabled) {
                this.reportDisabled();
                return;
            }
            return yield this.deleteBasePathMapping();
        });
    }
    /**
     * Lifecycle function to print domain summary
     * Wraps printing of all domain manager related info
     */
    domainSummary() {
        return __awaiter(this, void 0, void 0, function* () {
            this.initializeVariables();
            if (!this.enabled) {
                this.reportDisabled();
                return;
            }
            const domainInfo = yield this.getDomainInfo();
            return this.printDomainSummary(domainInfo);
        });
    }
    /**
     * Goes through custom domain property and initializes local variables and cloudformation template
     */
    initializeVariables() {
        if (!this.initialized) {
            this.enabled = this.evaluateEnabled();
            if (this.enabled) {
                const credentials = this.serverless.providers.aws.getCredentials();
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
                this.acmRegion = this.endpointType === endpointTypes.regional ?
                    this.serverless.providers.aws.getRegion() : "us-east-1";
                const acmCredentials = Object.assign({}, credentials, { region: this.acmRegion });
                this.acm = new this.serverless.providers.aws.sdk.ACM(acmCredentials);
            }
            this.initialized = true;
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
    evaluateEnabled() {
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
        }
        else if (typeof enabled === "string" && enabled === "true") {
            return true;
        }
        else if (typeof enabled === "string" && enabled === "false") {
            return false;
        }
        throw new Error(`serverless-domain-manager: Ambiguous enablement boolean: "${enabled}"`);
    }
    reportDisabled() {
        this.serverless.cli.log("serverless-domain-manager: Custom domain is disabled.");
    }
    /**
     * Gets Certificate ARN that most closely matches domain name OR given Cert ARN if provided
     */
    getCertArn() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.serverless.service.custom.customDomain.certificateArn) {
                this.serverless.cli.log(`Selected specific certificateArn ${this.serverless.service.custom.customDomain.certificateArn}`);
                return this.serverless.service.custom.customDomain.certificateArn;
            }
            let certificateArn; // The arn of the choosen certificate
            let certificateName = this.serverless.service.custom.customDomain.certificateName; // The certificate name
            let certData;
            try {
                certData = yield this.acm.listCertificates({ CertificateStatuses: ["PENDING_VALIDATION", "ISSUED", "INACTIVE"] }).promise();
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
                }
                else {
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
            }
            catch (err) {
                throw Error(`Error: Could not list certificates in Certificate Manager.\n${err}`);
            }
            if (certificateArn == null) {
                throw Error(`Error: Could not find the certificate ${certificateName}.`);
            }
            return certificateArn;
        });
    }
    /**
     * Gets domain info as DomainResponse object if domain exists, otherwise returns false
     */
    getDomainInfo() {
        return __awaiter(this, void 0, void 0, function* () {
            let domainInfo;
            try {
                domainInfo = yield this.apigateway.getDomainName({ domainName: this.givenDomainName }).promise();
                return new DomainResponse(domainInfo);
            }
            catch (err) {
                throw new Error(`Error: Unable to fetch information about ${this.givenDomainName}`);
            }
        });
    }
    /**
     * Creates Custom Domain Name through API Gateway
     * @param certificateArn: Certificate ARN to use for custom domain
     */
    createCustomDomain(certificateArn) {
        return __awaiter(this, void 0, void 0, function* () {
            // Set up parameters
            const params = {
                certificateArn,
                domainName: this.givenDomainName,
                endpointConfiguration: {
                    types: [this.endpointType],
                },
                regionalCertificateArn: certificateArn,
            };
            if (this.endpointType === endpointTypes.edge) {
                params.regionalCertificateArn = undefined;
            }
            else if (this.endpointType === endpointTypes.regional) {
                params.certificateArn = undefined;
            }
            // Make API call
            let createdDomain = {};
            try {
                createdDomain = yield this.apigateway.createDomainName(params).promise();
            }
            catch (_a) {
                throw new Error(`Error: Failed to create custom domain ${this.givenDomainName}\n`);
            }
            return new DomainResponse(createdDomain);
        });
    }
    /**
     * Delete Custom Domain Name through API Gateway
     */
    deleteCustomDomain() {
        return __awaiter(this, void 0, void 0, function* () {
            const params = {
                domainName: this.givenDomainName,
            };
            // Make API call
            try {
                yield this.apigateway.deleteDomainName(params).promise();
            }
            catch (_a) {
                throw new Error(`Error: Failed to delete custom domain ${this.givenDomainName}\n`);
            }
        });
    }
    /**
     * Change A Alias record through Route53 based on given action
     * @param action: String descriptor of change to be made. Valid actions are ['UPSERT', 'DELETE']
     * @param domain: DomainResponse object containing info about custom domain
     */
    changeResourceRecordSet(action, domain) {
        return __awaiter(this, void 0, void 0, function* () {
            if (action !== "UPSERT" && action !== "DELETE") {
                throw new Error(`Error: Invalid action "${action}" when changing Route53 Record.
        Action must be either UPSERT or DELETE.\n`);
            }
            if (this.serverless.service.custom.customDomain.createRoute53Record !== undefined
                && this.serverless.service.custom.customDomain.createRoute53Record === false) {
                this.serverless.cli.log("Skipping creation of Route53 record.");
                return;
            }
            // Set up parameters
            const route53HostedZoneId = yield this.getRoute53HostedZoneId();
            const params = {
                ChangeBatch: {
                    Changes: [
                        {
                            Action: action,
                            ResourceRecordSet: {
                                AliasTarget: {
                                    DNSName: domain.domainName,
                                    EvaluateTargetHealth: false,
                                    HostedZoneId: domain.hostedZoneId,
                                },
                                Name: this.givenDomainName,
                                Type: "A",
                            },
                        },
                    ],
                    Comment: "Record created by serverless-domain-manager",
                },
                HostedZoneId: route53HostedZoneId,
            };
            // Make API call
            try {
                yield this.route53.changeResourceRecordSets(params).promise();
            }
            catch (err) {
                throw new Error(`Error: Failed to ${action} A Alias for ${this.givenDomainName}\n`);
            }
            return true;
        });
    }
    /**
     * Gets Route53 HostedZoneId from user or from AWS
     */
    getRoute53HostedZoneId() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.serverless.service.custom.customDomain.hostedZoneId) {
                this.serverless.cli.log(`Selected specific hostedZoneId ${this.serverless.service.custom.customDomain.hostedZoneId}`);
                return this.serverless.service.custom.customDomain.hostedZoneId;
            }
            const filterZone = this.hostedZonePrivate !== undefined;
            if (filterZone && this.hostedZonePrivate) {
                this.serverless.cli.log("Filtering to only private zones.");
            }
            else if (filterZone && !this.hostedZonePrivate) {
                this.serverless.cli.log("Filtering to only public zones.");
            }
            let hostedZoneData;
            const givenDomainNameReverse = this.givenDomainName.split(".").reverse();
            try {
                hostedZoneData = yield this.route53.listHostedZones({}).promise();
                const targetHostedZone = hostedZoneData.HostedZones
                    .filter((hostedZone) => {
                    let hostedZoneName;
                    if (hostedZone.Name.endsWith(".")) {
                        hostedZoneName = hostedZone.Name.slice(0, -1);
                    }
                    else {
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
            }
            catch (err) {
                throw new Error(`Error: Unable to list hosted zones in Route53.\n${err}`);
            }
            throw new Error(`Error: Could not find hosted zone "${this.givenDomainName}"`);
        });
    }
    /**
     * Creates basepath mapping
     */
    createBasePathMapping() {
        return __awaiter(this, void 0, void 0, function* () {
            const restApiId = yield this.getRestApiId();
            const params = {
                basePath: this.basePath,
                domainName: this.givenDomainName,
                restApiId,
                stage: this.stage,
            };
            // Make API call
            try {
                yield this.apigateway.createBasePathMapping(params).promise();
                this.serverless.cli.log("Created basepath mapping.");
            }
            catch (err) {
                throw new Error(`Error: Unable to create basepath mapping.\n`);
            }
            return true;
        });
    }
    /**
     * Gets rest API id from CloudFormation stack
     */
    getRestApiId() {
        return __awaiter(this, void 0, void 0, function* () {
            const params = {
                StackName: this.serverless.service.provider.stackName || `${this.serverless.service.service}-${this.stage}`,
            };
            let response;
            try {
                response = yield this.cloudformation.describeStackResources(params).promise();
            }
            catch (err) {
                throw new Error(`Error: Failed to find CloudFormation resources for ${this.givenDomainName}\n`);
            }
            const stackResources = response.StackResources.filter((element) => {
                return element.LogicalResourceId === "ApiGatewayRestApi";
            });
            return stackResources[0].PhysicalResourceId;
        });
    }
    /**
     * Deletes basepath mapping
     */
    deleteBasePathMapping() {
        return __awaiter(this, void 0, void 0, function* () {
            const params = {
                basePath: this.basePath,
                domainName: this.givenDomainName,
            };
            // Make API call
            try {
                yield this.apigateway.deleteBasePathMapping(params).promise();
                this.serverless.cli.log("Removed basepath mapping.");
            }
            catch (err) {
                throw new Error(`Error: Unable to delete basepath mapping.\n`);
            }
            return true;
        });
    }
    /**
     *  Adds the domain name and distribution domain name to the CloudFormation outputs
     */
    addOutputs(domainInfo) {
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
     * Prints out a summary of all domain manager related info
     */
    printDomainSummary(domainInfo) {
        this.serverless.cli.consoleLog(chalk_1.default.yellow.underline("Serverless Domain Manager Summary"));
        if (this.serverless.service.custom.customDomain.createRoute53Record !== false) {
            this.serverless.cli.consoleLog(chalk_1.default.yellow("Domain Name"));
            this.serverless.cli.consoleLog(`  ${this.givenDomainName}`);
        }
        this.serverless.cli.consoleLog(chalk_1.default.yellow("Distribution Domain Name"));
        this.serverless.cli.consoleLog(`  ${domainInfo.domainName}`);
        return true;
    }
}
module.exports = ServerlessCustomDomain;

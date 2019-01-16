'use strict';

import chalk from 'chalk';
import { ServerlessInstance, ServerlessOptions } from './types';

const endpointTypes = {
    edge: 'EDGE',
    regional: 'REGIONAL',
};

/**
 * Wrapper class for Custom Domain information
 */
class DomainResponse {
    /**
     * Sometimes, the getDomainName call doesn't return either a distributionHostedZoneId or a regionalHostedZoneId.
     * AFAICT, this only happens with edge-optimized endpoints. The hostedZoneId for these endpoints is always the one below.
     * Docs: https://docs.aws.amazon.com/general/latest/gr/rande.html#apigateway_region
     * PR: https://github.com/amplify-education/serverless-domain-manager/pull/171
     */
    defaultHostedZoneId:string = 'Z2FDTNDATAQYW2';

    domainName:string;
    hostedZoneId:string;

    constructor(data) {
        this.domainName = data.distributionDomainName || data.regionalDomainName;
        this.hostedZoneId = data.distributionHostedZoneId ||
            data.regionalHostedZoneId ||
            this.defaultHostedZoneId;
    }
}

class ServerlessCustomDomain {

    // Serverless specific properties
    serverless: ServerlessInstance;
    options: ServerlessOptions;
    commands: object;
    hooks: object;

    // Domain Manager specific properties
    initialized: boolean;
    enabled: boolean;
    givenDomainName: string;
    hostedZonePrivate: string;
    endpointType: string;
    basePath:string;
    stage: string;

    // AWS SDK resources
    apigateway: any;
    route53: any;
    acm: any;
    acmRegion: string;
    cloudformation: any;

    constructor(serverless: ServerlessInstance, options: ServerlessOptions) {
        this.serverless = serverless;
        this.options = options;
        this.initialized = false;

        this.commands = {
            create_domain: {
                usage: 'Creates a domain using the domain name defined in the serverless file',
                lifecycleEvents: [
                    'initialize',
                    'create',
                ],
            },
            delete_domain: {
                usage: 'Deletes a domain using the domain name defined in the serverless file',
                lifecycleEvents: [
                    'initialize',
                    'delete',
                ],
            },
        };
        this.hooks = {
            'create_domain:create': this.createDomain.bind(this),
            'delete_domain:delete': this.deleteDomain.bind(this),
            'after:deploy:deploy': this.setupBasePathMapping.bind(this),
            'before:remove:remove': this.removeBasePathMapping.bind(this),
            'after:info:info': this.domainSummary.bind(this),
        };
    }

    /**
     * Lifecycle function to create a domain
     * Wraps creating a domain and resource record set
     */
    async createDomain() {
        this.initializeVariables();
        if(!this.enabled) {
            this.reportDisabled();
            return;
        }
        const certArn = await this.getCertArn();
        if (!await this.getDomainInfo()) {
            const domainInfo = await this.createCustomDomain(certArn);
            await this.changeResourceRecordSet('UPSERT', domainInfo);
            this.serverless.cli.log(`Custom domain ${this.givenDomainName} created.`);
        }
        else {
            this.serverless.cli.log(`Custom domain ${this.givenDomainName} already exists.`);
        }
    }

    /**
     * Lifecycle function to delete a domain
     * Wraps deleting a domain and resource record set
     */
    async deleteDomain() {
        this.initializeVariables();
        if(!this.enabled) {
            this.reportDisabled();
            return;
        }
        const domainInfo = await this.getDomainInfo();
        await this.deleteCustomDomain();
        await this.changeResourceRecordSet('DELETE', domainInfo);
        this.serverless.cli.log(`Custom domain ${this.givenDomainName} was deleted.`);
    }

    /**
     * Lifecycle function to create basepath mapping
     * Wraps creation of basepath mapping and adds domain name info as output to cloudformation stack
     */
    async setupBasePathMapping() {
        this.initializeVariables();
        if(!this.enabled) {
            this.reportDisabled();
            return;
        }
        await this.createBasePathMapping();
        const domainInfo = await this.getDomainInfo();
        this.addOutputs(domainInfo);
        await this.printDomainSummary(domainInfo);
    }

    /**
     * Lifecycle function to delete basepath mapping
     * Wraps deletion of basepath mapping
     */
    async removeBasePathMapping() {
        this.initializeVariables();
        if(!this.enabled) {
            this.reportDisabled();
            return;
        }
        await this.deleteBasePathMapping();
    }

    /**
     * Lifecycle function to print domain summary
     * Wraps printing of all domain manager related info
     */
    async domainSummary() {
        this.initializeVariables();
        // make aws call to get domain name
        const domainInfo = await this.getDomainInfo();
        if (domainInfo) {
            this.printDomainSummary(domainInfo);
        }
    }


    /**
     * Goes through custom domain property and initializes local variables and cloudformation template
     */
    initializeVariables():void {
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
                if (basePath == null || basePath.trim() === '') {
                    basePath = '(none)';
                }
                this.basePath = basePath;
                let stage = this.serverless.service.custom.customDomain.stage;
                if (typeof stage === 'undefined') {
                    stage = this.options.stage || this.serverless.service.provider.stage;
                }
                this.stage = stage;

                const endpointTypeWithDefault = this.serverless.service.custom.customDomain.endpointType || endpointTypes.edge;
                const endpointTypeToUse = endpointTypes[endpointTypeWithDefault.toLowerCase()];
                if (!endpointTypeToUse) throw new Error(`${endpointTypeWithDefault} is not supported endpointType, use edge or regional.`);
                this.endpointType = endpointTypeToUse;


                this.acmRegion = this.endpointType === endpointTypes.regional ? this.serverless.providers.aws.getRegion() : 'us-east-1';
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
    evaluateEnabled():boolean {
        if (typeof this.serverless.service.custom === 'undefined'
            || typeof this.serverless.service.custom.customDomain === 'undefined') {
            throw new Error('serverless-domain-manager: Plugin configuration is missing.');
        }

        const enabled = this.serverless.service.custom.customDomain.enabled;
        if (enabled === undefined) {
            return true;
        }
        if (typeof enabled === 'boolean') {
            return enabled;
        } else if (typeof enabled === 'string' && enabled === 'true') {
            return true;
        } else if (typeof enabled === 'string' && enabled === 'false') {
            return false;
        }
        throw new Error(`serverless-domain-manager: Ambiguous enablement boolean: '${enabled}'`);
    }

    reportDisabled() {
        this.serverless.cli.log('serverless-domain-manager: Custom domain is disabled.');
    }

    /**
     * Gets Certificate ARN that most closely matches domain name OR given Cert ARN if provided
     */
    async getCertArn():Promise<string> {
        if (this.serverless.service.custom.customDomain.certificateArn) {
            this.serverless.cli.log(`Selected specific certificateArn ${this.serverless.service.custom.customDomain.certificateArn}`);
            return this.serverless.service.custom.customDomain.certificateArn;
        }

        const certArn = this.acm.listCertificates({ CertificateStatuses: ['PENDING_VALIDATION', 'ISSUED', 'INACTIVE'] }).promise();

        return certArn.catch((err) => {
            throw Error(`Error: Could not list certificates in Certificate Manager.\n${err}`);
        }).then((data) => {
            // The more specific name will be the longest
            let nameLength = 0;
            // The arn of the choosen certificate
            let certificateArn;
            // The certificate name
            let certificateName = this.serverless.service.custom.customDomain.certificateName;

            const certificates = data.CertificateSummaryList;

            // Checks if a certificate name is given
            if (certificateName != null) {
                const foundCertificate = certificates
                    .find(certificate => (certificate.DomainName === certificateName));

                if (foundCertificate != null) {
                    certificateArn = foundCertificate.CertificateArn;
                }
            } else {
                certificateName = this.givenDomainName;
                certificates.forEach((certificate) => {
                    let certificateListName = certificate.DomainName;

                    // Looks for wild card and takes it out when checking
                    if (certificateListName[0] === '*') {
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

            if (certificateArn == null) {
                throw Error(`Error: Could not find the certificate ${certificateName}.`);
            }
            return certificateArn;
        });
    }

    /**
     * Gets domain info as DomainResponse object if domain exists, otherwise returns false
     */
    async getDomainInfo():Promise<DomainResponse> {
        return this.apigateway.getDomainName({domainName: this.givenDomainName}).promise()
            .then((data, err) => {
                if(data) {
                    return new DomainResponse(data);
                } else if (err) {
                    return false;
                }
            })
            .catch(() => {return false;});
    }

    /**
     * Creates Custom Domain Name through API Gateway
     * @param certificateArn: Certificate ARN to use for custom domain
     */
    async createCustomDomain(certificateArn:string) {
        // Set up parameters
        const params = {
            certificateArn: certificateArn,
            domainName: this.givenDomainName,
            endpointConfiguration: {
                types: [this.endpointType]
            },
            regionalCertificateArn: certificateArn,
        };
        if (this.endpointType === endpointTypes.edge) {
            params.regionalCertificateArn = undefined;
        } else if (this.endpointType === endpointTypes.regional) {
            params.certificateArn = undefined;
        }

        // Make API call
        let created_domain = {};
        try {
            created_domain = await this.apigateway.createDomainName(params).promise();
        } catch {
            throw new Error(`Error: Failed to create custom domain ${this.givenDomainName}\n`);
        }
        return new DomainResponse(created_domain);
    }

    /**
     * Delete Custom Domain Name through API Gateway
     */
    async deleteCustomDomain():Promise<void> {
        const params = {
            domainName: this.givenDomainName,
        };

        // Make API call
        try {
            await this.apigateway.deleteDomainName(params).promise();
        } catch {
            throw new Error(`Error: Failed to delete custom domain ${this.givenDomainName}\n`);
        }
    }

    /**
     * Change A Alias record through Route53 based on given action
     * @param action: String descriptor of change to be made. Valid actions are ['UPSERT', 'DELETE']
     * @param domain: DomainResponse object containing info about custom domain
     */
    async changeResourceRecordSet(action:string, domain:DomainResponse):Promise<boolean|void> {
        if (action !== 'UPSERT' && action !== 'DELETE') {
            throw new Error(`Error: Invalid action "${action}" when changing Route53 Record. Action must be either UPSERT or DELETE.\n`);
        }

        if (this.serverless.service.custom.customDomain.createRoute53Record !== undefined
            && this.serverless.service.custom.customDomain.createRoute53Record === false) {
            this.serverless.cli.log('Skipping creation of Route53 record.');
            return;
        }
        // Set up parameters
        const route53HostedZoneId = await this.getRoute53HostedZoneId();
        const params = {
            ChangeBatch: {
                Changes: [
                    {
                        Action: action,
                        ResourceRecordSet: {
                            Name: this.givenDomainName,
                            Type: 'A',
                            AliasTarget: {
                                DNSName: domain.domainName,
                                EvaluateTargetHealth: false,
                                HostedZoneId: domain.hostedZoneId,
                            },
                        },
                    },
                ],
                Comment: 'Record created by serverless-domain-manager',
            },
            HostedZoneId: route53HostedZoneId,
        };
        // Make API call
        try {
            await this.route53.changeResourceRecordSets(params).promise();
        } catch (err) {
            throw new Error(`Error: Failed to ${action} A Alias for ${this.givenDomainName}\n`);
        }
        return true;
    }

    /**
     * Gets Route53 HostedZoneId from user or from AWS
     */
    async getRoute53HostedZoneId():Promise<string> {
        if (this.serverless.service.custom.customDomain.hostedZoneId) {
            this.serverless.cli.log(`Selected specific hostedZoneId ${this.serverless.service.custom.customDomain.hostedZoneId}`);
            return this.serverless.service.custom.customDomain.hostedZoneId;
        }

        const filterZone = this.hostedZonePrivate !== undefined;
        if (filterZone && this.hostedZonePrivate) {
            this.serverless.cli.log('Filtering to only private zones.');
        } else if (filterZone && !this.hostedZonePrivate) {
            this.serverless.cli.log('Filtering to only public zones.');
        }

        return this.route53.listHostedZones({}).promise()
            .catch((err) => {
                throw new Error(`Error: Unable to list hosted zones in Route53.\n${err}`);
            })
            .then((data) => {
                // Gets the hostzone that is closest match to the custom domain name
                const targetHostedZone = data.HostedZones
                    .filter((hostedZone) => {
                        const hostedZoneName = hostedZone.Name.endsWith('.') ? hostedZone.Name.slice(0, -1) : hostedZone.Name;
                        const privateFilter = filterZone ?
                            this.hostedZonePrivate === hostedZone.Config.PrivateZone : true;
                        return this.givenDomainName.endsWith(hostedZoneName) && privateFilter;
                    })
                    .sort((zone1, zone2) => zone2.Name.length - zone1.Name.length)
                    .shift();

                if (targetHostedZone) {
                    const hostedZoneId = targetHostedZone.Id;
                    // Extracts the hostzone Id
                    const startPos = hostedZoneId.indexOf('e/') + 2;
                    const endPos = hostedZoneId.length;
                    return hostedZoneId.substring(startPos, endPos);
                }
                throw new Error(`Error: Could not find hosted zone '${this.givenDomainName}'`);
            });
    }

    /**
     * Creates basepath mapping
     */
    async createBasePathMapping():Promise<boolean> {
        const restApiId = await this.getRestApiId();
        const params = {
            basePath: this.basePath,
            domainName: this.givenDomainName,
            restApiId: restApiId,
            stage: this.stage,
        };
        // Make API call
        try {
            await this.apigateway.createBasePathMapping(params).promise();
            this.serverless.cli.log('Created basepath mapping.');
        } catch (err) {
            throw new Error(`Error: Unable to create basepath mapping.\n`);
        }
        return true;
    }

    /**
     * Gets rest API id from CloudFormation stack
     */
    async getRestApiId():Promise<string> {
        const params = {
            StackName: this.serverless.service.provider.stackName || `${this.serverless.service.service}-${this.stage}`
        };

        let response;
        try {
            response = await this.cloudformation.describeStackResources(params).promise();
        } catch (err) {
            throw new Error(`Error: Failed to find CloudFormation resources for ${this.givenDomainName}\n`);
        }
        const stackResources = response.StackResources.filter((element) => {
            return element.LogicalResourceId === 'ApiGatewayRestApi';
        });
        return stackResources[0].PhysicalResourceId;
    }

    /**
     * Deletes basepath mapping
     */
    async deleteBasePathMapping():Promise<boolean> {
        const params = {
            basePath: this.basePath,
            domainName: this.givenDomainName,
        };
        // Make API call
        try {
            await this.apigateway.deleteBasePathMapping(params).promise();
            this.serverless.cli.log('Removed basepath mapping.');
        } catch (err) {
            throw new Error(`Error: Unable to delete basepath mapping.\n`);
        }
        return true;
    }

    /**
     *  Adds the domain name and distribution domain name to the CloudFormation outputs
     */
    addOutputs(domainInfo: DomainResponse):void {
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
    printDomainSummary(domainInfo:DomainResponse):void {
        this.serverless.cli.consoleLog(chalk.yellow.underline('Serverless Domain Manager Summary'));

        if (this.serverless.service.custom.customDomain.createRoute53Record !== false) {
            this.serverless.cli.consoleLog(chalk.yellow('Domain Name'));
            this.serverless.cli.consoleLog(`  ${this.givenDomainName}`);
        }

        this.serverless.cli.consoleLog(chalk.yellow('Distribution Domain Name'));
        this.serverless.cli.consoleLog(`  ${domainInfo.domainName}`);
    }
}

export = ServerlessCustomDomain

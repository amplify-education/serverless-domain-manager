'use strict';

const chalk = require('chalk');
const DomainResponse = require('./DomainResponse');


const endpointTypes = {
  edge: 'EDGE',
  regional: 'REGIONAL',
};


class ServerlessCustomDomain {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    // Indicate if variables are initialized to avoid run multiples init
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
      'delete_domain:delete': this.deleteDomain.bind(this),
      'create_domain:create': this.createDomain.bind(this),
      'before:deploy:deploy': this.setUpBasePathMapping.bind(this),
      'after:deploy:deploy': this.domainSummary.bind(this),
      'after:info:info': this.domainSummary.bind(this),
    };
  }

  initializeVariables() {
    if (!this.initialized) {
      this.enabled = this.evaluateEnabled();
      if (this.enabled) {
        const credentials = this.serverless.providers.aws.getCredentials();
        this.apigateway = new this.serverless.providers.aws.sdk.APIGateway(credentials);
        this.route53 = new this.serverless.providers.aws.sdk.Route53(credentials);
        this.setGivenDomainName(this.serverless.service.custom.customDomain.domainName);
        this.setHostedZonePrivate(this.serverless.service.custom.customDomain.hostedZonePrivate);
        this.setEndpointType(this.serverless.service.custom.customDomain.endpointType);
        this.setAcmRegion();
        const acmCredentials = Object.assign({}, credentials, { region: this.acmRegion });
        this.acm = new this.serverless.providers.aws.sdk.ACM(acmCredentials);
      }

      this.initialized = true;
    }
  }

  /**
   * Determines whether this plug-in should be enabled.
   *
   * This method reads the customDomain property "enabled" to see if this plug-in should be enabled.
   * If the property's value is undefined, a default value of true is assumed (for backwards
   * compatibility).
   * If the property's value is provided, this should be boolean, otherwise an exception is thrown.
   * If no customDomain object exists, an exception is thrown.
   */
  evaluateEnabled() {
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
    return Promise.resolve()
      .then(() => this.serverless.cli.log('serverless-domain-manager: Custom domain is disabled.'));
  }

  createDomain() {
    this.initializeVariables();
    if (!this.enabled) {
      return this.reportDisabled();
    }
    let domain = null;
    const createDomainName = this.getCertArn().then(data => this.createDomainName(data));
    return createDomainName
      .catch((err) => {
        throw new Error(`Error: '${this.givenDomainName}' was not created in API Gateway.\n${err}`);
      })
      .then((res) => {
        domain = res;
        return this.migrateRecordType(domain);
      })
      .then(() => this.changeResourceRecordSet(domain, 'UPSERT').catch((err) => {
        throw new Error(`Error: '${this.givenDomainName}' was not created in Route53.\n${err}`);
      }))
      .then(() => (this.serverless.cli.log(`'${this.givenDomainName}' was created/updated. New domains may take up to 40 minutes to be initialized.`)));
  }

  deleteDomain() {
    this.initializeVariables();
    if (!this.enabled) {
      return this.reportDisabled();
    }
    let domain = null;
    return this.getDomain().then((data) => {
      domain = data;
      return this.migrateRecordType(domain);
    })
      .then(() => {
        const promises = [
          this.changeResourceRecordSet(domain, 'DELETE'),
          this.clearDomainName(),
        ];
        return (Promise.all(promises).then(() => (this.serverless.cli.log('Domain was deleted.'))));
      })
      .catch((err) => {
        throw new Error(`Error: '${this.givenDomainName}' was not deleted.\n${err}`);
      });
  }

  setGivenDomainName(givenDomainName) {
    this.givenDomainName = givenDomainName;
  }

  setHostedZonePrivate(hostedZonePrivate) {
    this.hostedZonePrivate = hostedZonePrivate;
  }

  setEndpointType(endpointType) {
    const endpointTypeWithDefault = endpointType || endpointTypes.edge;
    const endpointTypeToUse = endpointTypes[endpointTypeWithDefault.toLowerCase()];
    if (!endpointTypeToUse) throw new Error(`${endpointTypeWithDefault} is not supported endpointType, use edge or regional.`);
    this.endpointType = endpointTypeToUse;
  }

  setAcmRegion() {
    if (this.endpointType === endpointTypes.regional) {
      this.acmRegion = this.serverless.providers.aws.getRegion();
    } else {
      this.acmRegion = 'us-east-1';
    }
  }

  setUpBasePathMapping() {
    this.initializeVariables();
    if (!this.enabled) {
      return this.reportDisabled();
    }
    let domain = null;
    return this.getDomain().then((data) => {
      domain = data;
      return this.migrateRecordType(domain);
    })
      .then(() => {
        const deploymentId = this.getDeploymentId();
        this.addResources(deploymentId);
        this.addOutputs(domain);
      })
      .catch((err) => {
        throw new Error(`Error: Could not set up basepath mapping. Try running sls create_domain first.\n${err}`);
      });
  }

  getRoute53HostedZoneId() {
    const specificId = this.serverless.service.custom.customDomain.hostedZoneId;
    if (specificId) {
      this.serverless.cli.log(`Selected specific hostedZoneId ${specificId}`);
      return Promise.resolve(specificId);
    }

    const filterZone = this.hostedZonePrivate !== undefined;
    if (filterZone && this.hostedZonePrivate) {
      this.serverless.cli.log('Filtering to only private zones.');
    } else if (filterZone && !this.hostedZonePrivate) {
      this.serverless.cli.log('Filtering to only public zones.');
    }

    const hostedZonePromise = this.route53.listHostedZones({}).promise();
    const givenDomainNameReverse = this.givenDomainName.split('.').reverse();

    return hostedZonePromise
      .catch((err) => {
        throw new Error(`Error: Unable to list hosted zones in Route53.\n${err}`);
      })
      .then((data) => {
        // Gets the hostzone that is closest match to the custom domain name
        const targetHostedZone = data.HostedZones
          .filter((hostedZone) => {
            const hostedZoneName = hostedZone.Name.endsWith('.') ? hostedZone.Name.slice(0, -1) : hostedZone.Name;
            if (!filterZone || this.hostedZonePrivate === hostedZone.Config.PrivateZone) {
              const hostedZoneNameReverse = hostedZoneName.split('.').reverse();

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
          const startPos = hostedZoneId.indexOf('e/') + 2;
          const endPos = hostedZoneId.length;
          return hostedZoneId.substring(startPos, endPos);
        }
        throw new Error(`Error: Could not find hosted zone '${this.givenDomainName}'`);
      });
  }

  /**
   * Prints out a summary of all domain manager related info
   */
  domainSummary() {
    this.initializeVariables();
    if (!this.enabled) {
      return this.reportDisabled();
    }
    return this.getDomain().then((data) => {
      this.serverless.cli.consoleLog(chalk.yellow.underline('Serverless Domain Manager Summary'));

      if (this.serverless.service.custom.customDomain.createRoute53Record !== false) {
        this.serverless.cli.consoleLog(chalk.yellow('Domain Name'));
        this.serverless.cli.consoleLog(`  ${this.givenDomainName}`);
      }

      this.serverless.cli.consoleLog(chalk.yellow('Distribution Domain Name'));
      this.serverless.cli.consoleLog(`  ${data.domainName}`);

      return true;
    }).catch((err) => {
      throw new Error(`Error: Domain manager summary logging failed.\n${err}`);
    });
  }

  /**
   * Gets the deployment id
   */
  getDeploymentId() {
    // Searches for the deployment id from the cloud formation template
    const cloudTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;

    const deploymentId = Object.keys(cloudTemplate.Resources).find((key) => {
      const resource = cloudTemplate.Resources[key];
      return resource.Type === 'AWS::ApiGateway::Deployment';
    });

    if (!deploymentId) {
      throw new Error('Cannot find AWS::ApiGateway::Deployment');
    }
    return deploymentId;
  }

  /**
   *  Adds the custom domain, stage, and basepath to the resource section
   *  @param  deployId    Used to set the timing for creating the basepath
   */
  addResources(deployId) {
    const service = this.serverless.service;

    if (!service.custom.customDomain) {
      throw new Error('Error: check that the customDomain section is defined in serverless.yml');
    }

    let basePath = service.custom.customDomain.basePath;

    // Check that basePath is either not set, or set to an empty string
    if (basePath == null || basePath.trim() === '') {
      basePath = '(none)';
    }

    let stage = service.custom.customDomain.stage;
    /*
    If stage is not provided, stage will be set based on the user specified value
    or the stage value of the provider section (which defaults to dev if unset)
    */
    if (typeof stage === 'undefined') {
      stage = this.options.stage || service.provider.stage;
    }

    const dependsOn = [deployId];

    // Verify the cloudFormationTemplate exists
    if (!service.provider.compiledCloudFormationTemplate) {
      this.serverless.service.provider.compiledCloudFormationTemplate = {};
    }

    if (!service.provider.compiledCloudFormationTemplate.Resources) {
      service.provider.compiledCloudFormationTemplate.Resources = {};
    }

    // If user define an ApiGatewayStage resources add it into the dependsOn array
    if (service.provider.compiledCloudFormationTemplate.Resources.ApiGatewayStage) {
      dependsOn.push('ApiGatewayStage');
    }

    let apiGatewayRef = { Ref: 'ApiGatewayRestApi' };

    // If user has specified an existing API Gateway API, then attach to that
    if (service.provider.apiGateway && service.provider.apiGateway.restApiId) {
      this.serverless.cli.log(`Mapping custom domain to existing API ${service.provider.apiGateway.restApiId}.`);
      apiGatewayRef = service.provider.apiGateway.restApiId;
    }

    // Creates the pathmapping
    const pathmapping = {
      Type: 'AWS::ApiGateway::BasePathMapping',
      DependsOn: dependsOn,
      Properties: {
        BasePath: basePath,
        DomainName: this.givenDomainName,
        RestApiId: apiGatewayRef,
        Stage: stage,
      },
    };

    // Creates and sets the resources
    service.provider.compiledCloudFormationTemplate.Resources.pathmapping = pathmapping;
  }

  /**
   *  Adds the domain name and distribution domain name to the CloudFormation outputs
   */
  addOutputs(data) {
    const service = this.serverless.service;
    if (!service.provider.compiledCloudFormationTemplate.Outputs) {
      service.provider.compiledCloudFormationTemplate.Outputs = {};
    }
    service.provider.compiledCloudFormationTemplate.Outputs.DomainName = {
      Value: data.domainName,
    };
    if (data.hostedZoneId) {
      service.provider.compiledCloudFormationTemplate.Outputs.HostedZoneId = {
        Value: data.hostedZoneId,
      };
    }
  }

  /*
   * Obtains the certification arn
   */
  getCertArn() {
    const specificCertificateArn = this.serverless.service.custom.customDomain.certificateArn;
    if (specificCertificateArn) {
      this.serverless.cli.log(`Selected specific certificateArn ${specificCertificateArn}`);
      return Promise.resolve(specificCertificateArn);
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
   *  Creates the domain name through the api gateway
   *  @param certificateArn   The certificate needed to create the new domain
   */
  createDomainName(givenCertificateArn) {
    const createDomainNameParams = {
      domainName: this.givenDomainName,
      endpointConfiguration: {
        types: [this.endpointType],
      },
    };

    if (this.endpointType === endpointTypes.edge) {
      createDomainNameParams.certificateArn = givenCertificateArn;
    } else if (this.endpointType === endpointTypes.regional) {
      createDomainNameParams.regionalCertificateArn = givenCertificateArn;
    }

    /* This will return the distributionDomainName (used in changeResourceRecordSet)
      if the domain name already exists, the distribution domain name will be returned */
    return this.getDomain()
      .catch(() => this.apigateway.createDomainName(createDomainNameParams).promise()
        .then(data => new DomainResponse(data)));
  }

  /**
   * Can create a new A Alias or delete a A Alias
   *
   * @param domain    The domain object contains the domainName and the hostedZoneId
   * @param action    UPSERT: Creates a A Alias
   *                  DELETE: Deletes the A Alias
   *                  The A Alias is specified in the serverless file under domainName
   */
  changeResourceRecordSet(domain, action) {
    if (action !== 'DELETE' && action !== 'UPSERT') {
      throw new Error(`Error: ${action} is not a valid action. action must be either UPSERT or DELETE`);
    }

    if (this.serverless.service.custom.customDomain.createRoute53Record !== undefined
      && this.serverless.service.custom.customDomain.createRoute53Record === false) {
      return Promise.resolve().then(() => (this.serverless.cli.log('Skipping creation of Route53 record.')));
    }

    return this.getRoute53HostedZoneId().then((route53HostedZoneId) => {
      if (!route53HostedZoneId) return null;

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

      return this.route53.changeResourceRecordSets(params).promise();
    }, () => {
      if (action === 'CREATE') {
        throw new Error(`Record set for ${this.givenDomainName} already exists.`);
      }
      throw new Error(`Record set for ${this.givenDomainName} does not exist and cannot be deleted.`);
    });
  }

  /**
   * Delete any legacy CNAME certificates, replacing them with A Alias records.
   * records.
   *
   * @param domain    The domain object contains the domainName and the hostedZoneId
   */
  migrateRecordType(domain) {
    if (this.serverless.service.custom.customDomain.createRoute53Record !== undefined
      && this.serverless.service.custom.customDomain.createRoute53Record === false) {
      return Promise.resolve();
    }

    return this.getRoute53HostedZoneId().then((route53HostedZoneId) => {
      if (!route53HostedZoneId) return null;

      const params = {
        ChangeBatch: {
          Changes: [
            {
              Action: 'DELETE',
              ResourceRecordSet: {
                Name: this.givenDomainName,
                ResourceRecords: [
                  {
                    Value: domain.domainName,
                  },
                ],
                TTL: 60,
                Type: 'CNAME',
              },
            },
            {
              Action: 'CREATE',
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

      const changeRecords = this.route53.changeResourceRecordSets(params).promise();
      return changeRecords.then(() => this.serverless.cli.log('Notice: Legacy CNAME record was replaced with an A Alias record'))
        .catch(() => { }); // Swallow the error, not an error if it doesn't exist
    });
  }

  /**
   * Deletes the domain names specified in the serverless file
   */
  clearDomainName() {
    return this.apigateway.deleteDomainName({
      domainName: this.givenDomainName,
    }).promise();
  }

  /*
   * Get information on domain
   */
  getDomain() {
    const getDomainNameParams = {
      domainName: this.givenDomainName,
    };

    return this.apigateway.getDomainName(getDomainNameParams).promise()
      .then(data => new DomainResponse(data), (err) => {
        throw new Error(`Error: '${this.givenDomainName}' could not be found in API Gateway.\n${err}`);
      });
  }
}

module.exports = ServerlessCustomDomain;

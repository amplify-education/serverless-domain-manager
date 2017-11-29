'use strict';

const AWS = require('aws-sdk');
const chalk = require('chalk');

/* Constant for the hosted zone of API Gateway CloudFront distributions.
   <http://docs.aws.amazon.com/general/latest/gr/rande.html#cf_region> */
const cloudfrontHostedZoneID = 'Z2FDTNDATAQYW2';

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
      'after:package:compileEvents': this.setUpBasePathMapping.bind(this),
      'after:deploy:deploy': this.domainSummary.bind(this),
      'after:info:info': this.domainSummary.bind(this),
    };
  }

  initializeVariables() {
    if (!this.initialized) {
      // Sets the credentials for AWS resources.
      const awsCreds = this.serverless.providers.aws.getCredentials();
      AWS.config.update(awsCreds);
      this.apigateway = new AWS.APIGateway();
      this.route53 = new AWS.Route53();
      this.setGivenDomainName(this.serverless.service.custom.customDomain.domainName);

      this.initialized = true;
    }
  }

  createDomain() {
    this.initializeVariables();
    let distDomainName = null;
    const createDomainName = this.getCertArn().then(data => this.createDomainName(data));
    return createDomainName
      .catch((err) => {
        throw new Error(`Error: '${this.givenDomainName}' was not created in API Gateway.\n${err}`);
      })
      .then((distributionDomainName) => {
        distDomainName = distributionDomainName;
        return this.migrateRecordType(distDomainName);
      })
      .then(() => {
        return this.changeResourceRecordSet(distDomainName, 'UPSERT').catch((err) => {
          throw new Error(`Error: '${this.givenDomainName}' was not created in Route53.\n${err}`);
        });
      })
      .then(() => (this.serverless.cli.log(`'${this.givenDomainName}' was created/updated. New domains may take up to 40 minutes to be initialized.`)));
  }

  deleteDomain() {
    this.initializeVariables();

    let distDomainName = null;
    return this.getDomain().then((data) => {
      distDomainName = data.distributionDomainName;
      return this.migrateRecordType(distDomainName);
    })
    .then(() => {
      const promises = [
        this.changeResourceRecordSet(distDomainName, 'DELETE'),
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
    this.targetHostedZoneName = this.givenDomainName.substring(this.givenDomainName.indexOf('.') + 1);
  }

  setUpBasePathMapping() {
    this.initializeVariables();

    return this.getDomain().then((data) => {
      const deploymentId = this.getDeploymentId();
      this.addResources(deploymentId);
      this.addOutputs(data);
    }).catch((err) => {
      throw new Error(`Error: Could not set up basepath mapping. Try running sls create_domain first.\n${err}`);
    });
  }

  /**
   * Prints out a summary of all domain manager related info
   */
  domainSummary() {
    this.initializeVariables();

    return this.getDomain().then((data) => {
      this.serverless.cli.consoleLog(chalk.yellow.underline('Serverless Domain Manager Summary'));
      if (this.serverless.service.custom.customDomain.createRoute53Record !== false) {
        this.serverless.cli.consoleLog(chalk.yellow('Domain Name'));
        this.serverless.cli.consoleLog(`  ${this.givenDomainName}`);
      }
      this.serverless.cli.consoleLog(chalk.yellow('Distribution Domain Name'));
      this.serverless.cli.consoleLog(`  ${data.distributionDomainName}`);
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

    // Base path cannot be empty, instead it must be (none)
    if (basePath.trim() === '') {
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

    // Creates the pathmapping
    const pathmapping = {
      Type: 'AWS::ApiGateway::BasePathMapping',
      DependsOn: dependsOn,
      Properties: {
        BasePath: basePath,
        DomainName: this.givenDomainName,
        RestApiId: {
          Ref: 'ApiGatewayRestApi',
        },
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
    service.provider.compiledCloudFormationTemplate.Outputs.DistributionDomainName = {
      Value: data.distributionDomainName,
    };
  }

  /*
   * Obtains the certification arn
   */
  getCertArn() {
    const acm = new AWS.ACM({
      region: 'us-east-1',
    });       // us-east-1 is the only region that can be accepted (3/21)

    const certArn = acm.listCertificates().promise();

    return certArn.catch((err) => {
      throw Error(`Error: Could not list certificates in Certificate Manager.\n${err}`);
    }).then((data) => {
      // The more specific name will be the longest
      let nameLength = 0;
      // The arn of the choosen certificate
      let certificateArn;
      // The certificate name
      let certificateName = this.serverless.service.custom.customDomain.certificateName;


      // Checks if a certificate name is given
      if (certificateName != null) {
        const foundCertificate = data.CertificateSummaryList
          .find(certificate => (certificate.DomainName === certificateName));

        if (foundCertificate != null) {
          certificateArn = foundCertificate.CertificateArn;
        }
      } else {
        certificateName = this.givenDomainName;
        data.CertificateSummaryList.forEach((certificate) => {
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
      certificateArn: givenCertificateArn,
    };

    /* This will return the distributionDomainName (used in changeResourceRecordSet)
      if the domain name already exists, the distribution domain name will be returned */
    return this.getDomain().then(data => data.distributionDomainName).catch(() => {
      const createDomain = this.apigateway.createDomainName(createDomainNameParams).promise();
      return createDomain.then(data => data.distributionDomainName);
    });
  }

  /*
   * Gets the HostedZoneId
   * @return hostedZoneId or null if not found or access denied
   */
  getHostedZoneId() {
    const hostedZonePromise = this.route53.listHostedZones({}).promise();

    return hostedZonePromise
      .catch((err) => {
        throw new Error(`Error: Unable to list hosted zones in Route53.\n${err}`);
      })
      .then((data) => {
        // Gets the hostzone that is closest match to the custom domain name
        const targetHostedZone = data.HostedZones
          .filter((hostedZone) => {
            const hostedZoneName = hostedZone.Name.endsWith('.') ? hostedZone.Name.slice(0, -1) : hostedZone.Name;
            return this.targetHostedZoneName.endsWith(hostedZoneName);
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
        throw new Error(`Error: Could not find hosted zone '${this.targetHostedZoneName}'`);
      });
  }

  /**
   * Can create a new A Alias or delete a A Alias
   *
   * @param distributionDomainName    the domain name of the cloudfront
   * @param action    UPSERT: Creates a A Alias
   *                  DELETE: Deletes the A Alias
   *                  The A Alias is specified in the serverless file under domainName
   */
  changeResourceRecordSet(distributionDomainName, action) {
    if (action !== 'DELETE' && action !== 'UPSERT') {
      throw new Error(`Error: ${action} is not a valid action. action must be either UPSERT or DELETE`);
    }

    if (this.serverless.service.custom.customDomain.createRoute53Record !== undefined
        && this.serverless.service.custom.customDomain.createRoute53Record === false) {
      return Promise.resolve().then(() => (this.serverless.cli.log('Skipping creation of Route53 record.')));
    }

    return this.getHostedZoneId().then((hostedZoneId) => {
      if (!hostedZoneId) {
        return null;
      }

      const params = {
        ChangeBatch: {
          Changes: [
            {
              Action: action,
              ResourceRecordSet: {
                Name: this.givenDomainName,
                Type: 'A',
                AliasTarget: {
                  DNSName: distributionDomainName,
                  EvaluateTargetHealth: false,
                  HostedZoneId: cloudfrontHostedZoneID,
                },
              },
            },
          ],
          Comment: 'Record created by serverless-domain-manager',
        },
        HostedZoneId: hostedZoneId,
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
   * @param distributionDomainName  The domain name of the Cloudfront Distribution
   */
  migrateRecordType(distributionDomainName) {
    if (this.serverless.service.custom.customDomain.createRoute53Record !== undefined
        && this.serverless.service.custom.customDomain.createRoute53Record === false) {
      return Promise.resolve();
    }

    return this.getHostedZoneId().then((hostedZoneId) => {
      if (!hostedZoneId) {
        return;
      }

      const params = {
        ChangeBatch: {
          Changes: [
            {
              Action: 'DELETE',
              ResourceRecordSet: {
                Name: this.givenDomainName,
                ResourceRecords: [
                  {
                    Value: distributionDomainName,
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
                  DNSName: distributionDomainName,
                  EvaluateTargetHealth: false,
                  HostedZoneId: cloudfrontHostedZoneID,
                },
              },
            },
          ],
          Comment: 'Record created by serverless-domain-manager',
        },
        HostedZoneId: hostedZoneId,
      };

      const changeRecords = this.route53.changeResourceRecordSets(params).promise();
      return changeRecords.then(() => this.serverless.cli.log('Notice: Legacy CNAME record was replaced with an A Alias record'))
        .catch(() => {}); // Swallow the error, not an error if it doesn't exist
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
    const getDomainPromise = this.apigateway.getDomainName(getDomainNameParams).promise();
    return getDomainPromise.then(data => (data), (err) => {
      throw new Error(`Error: '${this.givenDomainName}' could not be found in API Gateway.\n${err}`);
    });
  }
}

module.exports = ServerlessCustomDomain;

'use strict';

const chai = require('chai');
const AWS = require('aws-sdk-mock');
const aws = require('aws-sdk');
const certTestData = require('./test-cert-data.json');
const ServerlessCustomDomain = require('../index.js');

const expect = chai.expect;

const testCreds = {
  accessKeyId: 'test_key',
  secretAccessKey: 'test_secret',
  sessionToken: 'test_session',
};
const constructPlugin = (basepath, certName, stage) => {
  const serverless = {
    cli: { log(params) { return params; } },
    providers: {
      aws: {
        getCredentials: () => new aws.Credentials(testCreds),
      },
    },
    service: {
      provider: {
        region: 'us-moon-1',
        compiledCloudFormationTemplate: {
          Resources: {
            Deployment0: {
              Type: 'AWS::ApiGateway::Deployment',
            },
          },
        },
        stage: 'providerStage',
      },
      custom: {
        customDomain: {
          basePath: basepath,
          domainName: 'test_domain',
        },
      },
    },
  };

  if (certName) {
    serverless.service.custom.customDomain.certificateName = certName;
  }

  if (stage) {
    serverless.service.custom.customDomain.stage = 'test';
  }
  return new ServerlessCustomDomain(serverless, {});
};


describe('Custom Domain Plugin', () => {
  it('check aws config', () => {
    const plugin = constructPlugin({}, 'tests', true);
    plugin.initializeVariables();
    const returnedCreds = plugin.apigateway.config.credentials;
    expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
    expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
  });

  describe('Set Domain Name and Base Path', () => {
    const plugin = constructPlugin('test_basepath', null, true);
    let deploymentId = '';

    it('Find Deployment Id', () => {
      deploymentId = plugin.getDeploymentId();
      expect(deploymentId).to.equal('Deployment0');
    });

    it('Add Resources to Serverless Config', () => {
      plugin.addResources(deploymentId);
      const cfTemplat = plugin.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      expect(cfTemplat).to.not.equal(undefined);
    });

    it('(none) is added if empty basepath is given', () => {
      const emptyPlugin = constructPlugin('', null, true);
      emptyPlugin.addResources(deploymentId);
      const cf = emptyPlugin.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      expect(cf.pathmapping.Properties.BasePath).to.equal('(none)');
    });

    it('stage was not given', () => {
      const emptyStagePlugin = constructPlugin('');
      emptyStagePlugin.addResources(deploymentId);
      const cf = emptyStagePlugin.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      expect(cf.pathmapping.Properties.Stage).to.equal('providerStage');
    });
  });

  describe('Create a New Domain Name', () => {
    it('Get the certificate arn', async () => {
      AWS.mock('ACM', 'listCertificates', certTestData);

      const plugin = constructPlugin('', null, true);
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;


      const result = await plugin.getCertArn();

      expect(result).to.equal('test_arn');
    });

    it('Get a given certificate arn', async () => {
      AWS.mock('ACM', 'listCertificates', certTestData);

      const plugin = constructPlugin('', 'cert_name', true);

      const result = await plugin.getCertArn();

      expect(result).to.equal('test_given_arn');
    });

    it('Create a domain name', async () => {
      AWS.mock('APIGateway', 'createDomainName', (params, callback) => {
        callback(null, { distributionDomainName: 'foo' });
      });

      const plugin = constructPlugin(null, null, true);
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;


      const result = await plugin.createDomainName('fake_cert');

      expect(result).to.equal('foo');
    });


    it('Create a new CNAME', async () => {
      AWS.mock('Route53', 'listHostedZones', (params, callback) => {
        callback(null, { HostedZones: [{ Name: 'test_domain', Id: 'test_id' }] });
      });
      AWS.mock('Route53', 'changeResourceRecordSets', (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin('test_basepath', null, true);
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;


      const result = await plugin.changeResourceRecordSet('test_distribution_name', 'CREATE');
      const changes = result.ChangeBatch.Changes[0];
      expect(changes.Action).to.equal('CREATE');
      expect(changes.ResourceRecordSet.Name).to.equal('test_domain');
      expect(changes.ResourceRecordSet.ResourceRecords[0].Value).to.equal('test_distribution_name');
    });

    afterEach(() => {
      AWS.restore();
    });
  });

  describe('Delete the new domain', () => {
    it('Find available domains', async () => {
      AWS.mock('APIGateway', 'getDomainName', (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin('test_basepath', null, true);
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;

      const result = await plugin.getDomain();

      expect(result.domainName).to.equal('test_domain');
    });

    it('Delete CNAME', async () => {
      AWS.mock('Route53', 'listHostedZones', (params, callback) => {
        callback(null, { HostedZones: [{ Name: 'test_domain', Id: 'test_id' }] });
      });
      AWS.mock('Route53', 'changeResourceRecordSets', (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin('test_basepath', null, true);
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;

      const result = await plugin.changeResourceRecordSet('test_distribution_name', 'DELETE');
      const changes = result.ChangeBatch.Changes[0];
      expect(changes.Action).to.equal('DELETE');
      expect(changes.ResourceRecordSet.Name).to.equal('test_domain');
      expect(changes.ResourceRecordSet.ResourceRecords[0].Value).to.equal('test_distribution_name');
    });

    it('Delete the domain name', async () => {
      AWS.mock('APIGateway', 'deleteDomainName', (params, callback) => {
        callback(null, {});
      });

      const plugin = constructPlugin('test_basepath', null, true);
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;

      const result = await plugin.clearDomainName();
      expect(result).to.eql({});
    });

    afterEach(() => {
      AWS.restore();
    });
  });

  describe('Hook Methods', () => {
    it('setupBasePathMapping', async () => {
      AWS.mock('APIGateway', 'getDomainName', (params, callback) => {
        callback(null, params);
      });
      const plugin = constructPlugin('', null, true);
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;

      await plugin.setUpBasePathMapping();
      const cfTemplat = plugin.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      expect(cfTemplat).to.not.equal(undefined);
    });

    it('deleteDomain', async () => {
      AWS.mock('APIGateway', 'getDomainName', (params, callback) => {
        callback(null, { domainName: 'test_domain', distributionDomainName: 'test_distribution' });
      });
      AWS.mock('APIGateway', 'deleteDomainName', (params, callback) => {
        callback(null, {});
      });
      AWS.mock('Route53', 'listHostedZones', (params, callback) => {
        callback(null, { HostedZones: [{ Name: 'test_domain', Id: 'test_id' }] });
      });
      AWS.mock('Route53', 'changeResourceRecordSets', (params, callback) => {
        callback(null, params);
      });
      const plugin = constructPlugin(null, null, true);
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;
      plugin.route53 = new aws.Route53();
      const results = await plugin.deleteDomain();
      expect(results).to.equal('Domain was deleted.');
    });

    it('createDomain', async () => {
      AWS.mock('ACM', 'listCertificates', certTestData);
      AWS.mock('APIGateway', 'createDomainName', (params, callback) => {
        callback(null, { distributionDomainName: 'foo' });
      });
      AWS.mock('Route53', 'listHostedZones', (params, callback) => {
        callback(null, { HostedZones: [{ Name: 'test_domain', Id: 'test_id' }] });
      });
      AWS.mock('Route53', 'changeResourceRecordSets', (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin('', null, true);
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;
      plugin.route53 = new aws.Route53();
      const result = await plugin.createDomain();
      expect(result).to.equal('Domain was created, may take up to 40 mins to be initialized.');
    });

    afterEach(() => {
      AWS.restore();
    });
  });

  describe('Error Catching', () => {
    it('If a certificate cannot be found when a name is given', () => {
      AWS.mock('ACM', 'listCertificates', certTestData);

      const plugin = constructPlugin('', 'does_not_exist', true);

      return plugin.getCertArn().then(() => {
        throw new Error('Test has failed. getCertArn did not catch errors.');
      }).catch((err) => {
        const expectedErrorMessage = 'Could not find the certificate does_not_exist';
        expect(err.message).to.equal(expectedErrorMessage);
      });
    });
  });
});

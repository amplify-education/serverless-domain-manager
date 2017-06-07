'use strict';

const chai = require('chai');
const AWS = require('aws-sdk-mock');
const certTestData = require('./test-cert-data.json');
const ServerlessCustomDomain = require('../index.js');

const expect = chai.expect;

const constructPlugin = (basepath, certName) => {
  const serverless = {
    cli: { log(params) { return params; } },
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
      },
      custom: {
        customDomain: {
          basePath: basepath,
          domainName: 'test_domain',
          stage: 'test',
          certificateName: certName,
        },
      },
    },
  };
  const serverlessFile = new ServerlessCustomDomain(serverless, {});
  serverlessFile.givenDomainName = serverless.service.custom.customDomain.domainName;
  return serverlessFile;
};

const constructPluginWithoutCertName = (basepath) => {
  const serverless = {
    cli: { log(params) { return params; } },
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
      },
      custom: {
        customDomain: {
          basePath: basepath,
          domainName: 'test_domain',
          stage: 'test',
        },
      },
    },
  };
  const serverlessFile = new ServerlessCustomDomain(serverless, {});
  serverlessFile.givenDomainName = serverless.service.custom.customDomain.domainName;
  return serverlessFile;
};

describe('Custom Domain Plugin', () => {
  it('this.givenDomainName is set', () => {
    const plugin = constructPlugin('test_basepath');

    plugin.setGivenDomainName();
    expect(plugin.givenDomainName).to.equal('test_domain');
  });

  describe('Set Domain Name and Base Path', () => {
    const plugin = constructPlugin('test_basepath');
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
      const emptyPlugin = constructPlugin('');
      emptyPlugin.addResources(deploymentId);
      const cf = emptyPlugin.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      expect(cf.pathmapping.Properties.BasePath).to.equal('(none)');
    });
  });

  describe('Create a New Domain Name', () => {
    it('Get the certificate arn', async () => {
      AWS.mock('ACM', 'listCertificates', certTestData);

      const plugin = constructPluginWithoutCertName('');

      const result = await plugin.getCertArn();

      expect(result).to.equal('test_arn');
    });

    it('Get a given certificate arn', async () => {
      AWS.mock('ACM', 'listCertificates', certTestData);

      const plugin = constructPlugin('', 'cert_name');

      const result = await plugin.getCertArn();

      expect(result).to.equal('test_given_arn');
    });

    it('Create a domain name', async () => {
      AWS.mock('APIGateway', 'createDomainName', (params, callback) => {
        callback(null, { distributionDomainName: 'foo' });
      });

      const plugin = constructPlugin();

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

      const plugin = constructPlugin('test_basepath');

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

      const plugin = constructPlugin('test_basepath');

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

      const plugin = constructPlugin('test_basepath');

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

      const plugin = constructPlugin('test_basepath');
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
      const plugin = constructPlugin('');

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
      const plugin = constructPlugin();
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

      const plugin = constructPluginWithoutCertName('');
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

      const plugin = constructPlugin('', 'does_not_exist');

      return plugin.getCertArn().then(() => {
        throw new Error('Test has failed. getCertArn did not catch errors.');
      }).catch((err) => {
        const expectedErrorMessage = 'Could not find the certificate does_not_exist';
        expect(err.message).to.equal(expectedErrorMessage);
      });
    });
  });
});

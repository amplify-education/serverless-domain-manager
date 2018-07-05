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

const constructPlugin =
  (basepath, certName, stage, createRecord, endpointType, enabled, certArn) => {
    aws.config.update(testCreds);

    const serverless = {
      cli: {
        log(params) { return params; },
        consoleLog(params) {
          return params;
        },
      },
      providers: {
        aws: {
          getCredentials: () => new aws.Credentials(testCreds),
          getRegion: () => 'eu-west-1',
          sdk: {
            APIGateway: aws.APIGateway,
            ACM: aws.ACM,
            Route53: aws.Route53,
          },
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
            endpointType,
          },
        },
      },
    };

    if (certName) {
      serverless.service.custom.customDomain.certificateName = certName;
    }

    if (certArn) {
      serverless.service.custom.customDomain.certificateArn = certArn;
    }

    if (stage) {
      serverless.service.custom.customDomain.stage = 'test';
    }

    if (!createRecord) {
      serverless.service.custom.customDomain.createRoute53Record = createRecord;
    }

    if (enabled !== undefined) {
      serverless.service.custom.customDomain.enabled = enabled;
    }

    return new ServerlessCustomDomain(serverless, {});
  };


describe('Custom Domain Plugin', () => {
  it('check aws config', () => {
    const plugin = constructPlugin({}, 'tests', true, true);
    expect(plugin.initialized).to.equal(false);

    plugin.initializeVariables();

    const returnedCreds = plugin.apigateway.config.credentials;
    expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
    expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
    expect(plugin.initialized).to.equal(true);
  });

  describe('Domain Endpoint types', () => {
    it('Unsupported endpoint types throw exception', () => {
      const plugin = constructPlugin({}, 'tests', true, true, 'notSupported');
      expect(plugin.initialized).to.equal(false);

      let errored = false;
      try {
        plugin.initializeVariables();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal('notSupported is not supported endpointType, use edge or regional.');
      }
      expect(errored).to.equal(true);
    });
  });

  describe('Set Domain Name and Base Path', () => {
    const plugin = constructPlugin('test_basepath', null, true, true);
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

    it('Add Domain Name, Distribution Name and Regional Name to stack output', () => {
      plugin.addOutputs({
        domainName: 'fake_domain',
        distributionDomainName: 'fake_dist_name',
        regionalDomainName: 'fake_regional_name',
      });
      const cfTemplat = plugin.serverless.service.provider.compiledCloudFormationTemplate.Outputs;
      expect(cfTemplat).to.not.equal(undefined);
    });

    it('(none) is added if basepath is an empty string', () => {
      const emptyPlugin = constructPlugin('', null, true, true);
      emptyPlugin.addResources(deploymentId);
      const cf = emptyPlugin.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      expect(cf.pathmapping.Properties.BasePath).to.equal('(none)');
    });

    it('(none) is added if no value is given for basepath (null)', () => {
      const emptyPlugin = constructPlugin(null, null, true, true);
      emptyPlugin.addResources(deploymentId);
      const cf = emptyPlugin.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      expect(cf.pathmapping.Properties.BasePath).to.equal('(none)');
    });

    it('(none) is added if basepath attribute is missing (undefined)', () => {
      const emptyPlugin = constructPlugin(undefined, null, true, true);
      emptyPlugin.addResources(deploymentId);
      const cf = emptyPlugin.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      expect(cf.pathmapping.Properties.BasePath).to.equal('(none)');
    });

    it('stage was not given', () => {
      const noStagePlugin = constructPlugin('');
      noStagePlugin.addResources(deploymentId);
      const cf = noStagePlugin.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      expect(cf.pathmapping.Properties.Stage).to.equal('providerStage');
    });
  });

  describe('Create a New Domain Name', () => {
    it('Get a given certificate arn', async () => {
      AWS.mock('ACM', 'listCertificates', certTestData);

      const plugin = constructPlugin('', null, true, true, 'REGIONAL', true, 'test_given_arn');
      plugin.acm = new aws.ACM();

      const result = await plugin.getCertArn();

      expect(result).to.equal('test_given_arn');
    });

    it('Get a given certificate name', async () => {
      AWS.mock('ACM', 'listCertificates', certTestData);

      const plugin = constructPlugin('', 'cert_name', true, true);
      plugin.acm = new aws.ACM();

      const result = await plugin.getCertArn();

      expect(result).to.equal('test_given_cert_name');
    });

    it('Create a domain name', async () => {
      AWS.mock('APIGateway', 'createDomainName', (params, callback) => {
        callback(null, { distributionDomainName: 'foo' });
      });

      const plugin = constructPlugin(null, null, true, true);
      plugin.apigateway = new aws.APIGateway();
      plugin.setGivenDomainName(plugin.serverless.service.custom.customDomain.domainName);

      const result = await plugin.createDomainName('fake_cert');

      expect(result.domainName).to.equal('foo');
    });

    it('Migrate legacy CNAME records to A Alias', async () => {
      AWS.mock('Route53', 'listHostedZones', (params, callback) => {
        callback(null, { HostedZones: [{ Name: 'test_domain', Id: 'test_id', Config: { PrivateZone: false } }] });
      });

      AWS.mock('Route53', 'changeResourceRecordSets', (params, callback) => {
        const changes = params.ChangeBatch.Changes;
        expect(changes[0].Action).to.equal('DELETE');
        expect(changes[0].ResourceRecordSet.Type).to.equal('CNAME');
        expect(changes[0].ResourceRecordSet.Name).to.equal('test_domain');
        expect(changes[0].ResourceRecordSet.ResourceRecords[0].Value).to.equal('test_distribution_name');

        expect(changes[1].Action).to.equal('CREATE');
        expect(changes[1].ResourceRecordSet.Type).to.equal('A');
        expect(changes[1].ResourceRecordSet.Name).to.equal('test_domain');
        expect(changes[1].ResourceRecordSet.AliasTarget.DNSName).to.equal('test_distribution_name');
        callback(null, null);
      });
      const plugin = constructPlugin('test_basepath', null, true, true);
      plugin.route53 = new aws.Route53();
      plugin.setGivenDomainName(plugin.serverless.service.custom.customDomain.domainName);
      await plugin.migrateRecordType({ domainName: 'test_distribution_name', hostedZoneId: 'test_id' });
    });

    it('Create a new A Alias Record', async () => {
      AWS.mock('Route53', 'listHostedZones', (params, callback) => {
        callback(null, { HostedZones: [{ Name: 'test_domain', Id: 'test_id', Config: { PrivateZone: false } }] });
      });

      AWS.mock('Route53', 'changeResourceRecordSets', (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin('test_basepath', null, true, true);
      plugin.route53 = new aws.Route53();
      plugin.setGivenDomainName(plugin.serverless.service.custom.customDomain.domainName);

      const domain = { domainName: 'test_distribution_name', hostedZoneId: 'test_id' };

      const result = await plugin.changeResourceRecordSet(domain, 'UPSERT');
      const changes = result.ChangeBatch.Changes[0];
      expect(changes.Action).to.equal('UPSERT');
      expect(changes.ResourceRecordSet.Name).to.equal('test_domain');
      expect(changes.ResourceRecordSet.AliasTarget.DNSName).to.equal('test_distribution_name');
    });

    it('Do not create a Route53 record', async () => {
      const plugin = constructPlugin(null, null, true, false);
      const result = await plugin.changeResourceRecordSet('test_distribution_name', 'UPSERT');
      expect(result).to.equal('Skipping creation of Route53 record.');
    });

    afterEach(() => {
      AWS.restore();
    });
  });


  describe('Resource ApiGatewayStage overridden', () => {
    const deploymentId = '';
    it('serverless.yml doesn\'t define explicitly the resource ApiGatewayStage', () => {
      const plugin = constructPlugin('');
      plugin.addResources(deploymentId);
      const cf = plugin.serverless.service.provider.compiledCloudFormationTemplate.Resources;

      expect(cf.pathmapping.DependsOn).to.be.an('array').to.have.lengthOf(1);
    });

    it('serverless.yml defines explicitly the resource ApiGatewayStage', () => {
      const plugin = constructPlugin('');
      const cf = plugin.serverless.service.provider.compiledCloudFormationTemplate.Resources;

      // Fake the property ApiGatewayStage
      cf.ApiGatewayStage = {
        Type: 'AWS::ApiGateway::Stage',
        Properties: {},
      };

      plugin.addResources(deploymentId);
      expect(cf.pathmapping.DependsOn).to.be.an('array').to.have.lengthOf(2);
      expect(cf.pathmapping.DependsOn).to.include('ApiGatewayStage');
    });
  });

  describe('Provider apiGateway is set', () => {
    const deploymentId = '';
    it('serverless.yml doesn\'t define explicitly the apiGateway', () => {
      const plugin = constructPlugin('');
      plugin.addResources(deploymentId);
      const cf = plugin.serverless.service.provider.compiledCloudFormationTemplate.Resources;

      expect(cf.pathmapping.Properties.RestApiId).to.deep.equal({ Ref: 'ApiGatewayRestApi' });
    });

    it('serverless.yml defines explicitly the apiGateway', () => {
      const plugin = constructPlugin('');

      // Fake the serverless config apiGateway
      plugin.serverless.service.provider.apiGateway = { restApiId: 'apigatewayref' };

      const cf = plugin.serverless.service.provider.compiledCloudFormationTemplate.Resources;

      plugin.addResources(deploymentId);
      expect(cf.pathmapping.Properties.RestApiId).to.equal('apigatewayref');
    });
  });

  describe('Delete the new domain', () => {
    it('Find available domains', async () => {
      AWS.mock('APIGateway', 'getDomainName', (params, callback) => {
        callback(null, { distributionDomainName: 'test_domain' });
      });

      const plugin = constructPlugin('test_basepath', null, true, true);
      plugin.apigateway = new aws.APIGateway();
      plugin.setGivenDomainName(plugin.serverless.service.custom.customDomain.domainName);

      const result = await plugin.getDomain();

      expect(result.domainName).to.equal('test_domain');
    });

    it('Delete A Alias Record', async () => {
      AWS.mock('Route53', 'listHostedZones', (params, callback) => {
        callback(null, { HostedZones: [{ Name: 'test_domain', Id: 'test_id', Config: { PrivateZone: false } }] });
      });

      AWS.mock('Route53', 'changeResourceRecordSets', (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin('test_basepath', null, true, true);
      plugin.route53 = new aws.Route53();
      plugin.setGivenDomainName(plugin.serverless.service.custom.customDomain.domainName);

      const domain = { domainName: 'test_distribution_name', hostedZoneId: 'test_id' };

      const result = await plugin.changeResourceRecordSet(domain, 'DELETE');
      const changes = result.ChangeBatch.Changes[0];
      expect(changes.Action).to.equal('DELETE');
      expect(changes.ResourceRecordSet.Name).to.equal('test_domain');
      expect(changes.ResourceRecordSet.AliasTarget.DNSName).to.equal('test_distribution_name');
    });

    it('Delete the domain name', async () => {
      AWS.mock('APIGateway', 'deleteDomainName', (params, callback) => {
        callback(null, {});
      });

      const plugin = constructPlugin('test_basepath', null, true, true);
      plugin.apigateway = new aws.APIGateway();
      plugin.setGivenDomainName(plugin.serverless.service.custom.customDomain.domainName);

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
        callback(null, { domainName: 'fake_domain', distributionDomainName: 'fake_dist_name' });
      });
      AWS.mock('Route53', 'listHostedZones', (params, callback) => {
        callback(null, { HostedZones: [{ Name: 'test_domain', Id: 'test_id', Config: { PrivateZone: false } }] });
      });
      AWS.mock('Route53', 'changeResourceRecordSets', (params, callback) => {
        callback(null, null);
      });
      const plugin = constructPlugin('', null, true, true);
      plugin.apigateway = new aws.APIGateway();
      plugin.setGivenDomainName(plugin.serverless.service.custom.customDomain.domainName);

      await plugin.setUpBasePathMapping();
      const cfTemplat = plugin.serverless.service.provider.compiledCloudFormationTemplate;
      expect(cfTemplat.Resources).to.not.equal(undefined);
      expect(cfTemplat.Outputs).to.not.equal(undefined);
    });

    it('deleteDomain', async () => {
      AWS.mock('APIGateway', 'getDomainName', (params, callback) => {
        callback(null, { distributionDomainName: 'test_distribution', regionalHostedZoneId: 'test_id' });
      });
      AWS.mock('APIGateway', 'deleteDomainName', (params, callback) => {
        callback(null, {});
      });
      AWS.mock('Route53', 'listHostedZones', (params, callback) => {
        callback(null, { HostedZones: [{ Name: 'test_domain', Id: 'test_id', Config: { PrivateZone: false } }] });
      });
      AWS.mock('Route53', 'changeResourceRecordSets', (params, callback) => {
        callback(null, params);
      });
      const plugin = constructPlugin(null, null, true, true);
      plugin.apigateway = new aws.APIGateway();
      plugin.setGivenDomainName(plugin.serverless.service.custom.customDomain.domainName);
      plugin.route53 = new aws.Route53();
      const results = await plugin.deleteDomain();
      expect(results).to.equal('Domain was deleted.');
    });

    it('createDomain', async () => {
      AWS.mock('ACM', 'listCertificates', certTestData);
      AWS.mock('APIGateway', 'getDomainName', (params, callback) => {
        callback(new Error('domain doesn\'t exist'), {});
      });
      AWS.mock('APIGateway', 'createDomainName', (params, callback) => {
        callback(null, { distributionDomainName: 'foo', regionalHostedZoneId: 'test_id' });
      });
      AWS.mock('Route53', 'listHostedZones', (params, callback) => {
        callback(null, { HostedZones: [{ Name: 'test_domain', Id: 'test_id', Config: { PrivateZone: false } }] });
      });
      AWS.mock('Route53', 'changeResourceRecordSets', (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin('', null, true, true);
      plugin.apigateway = new aws.APIGateway();
      plugin.setGivenDomainName(plugin.serverless.service.custom.customDomain.domainName);
      plugin.route53 = new aws.Route53();
      plugin.acm = new aws.ACM();
      const result = await plugin.createDomain();
      expect(result).to.equal('\'test_domain\' was created/updated. New domains may take up to 40 minutes to be initialized.');
    });

    afterEach(() => {
      AWS.restore();
    });
  });

  describe('Select Hosted Zone', () => {
    it('Natural order', async () => {
      AWS.mock('Route53', 'listHostedZones', (params, callback) => {
        callback(null, {
          HostedZones: [{ Name: 'aaa.com.', Id: '/hostedzone/test_id_0', Config: { PrivateZone: false } },
            { Name: 'bbb.aaa.com.', Id: '/hostedzone/test_id_1', Config: { PrivateZone: false } },
            { Name: 'ccc.bbb.aaa.com.', Id: '/hostedzone/test_id_2', Config: { PrivateZone: false } },
            { Name: 'ddd.ccc.bbb.aaa.com.', Id: '/hostedzone/test_id_3', Config: { PrivateZone: false } }],
        });
      });

      const plugin = constructPlugin(null, null, null);
      plugin.route53 = new aws.Route53();
      plugin.setGivenDomainName('ccc.bbb.aaa.com');

      const result = await plugin.getRoute53HostedZoneId();
      expect(result).to.equal('test_id_2');
    });

    it('Reverse order', async () => {
      AWS.mock('Route53', 'listHostedZones', (params, callback) => {
        callback(null, {
          HostedZones: [{ Name: 'ddd.ccc.bbb.aaa.com.', Id: '/hostedzone/test_id_0', Config: { PrivateZone: false } },
            { Name: 'ccc.bbb.aaa.com.', Id: '/hostedzone/test_id_1', Config: { PrivateZone: false } },
            { Name: 'bbb.aaa.com.', Id: '/hostedzone/test_id_2', Config: { PrivateZone: false } },
            { Name: 'aaa.com.', Id: '/hostedzone/test_id_3', Config: { PrivateZone: false } }],
        });
      });

      const plugin = constructPlugin(null, null, null);
      plugin.route53 = new aws.Route53();
      plugin.setGivenDomainName('test.ccc.bbb.aaa.com');

      const result = await plugin.getRoute53HostedZoneId();
      expect(result).to.equal('test_id_1');
    });

    it('Random order', async () => {
      AWS.mock('Route53', 'listHostedZones', (params, callback) => {
        callback(null, {
          HostedZones: [{ Name: 'bbb.aaa.com.', Id: '/hostedzone/test_id_0', Config: { PrivateZone: false } },
            { Name: 'ddd.ccc.bbb.aaa.com.', Id: '/hostedzone/test_id_1', Config: { PrivateZone: false } },
            { Name: 'ccc.bbb.aaa.com.', Id: '/hostedzone/test_id_2', Config: { PrivateZone: false } },
            { Name: 'aaa.com.', Id: '/hostedzone/test_id_3', Config: { PrivateZone: false } }],
        });
      });

      const plugin = constructPlugin(null, null, null);
      plugin.route53 = new aws.Route53();
      plugin.setGivenDomainName('test.ccc.bbb.aaa.com');

      const result = await plugin.getRoute53HostedZoneId();
      expect(result).to.equal('test_id_2');
    });

    it('Sub domain name - only root hosted zones', async () => {
      AWS.mock('Route53', 'listHostedZones', (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: 'aaa.com.', Id: '/hostedzone/test_id_0', Config: { PrivateZone: false } },
            { Name: 'bbb.fr.', Id: '/hostedzone/test_id_1', Config: { PrivateZone: false } },
            { Name: 'ccc.com.', Id: '/hostedzone/test_id_3', Config: { PrivateZone: false } }],
        });
      });

      const plugin = constructPlugin(null, null, null);
      plugin.route53 = new aws.Route53();
      plugin.setGivenDomainName('bar.foo.bbb.fr');

      const result = await plugin.getRoute53HostedZoneId();
      expect(result).to.equal('test_id_1');
    });

    it('With matching root and sub hosted zone', async () => {
      AWS.mock('Route53', 'listHostedZones', (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: 'a.aaa.com.', Id: '/hostedzone/test_id_0', Config: { PrivateZone: false } },
            { Name: 'aaa.com.', Id: '/hostedzone/test_id_1', Config: { PrivateZone: false } }],
        });
      });

      const plugin = constructPlugin(null, null, null);
      plugin.route53 = new aws.Route53();
      plugin.setGivenDomainName('test.a.aaa.com');

      const result = await plugin.getRoute53HostedZoneId();
      expect(result).to.equal('test_id_0');
    });

    it('Sub domain name - natural order', async () => {
      AWS.mock('Route53', 'listHostedZones', (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: 'aaa.com.', Id: '/hostedzone/test_id_0', Config: { PrivateZone: false } },
            { Name: 'bbb.fr.', Id: '/hostedzone/test_id_1', Config: { PrivateZone: false } },
            { Name: 'foo.bbb.fr.', Id: '/hostedzone/test_id_3', Config: { PrivateZone: false } },
            { Name: 'ccc.com.', Id: '/hostedzone/test_id_4', Config: { PrivateZone: false } }],
        });
      });

      const plugin = constructPlugin(null, null, null);
      plugin.route53 = new aws.Route53();
      plugin.setGivenDomainName('bar.foo.bbb.fr');

      const result = await plugin.getRoute53HostedZoneId();
      expect(result).to.equal('test_id_3');
    });

    it('Sub domain name - reverse order', async () => {
      AWS.mock('Route53', 'listHostedZones', (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: 'foo.bbb.fr.', Id: '/hostedzone/test_id_3', Config: { PrivateZone: false } },
            { Name: 'bbb.fr.', Id: '/hostedzone/test_id_1', Config: { PrivateZone: false } },
            { Name: 'ccc.com.', Id: '/hostedzone/test_id_4', Config: { PrivateZone: false } },
            { Name: 'aaa.com.', Id: '/hostedzone/test_id_0', Config: { PrivateZone: false } }],
        });
      });

      const plugin = constructPlugin(null, null, null);
      plugin.route53 = new aws.Route53();
      plugin.setGivenDomainName('bar.foo.bbb.fr');

      const result = await plugin.getRoute53HostedZoneId();
      expect(result).to.equal('test_id_3');
    });

    it('Sub domain name - random order', async () => {
      AWS.mock('Route53', 'listHostedZones', (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: 'bbb.fr.', Id: '/hostedzone/test_id_1', Config: { PrivateZone: false } },
            { Name: 'aaa.com.', Id: '/hostedzone/test_id_0', Config: { PrivateZone: false } },
            { Name: 'foo.bbb.fr.', Id: '/hostedzone/test_id_3', Config: { PrivateZone: false } }],
        });
      });

      const plugin = constructPlugin(null, null, null);
      plugin.route53 = new aws.Route53();
      plugin.setGivenDomainName('bar.foo.bbb.fr');

      const result = await plugin.getRoute53HostedZoneId();
      expect(result).to.equal('test_id_3');
    });

    it('Private zone domain name', async () => {
      AWS.mock('Route53', 'listHostedZones', (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: 'aaa.com.', Id: '/hostedzone/test_id_1', Config: { PrivateZone: false } },
            { Name: 'aaa.com.', Id: '/hostedzone/test_id_0', Config: { PrivateZone: true } }],
        });
      });

      const plugin = constructPlugin(null, null, null);
      plugin.route53 = new aws.Route53();
      plugin.setGivenDomainName('aaa.com');
      plugin.setHostedZonePrivate(true);

      const result = await plugin.getRoute53HostedZoneId();
      expect(result).to.equal('test_id_0');
    });

    it('Undefined hostedZonePrivate should still allow private domains', async () => {
      AWS.mock('Route53', 'listHostedZones', (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: 'aaa.com.', Id: '/hostedzone/test_id_0', Config: { PrivateZone: true } },
          ],
        });
      });

      const plugin = constructPlugin(null, null, null);
      plugin.route53 = new aws.Route53();
      plugin.setGivenDomainName('aaa.com');

      const result = await plugin.getRoute53HostedZoneId();
      expect(result).to.equal('test_id_0');
    });

    afterEach(() => {
      AWS.restore();
    });
  });

  describe('Error Catching', () => {
    it('If a certificate cannot be found when a name is given', () => {
      AWS.mock('ACM', 'listCertificates', certTestData);

      const plugin = constructPlugin('', 'does_not_exist', true, true);
      plugin.acm = new aws.ACM();

      return plugin.getCertArn().then(() => {
        throw new Error('Test has failed. getCertArn did not catch errors.');
      }).catch((err) => {
        const expectedErrorMessage = 'Error: Could not find the certificate does_not_exist.';
        expect(err.message).to.equal(expectedErrorMessage);
      });
    });

    it('Fail getHostedZone', () => {
      AWS.mock('Route53', 'listHostedZones', (params, callback) => {
        callback(null, { HostedZones: [{ Name: 'no_hosted_zone', Id: 'test_id' }] });
      });

      const plugin = constructPlugin();
      plugin.route53 = new aws.Route53();
      plugin.setGivenDomainName(plugin.serverless.service.custom.customDomain.domainName);

      return plugin.getRoute53HostedZoneId().then(() => {
        throw new Error('Test has failed, getHostedZone did not catch errors.');
      }).catch((err) => {
        const expectedErrorMessage = 'Error: Could not find hosted zone \'test_domain\'';
        expect(err.message).to.equal(expectedErrorMessage);
      });
    });

    it('Domain summary failed', () => {
      AWS.mock('APIGateway', 'getDomainName', (params, callback) => {
        callback(null, null);
      });
      const plugin = constructPlugin(null, null, true, false);
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;

      return plugin.domainSummary().then(() => {
        // check if distribution domain name is printed
      }).catch((err) => {
        const expectedErrorMessage = "Error: Domain manager summary logging failed.\nTypeError: Cannot read property 'distributionDomainName' of null";
        expect(err.message).to.equal(expectedErrorMessage);
      });
    });
    it('Catch failure of record type migration', async () => {
      AWS.mock('Route53', 'listHostedZones', (params, callback) => {
        callback(null, { HostedZones: [{ Name: 'test_domain', Id: 'test_id', Config: { PrivateZone: false } }] });
      });
      AWS.mock('Route53', 'changeResourceRecordSets', (params, callback) => {
        callback(new Error('CNAME does\'t exist, but that\'s ok'), null);
      });
      const plugin = constructPlugin('test_basepath', null, true, true);
      plugin.route53 = new aws.Route53();
      plugin.setGivenDomainName(plugin.serverless.service.custom.customDomain.domainName);
      await plugin.migrateRecordType('test_distribution_name');
    });

    afterEach(() => {
      AWS.restore();
    });
  });

  describe('Summary Printing', () => {
    it('Prints Summary', () => {
      AWS.mock('APIGateway', 'getDomainName', (params, callback) => {
        callback(null, { domainName: params, distributionDomainName: 'test_distributed_domain_name' });
      });
      const plugin = constructPlugin('', null, true, true);
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;


      return plugin.domainSummary().then((data) => {
        expect(data).to.equal(true);
      }).catch(() => {
        throw new Error('Test has failed, domainSummary threw an error');
      });
    });

    afterEach(() => {
      AWS.restore();
    });
  });

  describe('Enable/disable functionality', () => {
    it('Should enable the plugin by default', () => {
      const plugin = constructPlugin('', null, 'stage', true, 'regional');

      plugin.initializeVariables();

      const returnedCreds = plugin.apigateway.config.credentials;
      expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
      expect(plugin.initialized).to.equal(true);
      expect(plugin.enabled).to.equal(true);
    });

    it('Should enable the plugin when passing a true parameter', () => {
      const plugin = constructPlugin('', null, 'stage', true, 'regional', true);

      plugin.initializeVariables();

      const returnedCreds = plugin.apigateway.config.credentials;
      expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
      expect(plugin.initialized).to.equal(true);
      expect(plugin.enabled).to.equal(true);
    });

    it('Should disable the plugin when passing a false parameter', () => {
      const plugin = constructPlugin('', null, 'stage', true, 'regional', false);

      plugin.initializeVariables();

      expect(plugin.initialized).to.equal(true);
      expect(plugin.enabled).to.equal(false);
    });

    it('createDomain should do nothing and report that the plugin is disabled', async () => {
      const plugin = constructPlugin('', null, 'stage', true, 'regional', false);

      const result = await plugin.createDomain();

      expect(plugin.initialized).to.equal(true);
      expect(plugin.enabled).to.equal(false);

      expect(result).to.equal('serverless-domain-manager: Custom domain is disabled.');
    });

    it('deleteDomain should do nothing and report that the plugin is disabled', async () => {
      const plugin = constructPlugin('', null, 'stage', true, 'regional', false);

      const result = await plugin.deleteDomain();

      expect(plugin.initialized).to.equal(true);
      expect(plugin.enabled).to.equal(false);

      expect(result).to.equal('serverless-domain-manager: Custom domain is disabled.');
    });

    it('setUpBasePathMapping should do nothing and report that the plugin is disabled', async () => {
      const plugin = constructPlugin('', null, 'stage', true, 'regional', false);

      const result = await plugin.setUpBasePathMapping();

      expect(plugin.initialized).to.equal(true);
      expect(plugin.enabled).to.equal(false);

      expect(result).to.equal('serverless-domain-manager: Custom domain is disabled.');
    });

    it('domainSummary should do nothing and report that the plugin is disabled', async () => {
      const plugin = constructPlugin('', null, 'stage', true, 'regional', false);

      const result = await plugin.domainSummary();

      expect(plugin.initialized).to.equal(true);
      expect(plugin.enabled).to.equal(false);

      expect(result).to.equal('serverless-domain-manager: Custom domain is disabled.');
    });


    it('Should throw an Error when passing a parameter that is not boolean', () => {
      const stringWithValueTrue = 'true';
      const plugin = constructPlugin('', null, 'stage', true, 'regional', stringWithValueTrue);

      let errored = false;
      try {
        plugin.initializeVariables();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal('serverless-domain-manager: Ambiguous enablement boolean: \'true\'');
      }
      expect(errored).to.equal(true);
    });
  });
});

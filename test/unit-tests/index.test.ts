import * as aws from "aws-sdk";
import * as AWS from "aws-sdk-mock";
import chai = require("chai");
import spies = require("chai-spies");
import "mocha";
import DomainInfo = require("../../DomainInfo");
import ServerlessCustomDomain = require("../../index");
import { Domain, ServerlessInstance, ServerlessOptions } from "../../types";

const expect = chai.expect;
chai.use(spies);
chai.config.showDiff = true;
chai.config.truncateThreshold = 0;
chai.config.includeStack = true;

const certTestData = {
  CertificateSummaryList: [
    {
      CertificateArn: "test_arn",
      DomainName: "test_domain",
    },
    {
      CertificateArn: "test_given_cert_name",
      DomainName: "cert_name",
    },
    {
      CertificateArn: "test_given_arn",
      DomainName: "other_cert_name",
    },
  ],
};
let consoleOutput = [];
const testCreds = {
  accessKeyId: "test_key",
  secretAccessKey: "test_secret",
  sessionToken: "test_session",
};

const constructPlugin = (customDomainOptions) => {
  aws.config.update(testCreds);
  aws.config.region = "eu-west-1";

  const serverless = {
    cli: {
      log(str: string) { consoleOutput.push(str); },
      consoleLog(str: any) { consoleOutput.push(str); },
    },
    providers: {
      aws: {
        getCredentials: () => new aws.Credentials(testCreds),
        getRegion: () => "eu-west-1",
        sdk: {
          ACM: aws.ACM,
          APIGateway: aws.APIGateway,
          ApiGatewayV2: aws.ApiGatewayV2,
          CloudFormation: aws.CloudFormation,
          Route53: aws.Route53,
          config: {
            update: (toUpdate: object) => null,
          },
        },
      },
    },
    service: {
      custom: {
        customDomain: [{
          basePath: customDomainOptions.basePath,
          certificateArn: customDomainOptions.certificateArn,
          certificateName: customDomainOptions.certificateName,
          createRoute53Record: customDomainOptions.createRoute53Record,
          domainName: customDomainOptions.domainName,
          enabled: customDomainOptions.enabled,
          endpointType: customDomainOptions.endpointType,
          hostedZoneId: customDomainOptions.hostedZoneId,
          hostedZonePrivate: customDomainOptions.hostedZonePrivate,
          securityPolicy: customDomainOptions.securityPolicy,
          stage: customDomainOptions.stage,
          websocket: customDomainOptions.websocket,
        }],
      },
      provider: {
        apiGateway: {
          restApiId: null,
          websocketApiId: null,
        },
        compiledCloudFormationTemplate: {
          Outputs: null,
        },
        stackName: "custom-stage-name",
        stage: "test",
      },
      service: "test",
    },
  };
  const options = {
    stage: "test",
  };
  return new ServerlessCustomDomain(serverless, options);
};

describe("Custom Domain Plugin", () => {
  it("Checks aws config", () => {
    const plugin = constructPlugin({
      domainName: "test_domain",
    });

    plugin.initializeVariables();

    const returnedCreds = plugin.apigateway.config.credentials;
    const returnedCredsV2 = plugin.apigatewayv2.config.credentials;
    expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
    expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
    expect(returnedCredsV2.accessKeyId).to.equal(testCreds.accessKeyId);
    expect(returnedCredsV2.sessionToken).to.equal(testCreds.sessionToken);
  });

  describe("Domain Endpoint types", () => {
    it("Unsupported endpoint types throw exception", () => {
      const plugin = constructPlugin({
        domainName: "test_domain",
        endpointType: "notSupported",
      });
      let errored = false;
      try {
        plugin.initializeVariables();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal("notSupported is not supported endpointType, use edge or regional.");
      }
      expect(errored).to.equal(true);
    });

  });

  describe("Set Domain Name and Base Path", () => {
    it("Creates basepath mapping (REST)", async () => {
      AWS.mock("ApiGatewayV2", "createApiMapping", (params, callback) => {
        callback(null, params);
      });
      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
        stage: "test",
      });
      plugin.initializeVariables();

      const spy = chai.spy.on(plugin.apigatewayv2, "createApiMapping");

      await plugin.createApiMapping("test_api_id", plugin.domains[0]);
      expect(spy).to.have.been.called.with({
        ApiId: "test_api_id",
        ApiMappingKey: "test_basepath",
        DomainName: "test_domain",
        Stage: "test",
      });
    });

    it("Updates basepath mapping", async () => {
      AWS.mock("ApiGatewayV2", "updateApiMapping", (params, callback) => {
        callback(null, params);
      });
      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
        stage: "test_stage",
      });
      plugin.initializeVariables();

      const spy = chai.spy.on(plugin.apigatewayv2, "updateApiMapping");

      await plugin.updateApiMapping("mapping_id", plugin.domains[0], "test_api_id");
      expect(spy).to.have.been.called.with({
        ApiId: "test_api_id",
        ApiMappingId: "mapping_id",
        ApiMappingKey: "test_basepath",
        DomainName: "test_domain",
        Stage: "test_stage",
      });
    });

    it("Add Domain Name and HostedZoneId to stack output and check if outputs are defined (REST)", () => {
      const plugin = constructPlugin({
        domainName: "fake_domain",
      });

      plugin.initializeVariables();

      plugin.domains[0].SetApiGatewayRespV1({
        distributionDomainName: "fake_dist_name",
        distributionHostedZoneId: "fake_zone_id"});

      plugin.addOutputs(plugin.domains[0]);
      const cfTemplat = plugin.serverless.service.provider.compiledCloudFormationTemplate.Outputs;
      expect(cfTemplat).to.not.equal(undefined);
    });

    it("Add Domain Name and HostedZoneId to stack output and check if outputs are defined (Websocket)", () => {
      const plugin = constructPlugin({
        domainName: "fake_domain",
        websocket: true,
      });

      plugin.initializeVariables();

      plugin.domains[0].SetApiGatewayRespV2({
        DomainNameConfigurations: [{
          ApiGatewayDomainName: "fake_dist_name",
          HostedZoneId: "fake_zone_id"}]});

      plugin.addOutputs(plugin.domains[0]);
      const cfTemplat = plugin.serverless.service.provider.compiledCloudFormationTemplate.Outputs;
      expect(cfTemplat).to.not.equal(undefined);
    });

    it("Add Domain Name and HostedZoneId to stack output and check the output contents (REST)", () => {
      const plugin = constructPlugin({
        domainName: "fake_domain",
      });

      plugin.initializeVariables();

      plugin.domains[0].SetApiGatewayRespV1({
        distributionDomainName: "fake_dist_name",
        distributionHostedZoneId: "fake_zone_id"});

      plugin.addOutputs(plugin.domains[0]);
      const cfTemplat = plugin.serverless.service.provider.compiledCloudFormationTemplate.Outputs;
      expect(cfTemplat.aliasTarget.Value).to.equal("fake_dist_name");
      expect(cfTemplat.aliasHostedZoneId.Value).to.equal("fake_zone_id");
    });

    it("Add Domain Name and HostedZoneId to stack output and check the output contents (Websocket) ", () => {
      const plugin = constructPlugin({
        domainName: "fake_domain",
        websocket: true,
      });

      plugin.initializeVariables();

      plugin.domains[0].SetApiGatewayRespV2({
        DomainNameConfigurations: [{
          ApiGatewayDomainName: "fake_dist_name",
          HostedZoneId: "fake_zone_id"}]});

      plugin.addOutputs(plugin.domains[0]);
      const cfTemplat = plugin.serverless.service.provider.compiledCloudFormationTemplate.Outputs;
      expect(cfTemplat.aliasTarget.Value).to.equal("fake_dist_name");
      expect(cfTemplat.aliasHostedZoneId.Value).to.equal("fake_zone_id");
    });

    it("(none) is added if basepath is an empty string", async () => {
      AWS.mock("ApiGatewayV2", "createApiMapping", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        basePath: "",
        domainName: "test_domain",
      });

      plugin.initializeVariables();

      const spy = chai.spy.on(plugin.apigatewayv2, "createApiMapping");

      await plugin.createApiMapping("test_api_id", plugin.domains[0]);
      expect(spy).to.have.been.called.with({
        ApiId: "test_api_id",
        ApiMappingKey: "(none)",
        DomainName: "test_domain",
        Stage: "test",
      });
    });

    it("(none) is added if no value is given for basepath (null)", async () => {
      AWS.mock("ApiGatewayV2", "createApiMapping", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        basePath: null,
        domainName: "test_domain",
      });
      plugin.initializeVariables();

      const spy = chai.spy.on(plugin.apigatewayv2, "createApiMapping");

      await plugin.createApiMapping("test_api_id", plugin.domains[0]);
      expect(spy).to.have.been.called.with({
        ApiId: "test_api_id",
        ApiMappingKey: "(none)",
        DomainName: "test_domain",
        Stage: "test",
      });
    });

    it("(none) is added if basepath attribute is missing (undefined)", async () => {
      AWS.mock("ApiGatewayV2", "createApiMapping", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        domainName: "test_domain",
        websocket: false,
      });
      plugin.initializeVariables();

      const spy = chai.spy.on(plugin.apigatewayv2, "createApiMapping");

      await plugin.createApiMapping("test_api_id", plugin.domains[0]);
      expect(spy).to.have.been.called.with({
        ApiId: "test_api_id",
        ApiMappingKey: "(none)",
        DomainName: "test_domain",
        Stage: "test",
      });
    });

    it("API stage was not given", async () => {
      AWS.mock("ApiGatewayV2", "createApiMapping", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        domainName: "test_domain",
        websocket: false,
      });
      plugin.initializeVariables();

      const spy = chai.spy.on(plugin.apigatewayv2, "createApiMapping");

      await plugin.createApiMapping("test_api_id", plugin.domains[0]);
      expect(spy).to.have.been.called.with({
        ApiId: "test_api_id",
        ApiMappingKey: "(none)",
        DomainName: "test_domain",
        Stage: "test",
      });
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
    });
  });

  describe("Create a New Domain Name", () => {
    it("Get a given certificate ARN for a domain", async () => {
      AWS.mock("ACM", "listCertificates", certTestData);

      const plugin = constructPlugin({
        certificateArn: "test_given_arn",
        domainName: "test_domain",
        endpointType: "REGIONAL",
      });
      plugin.initializeVariables();

      await plugin.getCertArn(plugin.domains[0]);

      expect(plugin.domains[0].certificateArn).to.equal("test_given_arn");
    });

    it("Get a given certificate name for a domain", async () => {
      AWS.mock("ACM", "listCertificates", certTestData);

      const plugin = constructPlugin({
        certificateName: "cert_name",
      });
      plugin.initializeVariables();

      await plugin.getCertArn(plugin.domains[0]);

      expect(plugin.domains[0].certificateArn).to.equal("test_given_cert_name");
    });

    it("Create a new A Alias Record (REST)", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, { HostedZones: [{ Name: "test_domain", Id: "test_host_id", Config: { PrivateZone: false } }] });
      });

      AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
      });
      plugin.initializeVariables();

      const spy = chai.spy.on(plugin.route53, "changeResourceRecordSets");

      plugin.domains[0].SetApiGatewayRespV1({
        distributionDomainName: "test_distribution_name",
        distributionHostedZoneId: "test_id",
      });

      await plugin.changeResourceRecordSet("UPSERT", plugin.domains[0]);

      const expectedParams = {
        ChangeBatch: {
          Changes: [
            {
              Action: "UPSERT",
              ResourceRecordSet: {
                AliasTarget: {
                  DNSName: "test_distribution_name",
                  EvaluateTargetHealth: false,
                  HostedZoneId: "test_id",
                },
                Name: "test_domain",
                Type: "A",
              },
            },
            {
              Action: "UPSERT",
              ResourceRecordSet: {
                AliasTarget: {
                  DNSName: "test_distribution_name",
                  EvaluateTargetHealth: false,
                  HostedZoneId: "test_id",
                },
                Name: "test_domain",
                Type: "AAAA",
              },
            },
          ],
          Comment: "Record created by serverless-domain-manager",
        },
        HostedZoneId: "est_host_id", // getRoute53HostedZoneId strips first character
      };
      expect(spy).to.have.been.called.with(expectedParams);
    });

    it("Create a new A Alias Record (Websocket)", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, { HostedZones: [{ Name: "test_domain", Id: "test_host_id", Config: { PrivateZone: false } }] });
      });

      AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
        websocket: true,
      });
      plugin.initializeVariables();

      const spy = chai.spy.on(plugin.route53, "changeResourceRecordSets");

      plugin.domains[0].SetApiGatewayRespV2({
        DomainNameConfigurations: [{
          ApiGatewayDomainName: "test_distribution_name",
          HostedZoneId: "test_id",
        }],
      });

      await plugin.changeResourceRecordSet("UPSERT", plugin.domains[0]);

      const expectedParams = {
        ChangeBatch: {
          Changes: [
            {
              Action: "UPSERT",
              ResourceRecordSet: {
                AliasTarget: {
                  DNSName: "test_distribution_name",
                  EvaluateTargetHealth: false,
                  HostedZoneId: "test_id",
                },
                Name: "test_domain",
                Type: "A",
              },
            },
            {
              Action: "UPSERT",
              ResourceRecordSet: {
                AliasTarget: {
                  DNSName: "test_distribution_name",
                  EvaluateTargetHealth: false,
                  HostedZoneId: "test_id",
                },
                Name: "test_domain",
                Type: "AAAA",
              },
            },
          ],
          Comment: "Record created by serverless-domain-manager",
        },
        HostedZoneId: "est_host_id", // getRoute53HostedZoneId strips first character
      };
      expect(spy).to.have.been.called.with(expectedParams);
    });

    it("Do not create a Route53 record for a domain (REST)", async () => {
      const plugin = constructPlugin({
        createRoute53Record: false,
        domainName: "test_domain",
      });

      plugin.initializeVariables();

      const result = await plugin.changeResourceRecordSet("UPSERT", plugin.domains[0]);
      expect(result).to.equal(undefined);
    });

    it("Do not create a Route53 record for a domain (Websocket)", async () => {
      const plugin = constructPlugin({
        createRoute53Record: false,
        domainName: "test_domain",
        websocket: true,
      });

      plugin.initializeVariables();

      const result = await plugin.changeResourceRecordSet("UPSERT", plugin.domains[0]);
      expect(result).to.equal(undefined);
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
    });
  });

  describe("Gets existing basepath mappings correctly", () => {
    it("Returns undefined if no basepaths map to current ApiId", async () => {
      AWS.mock("ApiGatewayV2", "getApiMappings", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        domainName: "test_domain",
      });

      plugin.initializeVariables();

      const result = await plugin.getMapping("test_api_id", plugin.domains[0]);
      expect(result).to.equal(undefined);
    });

    it("Returns current api", async () => {
      AWS.mock("ApiGatewayV2", "getApiMappings", (params, callback) => {
        callback(null, {
          Items: [
            { ApiMappingKey: "api", ApiId: "test_api_id", ApiMappingId: "test_api_mapping_id", Stage: "test" },
          ],
        });
      });

      const plugin = constructPlugin({
        domainName: "test_domain",
      });

      plugin.initializeVariables();

      const result = await plugin.getMapping("test_api_id", plugin.domains[0]);
      expect(result).to.equal("test_api_mapping_id");
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
    });
  });

  describe("Gets API correctly", () => {
    it("Fetches ApiId correctly when no ApiGateway specified", async () => {
      AWS.mock("CloudFormation", "describeStackResource", (params, callback) => {
        callback(null, {
          StackResourceDetail:
            {
              LogicalResourceId: "ApiGatewayRestApi",
              PhysicalResourceId: "test_api_id",
            },
        });
      });
      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
      });

      plugin.initializeVariables();

      const result = await plugin.getApiId(plugin.domains[0]);
      expect(result).to.equal("test_api_id");
    });

    it("serverless.yml defines explicitly the apiGateway", async () => {
      AWS.mock("CloudFormation", "describeStackResource", (params, callback) => {
        callback(null, {
          StackResourceDetail:
          {
            LogicalResourceId: "ApiGatewayRestApi",
            PhysicalResourceId: "test_api_id",
          },
        });
      });

      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
      });

      plugin.initializeVariables();

      plugin.serverless.service.provider.apiGateway.restApiId = "custom_test_api_id";

      const result = await plugin.getApiId(plugin.domains[0]);
      expect(result).to.equal("custom_test_api_id");
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
    });
  });

  describe("Delete the new domain", () => {
    it("Find available domains", async () => {
      AWS.mock("ApiGatewayV2", "getDomainName", (params, callback) => {
        callback(null, { DomainNameConfigurations: [{ ApiGatewayDomainName: "test_domain" }]});
      });

      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
      });

      plugin.initializeVariables();

      await plugin.getAliasInfo(plugin.domains[0]);

      expect(plugin.domains[0].aliasTarget).to.equal("test_domain");
    });

    it("Delete A Alias Record", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, { HostedZones: [{ Name: "test_domain", Id: "test_host_id", Config: { PrivateZone: false } }] });
      });

      AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
      });

      plugin.initializeVariables();

      plugin.domains[0].SetApiGatewayRespV1({
        distributionDomainName: "test_distribution_name",
        distributionHostedZoneId: "test_id",
      });

      const spy = chai.spy.on(plugin.route53, "changeResourceRecordSets");

      await plugin.changeResourceRecordSet("DELETE", plugin.domains[0]);
      const expectedParams = {
        ChangeBatch: {
          Changes: [
            {
              Action: "DELETE",
              ResourceRecordSet: {
                AliasTarget: {
                  DNSName: "test_distribution_name",
                  EvaluateTargetHealth: false,
                  HostedZoneId: "test_id",
                },
                Name: "test_domain",
                Type: "A",
              },
            },
            {
              Action: "DELETE",
              ResourceRecordSet: {
                AliasTarget: {
                  DNSName: "test_distribution_name",
                  EvaluateTargetHealth: false,
                  HostedZoneId: "test_id",
                },
                Name: "test_domain",
                Type: "AAAA",
              },
            },
          ],
          Comment: "Record created by serverless-domain-manager",
        },
        HostedZoneId: "est_host_id", // getRoute53HostedZoneId strips the first character
      };
      expect(spy).to.be.called.with(expectedParams);

    });

    it("Delete the domain name", async () => {
      AWS.mock("ApiGatewayV2", "deleteDomainName", (params, callback) => {
        callback(null, {});
      });

      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",

      });

      plugin.initializeVariables();

      const spy = chai.spy.on(plugin.apigatewayv2, "deleteDomainName");

      await plugin.deleteCustomDomain(plugin.domains[0]);
      expect(spy).to.be.called.with({
        DomainName: "test_domain",
      });
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
    });
  });

  describe("Hook Methods", () => {
    it("setupBasePathMapping", async () => {
      AWS.mock("ApiGatewayV2", "getDomainName", (params, callback) => {
        callback(null, {
          DomainName: "fake_domain",
          DomainNameConfigurations: [{ApiGatewayDomainName: "test_alias_name", HostedZoneId: "test_zone_id"}]});
      });
      AWS.mock("ApiGatewayV2", "getApiMappings", (params, callback) => {
        callback(null, { Items: [] });
      });
      AWS.mock("ApiGatewayV2", "createApiMapping", (params, callback) => {
        callback(null, params);
      });
      AWS.mock("CloudFormation", "describeStackResource", (params, callback) => {
        callback(null, {
          StackResourceDetail:
          {
            LogicalResourceId: "ApiGatewayRestApi",
            PhysicalResourceId: "test_rest_api_id",
          },
        });
      });
      const plugin = constructPlugin({
        domainName: "fake_domain",
      });
      plugin.initializeVariables();

      const spy = chai.spy.on(plugin, "createApiMapping");

      await plugin.propogateMappings();

      expect(spy).to.be.called();
    });

    it("deleteDomain", async () => {
      AWS.mock("ApiGatewayV2", "getDomainName", (params, callback) => {
        callback(null, {
          DomainName: "fake_domain",
          DomainNameConfigurations: [{ApiGatewayDomainName: "fake_dist_name", HostedZoneId: "fake_zone_id"}]});
      });
      AWS.mock("ApiGatewayV2", "deleteDomainName", (params, callback) => {
        callback(null, {});
      });
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, { HostedZones: [{ Name: "fake_domain", Id: "test_id", Config: { PrivateZone: false } }] });
      });
      AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        domainName: "fake_domain",
      });
      plugin.initializeVariables();

      await plugin.deleteDomains();

      expect(consoleOutput[0]).to.equal(`Custom domain ${plugin.domains[0].domainName} was deleted.`);
    });

    it("createDomain if one does not exist before", async () => {
      AWS.mock("ACM", "listCertificates", certTestData);
      AWS.mock("ApiGatewayV2", "getDomainName", (params, callback) => {
        callback({ code: "NotFoundException" }, {});
      });
      AWS.mock("APIGateway", "createDomainName", (params, callback) => {
        callback(null, { distributionDomainName: "foo", regionalHostedZoneId: "test_id" });
      });
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, { HostedZones: [{ Name: "test_domain", Id: "test_id", Config: { PrivateZone: false } }] });
      });
      AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        domainName: "test_domain",
      });
      plugin.initializeVariables();

      await plugin.createDomains();
      const output = `${plugin.domains[0].domainName} was created. Could take up to 40 minutes to be initialized.`;
      expect(consoleOutput[0]).to.equal(output);
    });

    it("Does not create domain if one existed before", async () => {
      AWS.mock("ACM", "listCertificates", certTestData);
      AWS.mock("ApiGatewayV2", "getDomainName", (params, callback) => {
        callback(null, {
          DomainName: "fake_domain",
          DomainNameConfigurations: [{ApiGatewayDomainName: "fake_dist_name", HostedZoneId: "fake_zone_id"}]});
      });
      AWS.mock("APIGateway", "createDomainName", (params, callback) => {
        callback(null, { distributionDomainName: "foo", regionalHostedZoneId: "test_id" });
      });
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, { HostedZones: [{ Name: "test_domain", Id: "test_id", Config: { PrivateZone: false } }] });
      });
      AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        domainName: "test_domain",
      });
      plugin.initializeVariables();

      await plugin.createDomains();
      expect(consoleOutput[0]).to.equal(`Custom domain ${plugin.domains[0].domainName} already exists.`);
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
    });
  });

  describe("Select Hosted Zone of a domain", () => {
    it("Natural order", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: "aaa.com.", Id: "/hostedzone/test_id_0", Config: { PrivateZone: false } },
            { Name: "bbb.aaa.com.", Id: "/hostedzone/test_id_1", Config: { PrivateZone: false } },
            { Name: "ccc.bbb.aaa.com.", Id: "/hostedzone/test_id_2", Config: { PrivateZone: false } },
            { Name: "ddd.ccc.bbb.aaa.com.", Id: "/hostedzone/test_id_3", Config: { PrivateZone: false } },
          ],
        });
      });

      const plugin = constructPlugin({
        domainName: "ccc.bbb.aaa.com",
      });
      plugin.initializeVariables();

      const result = await plugin.getRoute53HostedZoneId(plugin.domains[0]);
      expect(result).to.equal("test_id_2");
    });

    it("Reverse order", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: "ddd.ccc.bbb.aaa.com.", Id: "/hostedzone/test_id_0", Config: { PrivateZone: false } },
            { Name: "ccc.bbb.aaa.com.", Id: "/hostedzone/test_id_1", Config: { PrivateZone: false } },
            { Name: "bbb.aaa.com.", Id: "/hostedzone/test_id_2", Config: { PrivateZone: false } },
            { Name: "aaa.com.", Id: "/hostedzone/test_id_3", Config: { PrivateZone: false } },
          ],
        });
      });

      const plugin = constructPlugin({
        domainName: "test.ccc.bbb.aaa.com",
      });
      plugin.initializeVariables();

      const result = await plugin.getRoute53HostedZoneId(plugin.domains[0]);
      expect(result).to.equal("test_id_1");
    });

    it("Random order", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: "bbb.aaa.com.", Id: "/hostedzone/test_id_0", Config: { PrivateZone: false } },
            { Name: "ddd.ccc.bbb.aaa.com.", Id: "/hostedzone/test_id_1", Config: { PrivateZone: false } },
            { Name: "ccc.bbb.aaa.com.", Id: "/hostedzone/test_id_2", Config: { PrivateZone: false } },
            { Name: "aaa.com.", Id: "/hostedzone/test_id_3", Config: { PrivateZone: false } },
          ],
        });
      });

      const plugin = constructPlugin({
        domainName: "test.ccc.bbb.aaa.com",
      });
      plugin.initializeVariables();

      const result = await plugin.getRoute53HostedZoneId(plugin.domains[0]);
      expect(result).to.equal("test_id_2");
    });

    it("Sub domain name - only root hosted zones", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: "aaa.com.", Id: "/hostedzone/test_id_0", Config: { PrivateZone: false } },
            { Name: "bbb.fr.", Id: "/hostedzone/test_id_1", Config: { PrivateZone: false } },
            { Name: "ccc.com.", Id: "/hostedzone/test_id_3", Config: { PrivateZone: false } },
          ],
        });
      });

      const plugin = constructPlugin({
        domainName: "bar.foo.bbb.fr",
      });
      plugin.initializeVariables();

      const result = await plugin.getRoute53HostedZoneId(plugin.domains[0]);
      expect(result).to.equal("test_id_1");
    });

    it("With matching root and sub hosted zone", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: "a.aaa.com.", Id: "/hostedzone/test_id_0", Config: { PrivateZone: false } },
            { Name: "aaa.com.", Id: "/hostedzone/test_id_1", Config: { PrivateZone: false } },
          ],
        });
      });

      const plugin = constructPlugin({
        domainName: "test.a.aaa.com",
      });
      plugin.initializeVariables();

      const result = await plugin.getRoute53HostedZoneId(plugin.domains[0]);
      expect(result).to.equal("test_id_0");
    });

    it("Sub domain name - natural order", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: "aaa.com.", Id: "/hostedzone/test_id_0", Config: { PrivateZone: false } },
            { Name: "bbb.fr.", Id: "/hostedzone/test_id_1", Config: { PrivateZone: false } },
            { Name: "foo.bbb.fr.", Id: "/hostedzone/test_id_3", Config: { PrivateZone: false } },
            { Name: "ccc.com.", Id: "/hostedzone/test_id_4", Config: { PrivateZone: false } },
          ],
        });
      });

      const plugin = constructPlugin({
        domainName: "bar.foo.bbb.fr",
      });
      plugin.initializeVariables();

      const result = await plugin.getRoute53HostedZoneId(plugin.domains[0]);
      expect(result).to.equal("test_id_3");
    });

    it("Sub domain name - reverse order", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: "foo.bbb.fr.", Id: "/hostedzone/test_id_3", Config: { PrivateZone: false } },
            { Name: "bbb.fr.", Id: "/hostedzone/test_id_1", Config: { PrivateZone: false } },
            { Name: "ccc.com.", Id: "/hostedzone/test_id_4", Config: { PrivateZone: false } },
            { Name: "aaa.com.", Id: "/hostedzone/test_id_0", Config: { PrivateZone: false } },
          ],
        });
      });

      const plugin = constructPlugin({
        domainName: "bar.foo.bbb.fr",
      });
      plugin.initializeVariables();

      const result = await plugin.getRoute53HostedZoneId(plugin.domains[0]);
      expect(result).to.equal("test_id_3");
    });

    it("Sub domain name - random order", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: "bbb.fr.", Id: "/hostedzone/test_id_1", Config: { PrivateZone: false } },
            { Name: "aaa.com.", Id: "/hostedzone/test_id_0", Config: { PrivateZone: false } },
            { Name: "foo.bbb.fr.", Id: "/hostedzone/test_id_3", Config: { PrivateZone: false } },
          ],
        });
      });

      const plugin = constructPlugin({
        domainName: "bar.foo.bbb.fr",
      });
      plugin.initializeVariables();

      const result = await plugin.getRoute53HostedZoneId(plugin.domains[0]);
      expect(result).to.equal("test_id_3");
    });

    it("Private zone domain name", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: "aaa.com.", Id: "/hostedzone/test_id_1", Config: { PrivateZone: false } },
            { Name: "aaa.com.", Id: "/hostedzone/test_id_0", Config: { PrivateZone: true } }],
        });
      });

      const plugin = constructPlugin({
        domainName: "aaa.com",
        hostedZonePrivate: true,
      });
      plugin.initializeVariables();

      const result = await plugin.getRoute53HostedZoneId(plugin.domains[0]);
      expect(result).to.equal("test_id_0");
    });

    it("Undefined hostedZonePrivate should still allow private domains", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: "bbb.com.", Id: "/hostedzone/test_id_1", Config: { PrivateZone: true } },
            { Name: "aaa.com.", Id: "/hostedzone/test_id_0", Config: { PrivateZone: true } },
          ],
        });
      });

      const plugin = constructPlugin({
        domainName: "aaa.com",
        hostedZonePrivate: true,
      });
      plugin.initializeVariables();

      const result = await plugin.getRoute53HostedZoneId(plugin.domains[0]);
      expect(result).to.equal("test_id_0");
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
    });
  });

  describe("Error Catching", () => {
    it("If a certificate cannot be found when a name is given", async () => {
      AWS.mock("ACM", "listCertificates", certTestData);

      const plugin = constructPlugin({
        certificateName: "does_not_exist",
        domainName: "",
      });
      plugin.initializeVariables();

      return plugin.getCertArn(plugin.domains[0]).then(() => {
        throw new Error("Test has failed. getCertArn did not catch errors.");
      }).catch((err) => {
        const expectedErrorMessage = "Error: Could not find the certificate does_not_exist.";
        expect(err.message).to.equal(expectedErrorMessage);
      });
    });

    it("Fail getHostedZone", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, { HostedZones: [{ Name: "no_hosted_zone", Id: "test_id" }] });
      });

      const plugin = constructPlugin({
        domainName: "test_domain",
      });
      plugin.initializeVariables();

      return plugin.getRoute53HostedZoneId(plugin.domains[0]).then(() => {
        throw new Error("Test has failed, getHostedZone did not catch errors.");
      }).catch((err) => {
        const expectedErrorMessage = "Error: Could not find hosted zone \"test_domain\"";
        expect(err.message).to.equal(expectedErrorMessage);
      });
    });

    it("Fail createCustomDomain due to missing domainName", async () => {
      AWS.mock("APIGateway", "createDomainName", (params, callback) => {
        callback(null, { distributionDomainName: "foo" });
      });

      const plugin = constructPlugin({
        domainName: undefined,
      });

      plugin.initializeVariables();

      return plugin.createCustomDomain(plugin.domains[0]).then(() => {
        throw new Error("Test has failed, createCustomDomain did not catch errors.");
      }).catch((err) => {
        const expectedErrorMessage = "Error: Failed to create custom domain undefined\n";
        expect(err.message).to.equal(expectedErrorMessage);
      });
    });

    it("Domain summary failed", async () => {
      AWS.mock("ApiGatewayV2", "getDomainName", (params, callback) => {
        callback(null, null);
      });
      const plugin = constructPlugin({
        domainName: "test_domain",
      });
      plugin.initializeVariables();

      return plugin.domainSummary().then(() => {
        // check if distribution domain name is printed
      }).catch((err) => {
        const expectedErrorMessage = `Error: Unable to fetch information about test_domain`;
        expect(err.message).to.equal(expectedErrorMessage);
      });
    });

    it("Should log if SLS_DEBUG is set", async () => {
      const plugin = constructPlugin({
        domainName: "test_domain",
      });
      plugin.initializeVariables();

      // set sls debug to true
      process.env.SLS_DEBUG = "True";
      plugin.logIfDebug("test message");
      expect(consoleOutput).to.contain("test message");
    });

    it("Should not log if SLS_DEBUG is not set", async () => {
      const plugin = constructPlugin({
        domainName: "test_domain",
      });

      plugin.initializeVariables();

      plugin.logIfDebug("test message");
      expect(consoleOutput).to.not.contain("test message");
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
      process.env.SLS_DEBUG = "";
    });
  });

  describe("Summary Printing", () => {
    it("Prints Summary", async () => {
      AWS.mock("ApiGatewayV2", "getDomainName", (params, callback) => {
        callback(null, { DomainName: params,
          DomainNameConfigurations: [ {ApiGatewayDomainName: "test_alias_name", HostedZoneId: "test_zone_id"} ] });
      });
      const plugin = constructPlugin({
        domainName: "test_domain",
      });

      plugin.initializeVariables();

      await plugin.domainSummary();
      expect(consoleOutput[0]).to.contain("Serverless Domain Manager Summary");
      expect(consoleOutput[1]).to.contain("test_domain");
      expect(consoleOutput[2]).to.contain("test_alias_name");
      expect(consoleOutput[3]).to.contain("test_zone_id");
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
    });
  });

  describe("Enable/disable functionality", () => {
    it("Should enable the plugin by default", () => {
      const plugin = constructPlugin({
        domainName: "test_domain",
      });

      plugin.initializeVariables();

      const returnedCreds = plugin.apigateway.config.credentials;
      const returnedCredsV2 = plugin.apigatewayv2.config.credentials;
      expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
      expect(returnedCredsV2.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCredsV2.sessionToken).to.equal(testCreds.sessionToken);
      expect(plugin.domains[0].enabled).to.equal(true);
    });

    it("Should be disabled by default (Websocket)", () => {
      const plugin = constructPlugin({
        domainName: "test_domain",
      });

      plugin.initializeVariables();

      const returnedCreds = plugin.apigateway.config.credentials;
      const returnedCredsV2 = plugin.apigatewayv2.config.credentials;
      expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
      expect(returnedCredsV2.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCredsV2.sessionToken).to.equal(testCreds.sessionToken);
      expect(plugin.domains[0].websocket).to.equal(false);
    });

    it("Should enable the plugin when passing a true parameter with type boolean (REST | Websocket)", () => {
      const plugin = constructPlugin({
        domainName: "test_domain",
        enabled: true,
        websocket: true,
      });

      plugin.initializeVariables();

      const returnedCreds = plugin.apigateway.config.credentials;
      const returnedCredsV2 = plugin.apigatewayv2.config.credentials;
      expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
      expect(returnedCredsV2.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCredsV2.sessionToken).to.equal(testCreds.sessionToken);
      expect(plugin.domains[0].enabled).to.equal(true);
      expect(plugin.domains[0].websocket).to.equal(true);
    });

    it("Should enable the plugin when passing a true parameter with type string (REST | Websocket)", () => {
      const plugin = constructPlugin({
        enabled: "true",
        websocket: "true",
      });

      plugin.initializeVariables();

      const returnedCreds = plugin.apigateway.config.credentials;
      const returnedCredsV2 = plugin.apigatewayv2.config.credentials;
      expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
      expect(returnedCredsV2.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCredsV2.sessionToken).to.equal(testCreds.sessionToken);
      expect(plugin.domains[0].enabled).to.equal(true);
      expect(plugin.domains[0].websocket).to.equal(true);
    });

    it("Should disable the plugin when passing a false parameter with type boolean (REST | Websocket)", () => {
      const plugin = constructPlugin({
        enabled: false,
        websocket: false,
      });

      plugin.initializeVariables();

      expect(plugin.domains[0].enabled).to.equal(false);
      expect(plugin.domains[0].websocket).to.equal(false);
    });

    it("Should disable the plugin when passing a false parameter with type string (REST | Websocket)", () => {
      const plugin = constructPlugin({
        enabled: "false",
        websocket: "false",
      });

      plugin.initializeVariables();

      expect(plugin.domains[0].enabled).to.equal(false);
      expect(plugin.domains[0].websocket).to.equal(false);
    });

    it("setupMappings should do nothing when domain manager is disabled (REST | Websocket)", async () => {
      const plugin = constructPlugin({
        enabled: false,
        websocket: false,
      });

      const result = await plugin.hookWrapper(plugin.propogateMappings);

      expect(plugin.domains[0].enabled).to.equal(false);
      expect(plugin.domains[0].websocket).to.equal(false);
      expect(result).to.equal(undefined);
    });

    it("removeMappings should do nothing when domain manager is disabled (REST | Websocket)", async () => {
      const plugin = constructPlugin({
        enabled: false,
        websocket: false,
      });

      const result = await plugin.hookWrapper(plugin.propogateMappings);

      expect(plugin.domains[0].enabled).to.equal(false);
      expect(plugin.domains[0].websocket).to.equal(false);
      expect(result).to.equal(undefined);
    });

    it("domainSummary should do nothing when domain manager is disabled (REST | Websocket)", async () => {
      const plugin = constructPlugin({
        enabled: false,
        websocket: false,
      });

      const result = await plugin.hookWrapper(plugin.domainSummary);

      expect(plugin.domains[0].enabled).to.equal(false);
      expect(plugin.domains[0].websocket).to.equal(false);
      expect(result).to.equal(undefined);
    });

    it("Should throw an Error when passing a parameter that is not boolean (REST | Websocket)", () => {
      const stringWithValueYes = "yes";
      const plugin = constructPlugin({
        enabled: 0,
        websocket: 0,
      });

      let errored = false;
      try {
        plugin.initializeVariables();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal("serverless-domain-manager: Ambiguous enablement boolean: \"0\"");
      }
      expect(errored).to.equal(true);
    });

    it("Should throw an Error when passing a parameter that cannot be converted to boolean (REST | Websocket)", () => {
      const plugin = constructPlugin({
        enabled: "yes",
        websocket: "yes",
      });

      let errored = false;
      try {
        plugin.initializeVariables();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal("serverless-domain-manager: Ambiguous enablement boolean: \"yes\"");
      }
      expect(errored).to.equal(true);
    });

    afterEach(() => {
      consoleOutput = [];
    });
  });

  describe("Missing plugin configuration", () => {
    it("Should thrown an Error when plugin customDomain configuration object is missing", () => {
      const plugin = constructPlugin({});
      delete plugin.serverless.service.custom.customDomain;

      let errored = false;
      try {
        plugin.initializeVariables();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal("serverless-domain-manager: Plugin configuration is missing.");
      }
      expect(errored).to.equal(true);
    });

    it("Should thrown an Error when Serverless custom configuration object is missing", () => {
      const plugin = constructPlugin({});
      delete plugin.serverless.service.custom;

      let errored = false;
      try {
        plugin.initializeVariables();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal("serverless-domain-manager: Plugin configuration is missing.");
      }
      expect(errored).to.equal(true);
    });

    it("Should set endpoint type to regional per default (Websocket)", () => {
      const plugin = constructPlugin({
        websocket: true,
      });

      plugin.initializeVariables();
      expect(plugin.domains[0].endpointType).to.equal("REGIONAL");
    });

    it("Should set endpoint type to regional even if missing  (Websocket)", () => {
      const plugin = constructPlugin({
        websocket: true,
      });

      plugin.initializeVariables();
      expect(plugin.domains[0].endpointType).to.equal("REGIONAL");
    });

    afterEach(() => {
      consoleOutput = [];
    });
  });
});

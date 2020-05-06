import * as aws from "aws-sdk";
import * as AWS from "aws-sdk-mock";
import chai = require("chai");
import spies = require("chai-spies");
import "mocha";
import DomainInfo = require("../../DomainInfo");
import DomainConfig = require("../../DomainConfig");
import Globals from "../../Globals";
import ServerlessCustomDomain = require("../../index");

const expect = chai.expect;
chai.use(spies);

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
        customDomain: {
          apiType: customDomainOptions.apiType,
          autoDomain: customDomainOptions.autoDomain,
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
        },
      },
      provider: {
        apiGateway: {
          restApiId: null,
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
    const plugin = constructPlugin({});

    plugin.initializeVariables();

    const returnedCreds = plugin.apigateway.config.credentials;
    expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
    expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
  });

  describe("Domain Endpoint types", () => {
    it("Unsupported endpoint types throw exception", () => {
      const plugin = constructPlugin({ endpointType: "notSupported" });

      let errored = false;
      try {
        plugin.initializeVariables();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal("notSupported is not supported endpointType, use edge or regional.");
      }
      expect(errored).to.equal(true);
    });

    it("Unsupported api type throw exception", () => {
      const plugin = constructPlugin({ apiType: "notSupported" });

      let errored = false;
      try {
        plugin.initializeVariables();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal("notSupported is not supported api type, use REST, HTTP or WEBSOCKET.");
      }
      expect(errored).to.equal(true);
    });

    it("Unsupported HTTP EDGE endpoint configuration", () => {
      const plugin = constructPlugin({ apiType: "http" });

      let errored = false;
      try {
        plugin.initializeVariables();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal("Error: 'edge' endpointType is not compatible with HTTP APIs");
      }
      expect(errored).to.equal(true);
    });

    it("Unsupported WS EDGE endpoint configuration", () => {
      const plugin = constructPlugin({ apiType: "websocket" });

      let errored = false;
      try {
        plugin.initializeVariables();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal("Error: 'edge' endpointType is not compatible with WebSocket APIs");
      }
      expect(errored).to.equal(true);
    });

  });

  describe("Set Domain Name and Base Path", () => {
    it("Creates basepath mapping for edge REST api", async () => {
      AWS.mock("APIGateway", "createBasePathMapping", (params, callback) => {
        callback(null, params);
      });
      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
        endpointType: "edge",
      });
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();

      const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
      dc.apiId = "test_rest_api_id";

      const spy = chai.spy.on(plugin.apigateway, "createBasePathMapping");

      await plugin.createBasePathMapping(dc);

      expect(spy).to.have.been.called.with({
        basePath: "test_basepath",
        domainName: "test_domain",
        restApiId: "test_rest_api_id",
        stage: "test",
      });
    });

    it("Creates basepath mapping for regional HTTP/Websocket api", async () => {
      AWS.mock("ApiGatewayV2", "createApiMapping", (params, callback) => {
        callback(null, params);
      });
      const plugin = constructPlugin({
        apiType: "http",
        basePath: "test_basepath",
        domainName: "test_domain",
        endpointType: "regional",
      });
      plugin.initializeVariables();
      plugin.apigatewayV2 = new aws.ApiGatewayV2();

      const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

      dc.apiId = "test_rest_api_id";

      const spy = chai.spy.on(plugin.apigatewayV2, "createApiMapping");

      await plugin.createBasePathMapping(dc);
      expect(spy).to.have.been.called.with({
        ApiId: "test_rest_api_id",
        ApiMappingKey: "test_basepath",
        DomainName: "test_domain",
        Stage: "$default",
      });
    });

    it("Updates basepath mapping for a edge REST api", async () => {
      AWS.mock("APIGateway", "updateBasePathMapping", (params, callback) => {
        callback(null, params);
      });
      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
      });
      plugin.initializeVariables();

      plugin.apigateway = new aws.APIGateway();

      const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

      dc.apiMapping = {ApiMappingKey: "old_basepath"};

      const spy = chai.spy.on(plugin.apigateway, "updateBasePathMapping");

      await plugin.updateBasePathMapping(dc);
      expect(spy).to.have.been.called.with({
        basePath: "old_basepath",
        domainName: "test_domain",
        patchOperations: [
          {
            op: "replace",
            path: "/basePath",
            value: "test_basepath",
          },
        ],
      });
    });

    it("Updates basepath mapping for regional HTTP/WS api", async () => {
      AWS.mock("ApiGatewayV2", "updateApiMapping", (params, callback) => {
        callback(null, params);
      });
      const plugin = constructPlugin({
        apiType: "http",
        basePath: "test_basepath",
        domainName: "test_domain",
        endpointType: "regional",
      });
      plugin.initializeVariables();

      plugin.apigatewayV2 = new aws.ApiGatewayV2();

      const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
      dc.apiId = "test_api_id",
      dc.apiMapping = {ApiMappingId: "test_mapping_id"};

      const spy = chai.spy.on(plugin.apigatewayV2, "updateApiMapping");

      await plugin.updateBasePathMapping(dc);
      expect(spy).to.have.been.called.with({
        ApiId: "test_api_id",
        ApiMappingId: "test_mapping_id",
        ApiMappingKey: dc.basePath,
        DomainName: dc.givenDomainName,
        Stage: "$default",
      });
    });

    it("Remove basepath mappings", async () => {
      AWS.mock("CloudFormation", "describeStackResource", (params, callback) => {
        callback(null, {
          StackResourceDetail:
          {
            LogicalResourceId: "ApiGatewayRestApi",
            PhysicalResourceId: "test_rest_api_id",
          },
        });
      });
      AWS.mock("ApiGatewayV2", "getApiMappings", (params, callback) => {
        callback(null, {
          Items: [
            { ApiId: "test_rest_api_id", MappingKey: "test", ApiMappingId: "test_mapping_id", Stage: "test" },
          ],
        });
      });
      AWS.mock("ApiGatewayV2", "deleteApiMapping", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
        restApiId: "test_rest_api_id",
      });
      plugin.initializeVariables();

      plugin.apigatewayV2 = new aws.ApiGatewayV2();
      plugin.cloudformation = new aws.CloudFormation();

      plugin.domains[0].apiMapping = {ApiMappingId: "test_mapping_id"};

      const spy = chai.spy.on(plugin.apigatewayV2, "deleteApiMapping");

      await plugin.removeBasePathMappings();
      expect(spy).to.have.been.called.with({
          ApiMappingId: "test_mapping_id",
          DomainName: "test_domain",
        });
    });

    it("Add Distribution Domain Name, Domain Name, and HostedZoneId to stack output", () => {
      const plugin = constructPlugin({
        domainName: "test_domain",
      });

      const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

      dc.domainInfo = new DomainInfo({
        distributionDomainName: "fake_dist_name",
        distributionHostedZoneId: "fake_zone_id",
        domainName: "fake_domain",
      });

      plugin.addOutputs(dc);

      const cfTemplate = plugin.serverless.service.provider.compiledCloudFormationTemplate.Outputs;
      expect(cfTemplate).to.not.equal(undefined);
    });

    it("(none) is added if basepath is an empty string", async () => {
      AWS.mock("APIGateway", "createBasePathMapping", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        basePath: "",
        domainName: "test_domain",
      });
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();

      const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

      dc.apiId = "test_rest_api_id";

      const spy = chai.spy.on(plugin.apigateway, "createBasePathMapping");

      await plugin.createBasePathMapping(dc);
      expect(spy).to.have.been.called.with({
        basePath: "(none)",
        domainName: "test_domain",
        restApiId: "test_rest_api_id",
        stage: "test",
      });
    });

    it("(none) is added if no value is given for basepath (null)", async () => {
      AWS.mock("APIGateway", "createBasePathMapping", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        basePath: null,
        domainName: "test_domain",
      });
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();

      const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

      dc.apiId = "test_rest_api_id";

      const spy = chai.spy.on(plugin.apigateway, "createBasePathMapping");

      await plugin.createBasePathMapping(dc);
      expect(spy).to.have.been.called.with({
        basePath: "(none)",
        domainName: "test_domain",
        restApiId: "test_rest_api_id",
        stage: "test",
      });
    });

    it("(none) is added if basepath attribute is missing (undefined)", async () => {
      AWS.mock("APIGateway", "createBasePathMapping", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        domainName: "test_domain",
      });
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();

      const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

      dc.apiId = "test_rest_api_id";

      const spy = chai.spy.on(plugin.apigateway, "createBasePathMapping");

      await plugin.createBasePathMapping(dc);
      expect(spy).to.have.been.called.with({
        basePath: "(none)",
        domainName: "test_domain",
        restApiId: "test_rest_api_id",
        stage: "test",
      });
    });

    it("stage was not given", async () => {
      AWS.mock("APIGateway", "createBasePathMapping", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        domainName: "test_domain",
      });
      plugin.initializeVariables();
      plugin.cloudformation = new aws.CloudFormation();
      plugin.apigateway = new aws.APIGateway();

      const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

      dc.apiId = "test_rest_api_id";

      const spy = chai.spy.on(plugin.apigateway, "createBasePathMapping");

      await plugin.createBasePathMapping(dc);
      expect(spy).to.have.been.called.with({
        basePath: "(none)",
        domainName: "test_domain",
        restApiId: "test_rest_api_id",
        stage: "test",
      });
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
    });
  });

  describe("Create a New Domain Name", () => {
    it("Get a given certificate arn", async () => {
      AWS.mock("ACM", "listCertificates", certTestData);

      const options = {
        certificateArn: "test_given_arn",
        endpointType: "REGIONAL",
      };
      const plugin = constructPlugin(options);
      plugin.acm = new aws.ACM();

      const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

      const result = await plugin.getCertArn(dc);

      expect(result).to.equal("test_given_arn");
    });

    it("Get a given certificate name", async () => {
      AWS.mock("ACM", "listCertificates", certTestData);

      const plugin = constructPlugin({ certificateName: "cert_name" });
      plugin.acm = new aws.ACM();

      const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

      const result = await plugin.getCertArn(dc);

      expect(result).to.equal("test_given_cert_name");
    });

    it("Create a domain name", async () => {
      AWS.mock("APIGateway", "createDomainName", (params, callback) => {
        callback(null, { distributionDomainName: "foo", securityPolicy: "TLS_1_2"});
      });

      const plugin = constructPlugin({ domainName: "test_domain"});
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();

      const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

      dc.certificateArn = "fake_cert";

      await plugin.createCustomDomain(dc);

      expect(dc.domainInfo.domainName).to.equal("foo");
      expect(dc.domainInfo.securityPolicy).to.equal("TLS_1_2");
    });

    it("Create an HTTP domain name", async () => {
      AWS.mock("ApiGatewayV2", "createDomainName", (params, callback) => {
        callback(null, { DomainName: "foo", DomainNameConfigurations: [{SecurityPolicy: "TLS_1_2"}]});
      });

      const plugin = constructPlugin({ domainName: "test_domain", apiType: "http", endpointType: "regional"});
      plugin.initializeVariables();
      plugin.apigatewayV2 = new aws.ApiGatewayV2();

      const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

      dc.certificateArn = "fake_cert";

      await plugin.createCustomDomain(dc);

      expect(dc.domainInfo.domainName).to.equal("foo");
      expect(dc.domainInfo.securityPolicy).to.equal("TLS_1_2");
    });

    it("Create a domain name with specific TLS version", async () => {
      AWS.mock("APIGateway", "createDomainName", (params, callback) => {
        callback(null, { distributionDomainName: "foo", securityPolicy: "TLS_1_2"});
      });

      const plugin = constructPlugin({ domainName: "test_domain", securityPolicy: "tls_1_2"});
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();

      const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

      dc.certificateArn = "fake_cert";

      await plugin.createCustomDomain(dc);

      expect(dc.domainInfo.domainName).to.equal("foo");
      expect(dc.domainInfo.securityPolicy).to.equal("TLS_1_2");
    });

    it("Create a new A Alias Record", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, { HostedZones: [{ Name: "test_domain", Id: "test_host_id", Config: { PrivateZone: false } }] });
      });

      AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({ basePath: "test_basepath", domainName: "test_domain" });
      plugin.route53 = new aws.Route53();

      const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

      dc.domainInfo = new DomainInfo(
        {
          distributionDomainName: "test_distribution_name",
          distributionHostedZoneId: "test_id",
        },
      );

      const spy = chai.spy.on(plugin.route53, "changeResourceRecordSets");

      await plugin.changeResourceRecordSet("UPSERT", dc);

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

    it("Do not create a Route53 record", async () => {
      const plugin = constructPlugin({
        createRoute53Record: false,
        domainName: "test_domain",
      });

      const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

      const result = await plugin.changeResourceRecordSet("UPSERT", dc);
      expect(result).to.equal(undefined);
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
    });
  });

  describe("Gets existing basepath mappings correctly", () => {
    it("Returns undefined if no basepaths map to current api", async () => {
      AWS.mock("ApiGatewayV2", "getApiMappings", (params, callback) => {
        callback(null, {
          Items: [
            { ApiId: "someother_api_id", MappingKey: "test", ApiMappingId: "test_rest_api_id_one", Stage: "test" },
          ],
        });
      });

      const plugin = constructPlugin({
        domainName: "test_domain",
      });

      const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
      dc.apiMapping = {ApiMappingId: "api_id"};

      plugin.initializeVariables();

      const result = await plugin.getBasePathMapping(dc);
      expect(result).to.equal(undefined);
    });

    it("Returns current api mapping", async () => {
      AWS.mock("ApiGatewayV2", "getApiMappings", (params, callback) => {
        callback(null, {
          Items: [
            { ApiId: "test_rest_api_id", ApiMappingKey: "api", ApiMappingId: "fake_id", Stage: "test" },
          ],
        });
      });

      const plugin = constructPlugin({
        apiType: Globals.apiTypes.rest,
        basePath: "api",
        domainName: "test_domain",
      });

      const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
      dc.apiId = "test_rest_api_id";

      plugin.initializeVariables();

      const result = await plugin.getBasePathMapping(dc);
      expect(result).to.eql({
        ApiId: "test_rest_api_id",
        ApiMappingId: "fake_id",
        ApiMappingKey: "api",
        Stage: "test" });
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
    });
  });

  describe("Gets Rest API id correctly", () => {
    it("Gets REST API id correctly when no ApiGateway specified", async () => {
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
        basePath: "test_basepath",
        domainName: "test_domain",
      });
      plugin.initializeVariables();
      plugin.cloudformation = new aws.CloudFormation();

      const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

      const spy = chai.spy.on(plugin.cloudformation, "describeStackResource");

      const result = await plugin.getApiId(dc);

      expect(result).to.equal("test_rest_api_id");
      expect(spy).to.have.been.called.with({
        LogicalResourceId: "ApiGatewayRestApi",
        StackName: "custom-stage-name",
      });
    });

    it("Gets HTTP API id correctly when no ApiGateway specified", async () => {
      AWS.mock("CloudFormation", "describeStackResource", (params, callback) => {
        callback(null, {
          StackResourceDetail:
            {
              LogicalResourceId: "HttpApi",
              PhysicalResourceId: "test_http_api_id",
            },
        });
      });
      const plugin = constructPlugin({
        apiType: "http",
        basePath: "test_basepath",
        domainName: "test_domain",
        endpointType: "regional",
      });
      plugin.initializeVariables();
      plugin.cloudformation = new aws.CloudFormation();

      const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

      const spy = chai.spy.on(plugin.cloudformation, "describeStackResource");

      const result = await plugin.getApiId(dc);
      expect(result).to.equal("test_http_api_id");
      expect(spy).to.have.been.called.with({
        LogicalResourceId: "HttpApi",
        StackName: "custom-stage-name",
      });
    });

    it("Gets Websocket API id correctly when no ApiGateway specified", async () => {
      AWS.mock("CloudFormation", "describeStackResource", (params, callback) => {
        callback(null, {
          StackResourceDetail:
            {
              LogicalResourceId: "WebsocketsApi",
              PhysicalResourceId: "test_ws_api_id",
            },
        });
      });
      const plugin = constructPlugin({
        apiType: "websocket",
        basePath: "test_basepath",
        domainName: "test_domain",
        endpointType: "regional",
      });
      plugin.initializeVariables();
      plugin.cloudformation = new aws.CloudFormation();

      const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

      const spy = chai.spy.on(plugin.cloudformation, "describeStackResource");

      const result = await plugin.getApiId(dc);
      expect(result).to.equal("test_ws_api_id");
      expect(spy).to.have.been.called.with({
        LogicalResourceId: "WebsocketsApi",
        StackName: "custom-stage-name",
      });
    });

    it("serverless.yml defines explicitly the apiGateway", async () => {
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
        basePath: "test_basepath",
        domainName: "test_domain",
      });
      plugin.cloudformation = new aws.CloudFormation();
      plugin.serverless.service.provider.apiGateway.restApiId = "custom_test_rest_api_id";

      const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

      const result = await plugin.getApiId(dc);
      expect(result).to.equal("custom_test_rest_api_id");
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
    });
  });

  describe("Delete the new domain", () => {
    it("Find available domains", async () => {
      AWS.mock("APIGateway", "getDomainName", (params, callback) => {
        callback(null, { distributionDomainName: "test_domain" });
      });

      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
      });
      plugin.apigateway = new aws.APIGateway();

      await plugin.getDomainInfo();

      plugin.domains.forEach((domain) => {
        expect(domain.domainInfo.domainName).to.equal("test_domain");
      });
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
      plugin.route53 = new aws.Route53();

      const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

      const spy = chai.spy.on(plugin.route53, "changeResourceRecordSets");

      dc.domainInfo = new DomainInfo({
        distributionDomainName: "test_distribution_name",
        distributionHostedZoneId: "test_id",
      });

      await plugin.changeResourceRecordSet("DELETE", dc);
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
      plugin.apigatewayV2 = new aws.ApiGatewayV2();

      const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

      const spy = chai.spy.on(plugin.apigatewayV2, "deleteDomainName");

      await plugin.deleteCustomDomain(dc);
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
        callback(null, {DomainName: "test_domain",
          DomainNameConfigurations: [{ApiGatewayDomainName: "fake_dist_name"}]});
      });
      AWS.mock("ApiGatewayV2", "getApiMappings", (params, callback) => {
        callback(null, { Items: [] });
      });
      AWS.mock("APIGateway", "createBasePathMapping", (params, callback) => {
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
      const plugin = constructPlugin({ domainName: "test_domain"});
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();
      plugin.apigatewayV2 = new aws.ApiGatewayV2();
      plugin.cloudformation = new aws.CloudFormation();
      const spy = chai.spy.on(plugin, "createBasePathMapping");

      await plugin.setupBasePathMappings();

      expect(spy).to.be.called();
    });

    it("deleteDomain", async () => {
      AWS.mock("ApiGatewayV2", "getDomainName", (params, callback) => {
        callback(null, {DomainName: "test_domain", DomainNameConfigurations: [{HostedZoneId: "test_id"}]});
      });
      AWS.mock("ApiGatewayV2", "deleteDomainName", (params, callback) => {
        callback(null, {});
      });
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, { HostedZones: [{ Name: "test_domain", Id: "test_id", Config: { PrivateZone: false } }] });
      });
      AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({ domainName: "test_domain"});
      plugin.apigateway = new aws.APIGateway();
      plugin.route53 = new aws.Route53();
      plugin.initializeVariables();

      await plugin.deleteDomains();
      expect(consoleOutput[0]).to.equal(`Custom domain ${plugin.domains[0].givenDomainName} was deleted.`);
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

      const plugin = constructPlugin({ domainName: "test_domain" });
      plugin.apigateway = new aws.APIGateway();
      plugin.route53 = new aws.Route53();
      plugin.acm = new aws.ACM();

      plugin.initializeVariables();
      await plugin.createDomains();

      expect(consoleOutput[0]).to.equal(`Custom domain ${plugin.domains[0].givenDomainName} was created.
                        New domains may take up to 40 minutes to be initialized.`);
    });

    it("Does not create domain if one existed before", async () => {
      AWS.mock("ACM", "listCertificates", certTestData);
      AWS.mock("ApiGatewayV2", "getDomainName", (params, callback) => {
        callback(null, {DomainName: "test_domain", DomainNameConfigurations: [{HostedZoneId: "test_id"}]});
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

      const plugin = constructPlugin({ domainName: "test_domain" });
      plugin.apigateway = new aws.APIGateway();
      plugin.route53 = new aws.Route53();
      plugin.acm = new aws.ACM();
      plugin.initializeVariables();
      await plugin.createDomains();
      expect(consoleOutput[0]).to.equal(`Custom domain test_domain already exists.`);
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
    });
  });

  describe("Select Hosted Zone", () => {
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

      const plugin = constructPlugin({domainName: "ccc.bbb.aaa.com"});
      plugin.route53 = new aws.Route53();
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

      const plugin = constructPlugin({domainName: "test.ccc.bbb.aaa.com"});
      plugin.route53 = new aws.Route53();
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

      const plugin = constructPlugin({domainName: "test.ccc.bbb.aaa.com"});
      plugin.route53 = new aws.Route53();
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

      const plugin = constructPlugin({domainName: "bar.foo.bbb.fr"});
      plugin.route53 = new aws.Route53();
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

      const plugin = constructPlugin({domainName: "test.a.aaa.com"});
      plugin.route53 = new aws.Route53();
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

      const plugin = constructPlugin({domainName: "bar.foo.bbb.fr"});
      plugin.route53 = new aws.Route53();
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

      const plugin = constructPlugin({domainName: "bar.foo.bbb.fr"});
      plugin.route53 = new aws.Route53();
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

      const plugin = constructPlugin({domainName: "bar.foo.bbb.fr"});
      plugin.route53 = new aws.Route53();
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

      const plugin = constructPlugin({domainName: "aaa.com", hostedZonePrivate: true});
      plugin.route53 = new aws.Route53();
      plugin.initializeVariables();

      const result = await plugin.getRoute53HostedZoneId(plugin.domains[0]);
      expect(result).to.equal("test_id_0");
    });

    it("Undefined hostedZonePrivate should still allow private domains", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: "aaa.com.", Id: "/hostedzone/test_id_0", Config: { PrivateZone: true } },
          ],
        });
      });

      const plugin = constructPlugin({domainName: "aaa.com"});
      plugin.route53 = new aws.Route53();
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

      const options = {
        certificateName: "does_not_exist",
        domainName: "",
      };
      const plugin = constructPlugin(options);
      plugin.acm = new aws.ACM();
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

      const plugin = constructPlugin({ domainName: "test_domain"});
      plugin.route53 = new aws.Route53();
      plugin.initializeVariables();

      return plugin.getRoute53HostedZoneId(plugin.domains[0]).then(() => {
        throw new Error("Test has failed, getHostedZone did not catch errors.");
      }).catch((err) => {
        const expectedErrorMessage = "Error: Could not find hosted zone \"test_domain\"";
        expect(err.message).to.equal(expectedErrorMessage);
      });
    });

    it("Domain summary failed", async () => {
      AWS.mock("APIGateway", "getDomainName", (params, callback) => {
        callback(null, null);
      });
      const plugin = constructPlugin({ domainName: "test_domain"});
      plugin.apigateway = new aws.APIGateway();
      plugin.initializeVariables();

      return plugin.domainSummaries().then(() => {
        // check if distribution domain name is printed
      }).catch((err) => {
        const expectedErrorMessage = `Error: Unable to fetch information about test_domain`;
        expect(err.message).to.equal(expectedErrorMessage);
      });
    });

    it("Should log if SLS_DEBUG is set", async () => {
      const plugin = constructPlugin({ domainName: "test_domain" });
      plugin.initializeVariables();

      // set sls debug to true
      process.env.SLS_DEBUG = "True";
      plugin.logIfDebug("test message");
      expect(consoleOutput[0]).to.contain("test message");
    });

    it("Should not log if SLS_DEBUG is not set", async () => {
      const plugin = constructPlugin({ domainName: "test_domain" });
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
        callback(null, { domainName: params, distributionDomainName: "test_distributed_domain_name" });
      });
      const plugin = constructPlugin({domainName: "test_domain"});
      plugin.apigatewayV2 = new aws.ApiGatewayV2();
      plugin.initializeVariables();

      await plugin.domainSummaries();
      expect(consoleOutput[0]).to.contain("Serverless Domain Manager Summary");
      expect(consoleOutput[1]).to.contain("Distribution Domain Name");
      expect(consoleOutput[2]).to.contain("test_domain");
      expect(consoleOutput[3]).to.contain("test_distributed_domain_name");
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
    });
  });

  describe("Enable/disable functionality", () => {
    it("Should enable the plugin by default", () => {
      const plugin = constructPlugin({});

      plugin.initializeVariables();

      const returnedCreds = plugin.apigateway.config.credentials;
      expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
      expect(plugin.domains).length.to.be.greaterThan(0);
      for (const domain of plugin.domains) {
        expect(domain.enabled).to.equal(true);
      }
    });

    it("Should enable the plugin when passing a true parameter with type boolean", () => {
      const plugin = constructPlugin({ enabled: true });

      plugin.initializeVariables();

      const returnedCreds = plugin.apigateway.config.credentials;
      expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
      expect(plugin.domains).length.to.be.greaterThan(0);
      for (const domain of plugin.domains) {
        expect(domain.enabled).to.equal(true);
      }
    });

    it("Should enable the plugin when passing a true parameter with type string", () => {
      const plugin = constructPlugin({ enabled: "true" });

      plugin.initializeVariables();

      const returnedCreds = plugin.apigateway.config.credentials;
      expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
      expect(plugin.domains).length.to.be.greaterThan(0);
      for (const domain of plugin.domains) {
        expect(domain.enabled).to.equal(true);
      }
    });

    it("Should disable the plugin when passing a false parameter with type boolean", () => {
      const plugin = constructPlugin({ enabled: false });

      plugin.initializeVariables();

      expect(plugin.domains.length).to.equal(0);
    });

    it("Should disable the plugin when passing a false parameter with type string", () => {
      const plugin = constructPlugin({ enabled: "false" });

      plugin.initializeVariables();

      expect(plugin.domains.length).to.equal(0);
    });

    it("createDomain should do nothing when domain manager is disabled", async () => {
      const plugin = constructPlugin({ enabled: false });

      await plugin.hookWrapper(plugin.createDomains);

      expect(plugin.domains.length).to.equal(0);
    });

    it("deleteDomain should do nothing when domain manager is disabled", async () => {
      const plugin = constructPlugin({ enabled: false });

      await plugin.hookWrapper(plugin.deleteDomains);

      expect(plugin.domains.length).to.equal(0);
    });

    it("setUpBasePathMapping should do nothing when domain manager is disabled", async () => {
      const plugin = constructPlugin({ enabled: false });

      await plugin.hookWrapper(plugin.setupBasePathMappings);

      expect(plugin.domains.length).to.equal(0);
    });

    it("removeBasePathMapping should do nothing when domain manager is disabled", async () => {
      const plugin = constructPlugin({ enabled: false });

      await plugin.hookWrapper(plugin.removeBasePathMappings);

      expect(plugin.domains.length).to.equal(0);
    });

    it("domainSummary should do nothing when domain manager is disabled", async () => {
      const plugin = constructPlugin({ enabled: false });

      await plugin.hookWrapper(plugin.domainSummaries);

      expect(plugin.domains.length).to.equal(0);
    });

    it("Should throw an Error when passing a parameter that is not boolean", () => {
      const plugin = constructPlugin({ enabled: 0 });

      let errored = false;
      try {
        plugin.initializeVariables();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal("serverless-domain-manager: Ambiguous enablement boolean: \"0\"");
      }
      expect(errored).to.equal(true);
    });

    it("Should throw an Error when passing a parameter that cannot be converted to boolean", () => {
      const plugin = constructPlugin({ enabled: "yes" });

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

    afterEach(() => {
      consoleOutput = [];
    });
  });

  describe("autoDomain deploy", () => {
    it("Should be disabled by default", () => {
      const plugin = constructPlugin({ domainName: "test_domain" });
      plugin.initializeVariables();
      expect(plugin.serverless.service.custom.customDomain.autoDomain).to.equal(undefined);
    });

    it("updateCloudFormationOutputs should call createDomain when autoDomain is true", async () => {
      AWS.mock("ApiGatewayV2", "getDomainName", (params, callback) => {
        callback(null, params);
      });
      const plugin = constructPlugin({
        autoDomain: true,
        basePath: "test_basepath",
        createRoute53Record: false,
        domainName: "test_domain",
        restApiId: "test_rest_api_id",
      });
      plugin.initializeVariables();

      plugin.apigateway = new aws.APIGateway();
      plugin.apigatewayV2 = new aws.ApiGatewayV2();
      plugin.cloudformation = new aws.CloudFormation();

      plugin.domains[0].apiMapping = {ApiMappingId: "test_mapping_id"};

      const spy = chai.spy.on(plugin.apigatewayV2, "getDomainName");

      await plugin.updateCloudFormationOutputs();

      expect(plugin.serverless.service.custom.customDomain.autoDomain).to.equal(true);
      expect(spy).to.have.been.called();
    });

    it("updateCloudFormationOutputs should not call createDomain when autoDomain is not true", async () => {
      AWS.mock("ApiGatewayV2", "getDomainName", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        autoDomain: false,
        basePath: "test_basepath",
        createRoute53Record: false,
        domainName: "test_domain",
        restApiId: "test_rest_api_id",
      });
      plugin.initializeVariables();

      plugin.apigateway = new aws.APIGateway();
      plugin.apigatewayV2 = new aws.ApiGatewayV2();
      plugin.cloudformation = new aws.CloudFormation();

      plugin.domains[0].apiMapping = {ApiMappingId: "test_mapping_id"};

      const spy1 = chai.spy.on(plugin.apigateway, "createDomainName");
      const spy2 = chai.spy.on(plugin.apigatewayV2, "createDomainName");

      await plugin.updateCloudFormationOutputs();

      expect(plugin.serverless.service.custom.customDomain.autoDomain).to.equal(false);
      expect(spy1).to.have.not.been.called();
      expect(spy2).to.have.not.been.called();
    });

    it("removeBasePathMapping should call deleteDomain when autoDomain is true", async () => {
      AWS.mock("CloudFormation", "describeStackResource", (params, callback) => {
        callback(null, {
          StackResourceDetail:
          {
            LogicalResourceId: "ApiGatewayRestApi",
            PhysicalResourceId: "test_rest_api_id",
          },
        });
      });
      AWS.mock("ApiGatewayV2", "getApiMappings", (params, callback) => {
        callback(null, {
          Items: [
            { ApiId: "test_rest_api_id", MappingKey: "test", ApiMappingId: "test_mapping_id", Stage: "test" },
          ],
        });
      });
      AWS.mock("ApiGatewayV2", "deleteApiMapping", (params, callback) => {
        callback(null, params);
      });
      AWS.mock("ApiGatewayV2", "deleteDomainName", (params, callback) => {
        callback(null, params);
      });
      AWS.mock("ApiGatewayV2", "getDomainName", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        autoDomain: true,
        basePath: "test_basepath",
        createRoute53Record: false,
        domainName: "test_domain",
        restApiId: "test_rest_api_id",
      });
      plugin.initializeVariables();

      plugin.apigatewayV2 = new aws.ApiGatewayV2();
      plugin.cloudformation = new aws.CloudFormation();

      plugin.domains[0].apiMapping = {ApiMappingId: "test_mapping_id"};

      const spy = chai.spy.on(plugin.apigatewayV2, "deleteDomainName");

      await plugin.removeBasePathMappings();

      expect(plugin.serverless.service.custom.customDomain.autoDomain).to.equal(true);
      expect(spy).to.have.been.called.with({DomainName: "test_domain"});
    });

    it("removeBasePathMapping should not call deleteDomain when autoDomain is not true", async () => {
      AWS.mock("CloudFormation", "describeStackResource", (params, callback) => {
        callback(null, {
          StackResourceDetail:
          {
            LogicalResourceId: "ApiGatewayRestApi",
            PhysicalResourceId: "test_rest_api_id",
          },
        });
      });
      AWS.mock("ApiGatewayV2", "getApiMappings", (params, callback) => {
        callback(null, {
          Items: [
            { ApiId: "test_rest_api_id", MappingKey: "test", ApiMappingId: "test_mapping_id", Stage: "test" },
          ],
        });
      });
      AWS.mock("ApiGatewayV2", "deleteApiMapping", (params, callback) => {
        callback(null, params);
      });
      AWS.mock("ApiGatewayV2", "deleteDomainName", (params, callback) => {
        callback(null, params);
      });
      AWS.mock("ApiGatewayV2", "getDomainName", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        autoDomain: false,
        basePath: "test_basepath",
        createRoute53Record: false,
        domainName: "test_domain",
        restApiId: "test_rest_api_id",
      });
      plugin.initializeVariables();

      plugin.apigatewayV2 = new aws.ApiGatewayV2();
      plugin.cloudformation = new aws.CloudFormation();

      plugin.domains[0].apiMapping = {ApiMappingId: "test_mapping_id"};

      const spy = chai.spy.on(plugin.apigatewayV2, "deleteDomainName");

      await plugin.removeBasePathMappings();

      expect(plugin.serverless.service.custom.customDomain.autoDomain).to.equal(false);
      expect(spy).to.have.not.been.called();
    });

    afterEach(() => {
      consoleOutput = [];
    });
  });
});

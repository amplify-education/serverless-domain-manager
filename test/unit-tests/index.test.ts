import * as aws from "aws-sdk";
import * as AWS from "aws-sdk-mock";
import chai = require("chai");
import spies = require("chai-spies");
import "mocha";
import DomainInfo = require("../../DomainInfo");
import DomainInfoWs = require("../../DomainInfoWs");
import ServerlessCustomDomain = require("../../index");
import { ServerlessInstance, ServerlessOptions } from "../../types";

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
        },
      },
    },
    service: {
      custom: {
        customDomain: {
          basePath: customDomainOptions.basePath,
          certificateArn: customDomainOptions.certificateArn,
          certificateName: customDomainOptions.certificateName,
          createRoute53Record: customDomainOptions.createRoute53Record,
          domainName: customDomainOptions.domainName,
          enabled: customDomainOptions.enabled,
          endpointType: customDomainOptions.endpointType,
          hostedZoneId: customDomainOptions.hostedZoneId,
          hostedZonePrivate: customDomainOptions.hostedZonePrivate,
          stage: customDomainOptions.stage,
          websockets: {
            domainName: customDomainOptions.websockets.domainName,
            basePath: customDomainOptions.websockets.basePath,
            stage: customDomainOptions.websockets.stage,
            certificateName: customDomainOptions.websockets.certificateName,
            certificateArn: customDomainOptions.websockets.certificateArn,
            createRoute53Record: customDomainOptions.websockets.createRoute53Record,
            endpointType: customDomainOptions.websockets.endpointType,
            hostedZoneId: customDomainOptions.websockets.hostedZoneId,
            hostedZonePrivate: customDomainOptions.websockets.hostedZonePrivate,
            enabled: customDomainOptions.websockets.enabled,
          },
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
    const plugin = constructPlugin({ websockets: {} });

    plugin.initializeVariables();

    const returnedCreds = plugin.apigateway.config.credentials;
    const returnedCredsV2 = plugin.apigatewayv2.config.credentials;
    expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
    expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
    expect(returnedCredsV2.accessKeyId).to.equal(testCreds.accessKeyId);
    expect(returnedCredsV2.sessionToken).to.equal(testCreds.sessionToken);
  });

  describe("Domain Endpoint types", () => {
    it("Unsupported REST endpoint types throw exception", () => {
      const plugin = constructPlugin({
        endpointType: "notSupported",
        websockets: {} 
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

    it("Unsupported websocket endpoint types throw exception", () => {
      const plugin = constructPlugin({
        websockets: {
          endpointType: "notSupported",
        } 
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
    it("Creates basepath mapping", async () => {
      AWS.mock("APIGateway", "createBasePathMapping", (params, callback) => {
        callback(null, params);
      });
      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
        websockets: {},
      });
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;
      plugin.basePath = plugin.serverless.service.custom.customDomain.basePath;
      const spy = chai.spy.on(plugin.apigateway, "createBasePathMapping");

      await plugin.createBasePathMapping("test_rest_api_id");
      expect(spy).to.have.been.called.with({
        basePath: "test_basepath",
        domainName: "test_domain",
        restApiId: "test_rest_api_id",
        stage: "test",
      });
    });

    it("Creates websocket API mapping", async () => {
      AWS.mock("ApiGatewayV2", "createApiMapping", (params, callback) => {
        callback(null, params);
      });
      const plugin = constructPlugin({
        websockets: {
          domainName: "wss_test_domain",
          stage: "wss_test_stage",
        },
      });
      plugin.initializeVariables();
      plugin.apigatewayv2 = new aws.ApiGatewayV2();
      plugin.givenDomainNameWs = plugin.serverless.service.custom.customDomain.websockets.domainName;
      plugin.stageWs = plugin.serverless.service.custom.customDomain.websockets.stage;
      const spy = chai.spy.on(plugin.apigatewayv2, "createApiMapping");

      await plugin.createApiMappingWs("wss_test_api_id");
      expect(spy).to.have.been.called.with({
        DomainName: "wss_test_domain",
        ApiId: "wss_test_api_id",
        Stage: "wss_test_stage",
        ApiMappingKey: ''
      });
    });

    it("Updates websocket API mapping", async () => {
      AWS.mock("ApiGatewayV2", "updateApiMapping", (params, callback) => {
        callback(null, params);
      });
      const plugin = constructPlugin({
        websockets: {
          domainName: "wss_test_domain",
          stage: "wss_test_stage",
        },
      });
      plugin.initializeVariables();
      plugin.apigatewayv2 = new aws.ApiGatewayV2();
      plugin.givenDomainNameWs = plugin.serverless.service.custom.customDomain.websockets.domainName;
      plugin.stageWs = plugin.serverless.service.custom.customDomain.websockets.stage;
      const spy = chai.spy.on(plugin.apigatewayv2, "updateApiMapping");
 
      await plugin.updateApiMappingWs("wss_test_api_id", "wss_test_api_mapping_id");
      expect(spy).to.have.been.called.with({
        DomainName: "wss_test_domain",
        ApiId: "wss_test_api_id",
        Stage: "wss_test_stage",
        ApiMappingKey: '',
        ApiMappingId: "wss_test_api_mapping_id"
      });
    });

    it("Deletes websocket API mapping", async () => {
      AWS.mock("ApiGatewayV2", "deleteApiMapping", (params, callback) => {
        callback(null, params);
      });
      const plugin = constructPlugin({
        websockets: {
          domainName: "wss_test_domain",
        },
      });
      plugin.initializeVariables();
      plugin.apigatewayv2 = new aws.ApiGatewayV2();
      plugin.givenDomainNameWs = plugin.serverless.service.custom.customDomain.websockets.domainName;
      const spy = chai.spy.on(plugin.apigatewayv2, "deleteApiMapping");
 
      await plugin.deleteApiMappingWs("wss_test_api_id", "wss_test_api_mapping_id");
      expect(spy).to.have.been.called.with({
        DomainName: "wss_test_domain",
        ApiId: "wss_test_api_id",
        ApiMappingId: "wss_test_api_mapping_id"
      });
    });

    it("Updates basepath mapping", async () => {
      AWS.mock("APIGateway", "updateBasePathMapping", (params, callback) => {
        callback(null, params);
      });
      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
        websockets: {}
      });
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;
      plugin.basePath = plugin.serverless.service.custom.customDomain.basePath;
      const spy = chai.spy.on(plugin.apigateway, "updateBasePathMapping");

      await plugin.updateBasePathMapping("old_basepath");
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

    it("Add Domain Name and HostedZoneId to stack output", () => {
      const plugin = constructPlugin({
        domainName: "test_domain",
        websockets: {}
      });
      plugin.addOutputs(new DomainInfo({
        distributionDomainName: "fake_dist_name",
        distributionHostedZoneId: "fake_zone_id",
        domainName: "fake_domain",
      }));
      const cfTemplat = plugin.serverless.service.provider.compiledCloudFormationTemplate.Outputs;
      expect(cfTemplat).to.not.equal(undefined);
    });

    it("(none) is added if basepath is an empty string", async () => {
      AWS.mock("APIGateway", "createBasePathMapping", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        basePath: "",
        domainName: "test_domain",
        websockets: {}
      });
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;
      const spy = chai.spy.on(plugin.apigateway, "createBasePathMapping");

      await plugin.createBasePathMapping("test_rest_api_id");
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
        websockets: {}
      });
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;
      const spy = chai.spy.on(plugin.apigateway, "createBasePathMapping");

      await plugin.createBasePathMapping("test_rest_api_id");
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
        websockets: {}
      });
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;
      const spy = chai.spy.on(plugin.apigateway, "createBasePathMapping");

      await plugin.createBasePathMapping("test_rest_api_id");
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
        websockets: {}
      });
      plugin.initializeVariables();
      plugin.cloudformation = new aws.CloudFormation();
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;
      const spy = chai.spy.on(plugin.apigateway, "createBasePathMapping");

      await plugin.createBasePathMapping("test_rest_api_id");
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
    it("Get a given certificate ARN for a REST domain", async () => {
      AWS.mock("ACM", "listCertificates", certTestData);

      const options = {
        certificateArn: "test_given_arn",
        endpointType: "REGIONAL",
        websockets: {}
      };
      const plugin = constructPlugin(options);
      plugin.acm = new aws.ACM();

      const result = await plugin.getCertArn();

      expect(result).to.equal("test_given_arn");
    });

    it("Get a given certificate name for a REST domain", async () => {
      AWS.mock("ACM", "listCertificates", certTestData);

      const plugin = constructPlugin({ 
        certificateName: "cert_name",
        websockets: {}
      });
      plugin.acm = new aws.ACM();

      const result = await plugin.getCertArn();

      expect(result).to.equal("test_given_cert_name");
    });

    it("Get a given certificate ARN for a websocket domain", async () => {
      AWS.mock("ACM", "listCertificates", certTestData);

      const options = {
        websockets: {
          certificateArn: "wss_test_given_arn",
          endpointType: "REGIONAL",
        }
      };
      const plugin = constructPlugin(options);
      plugin.acmWs = new aws.ACM();
      plugin.certificateArnWs = plugin.serverless.service.custom.customDomain.websockets.certificateArn;
      plugin.endpointType = plugin.serverless.service.custom.customDomain.websockets.endpointType;

      const result = await plugin.getCertArnWs();

      expect(result).to.equal("wss_test_given_arn");
    });

    it("Get a given certificate name for a websocket domain", async () => {
      AWS.mock("ACM", "listCertificates", certTestData);

      const plugin = constructPlugin({ 
        websockets: {
          certificateName: "cert_name",
          endpointType: "REGIONAL",
        }
      });
      plugin.acmWs = new aws.ACM();
      plugin.certificateNameWs = plugin.serverless.service.custom.customDomain.websockets.certificateName;
      plugin.endpointType = plugin.serverless.service.custom.customDomain.websockets.endpointType;

      const result = await plugin.getCertArnWs();

      expect(result).to.equal("test_given_cert_name");
    });

    it("Create a domain name for a REST endpoint", async () => {
      AWS.mock("APIGateway", "createDomainName", (params, callback) => {
        callback(null, { distributionDomainName: "foo" });
      });

      const plugin = constructPlugin({
        domainName: "test_domain",
        websockets: {}
      });
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;

      const result = await plugin.createCustomDomain("fake_cert");

      expect(result.domainName).to.equal("foo");
    });

    it("Create a domain name for a websocket endpoint", async () => {
      AWS.mock("ApiGatewayV2", "createDomainName", (params, callback) => {
        callback(null, { DomainName: "test_domain", DomainNameConfigurations: [ { ApiGatewayDomainName: "apigw" } ] });
      });

      const plugin = constructPlugin({
        websockets: {
          domainName: "test_domain",
        }
      });
      plugin.apigatewayv2 = new aws.ApiGatewayV2();
      plugin.givenDomainNameWs = plugin.serverless.service.custom.customDomain.websockets.domainName;

      const result = await plugin.createCustomDomainWs("fake_cert");

      expect(result.domainName).to.equal("test_domain");
      expect(result.apiGatewayDomainName).to.equal("apigw");
    });

    it("Create a new A Alias Record for a REST domain", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, { HostedZones: [{ Name: "test_domain", Id: "test_host_id", Config: { PrivateZone: false } }] });
      });

      AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        basePath: "test_basepath",
        websockets: {}
      });
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = "test_domain";
      const spy = chai.spy.on(plugin.route53, "changeResourceRecordSets");

      const domain = new DomainInfo(
        {
          distributionDomainName: "test_distribution_name",
          distributionHostedZoneId: "test_id",
        },
      );

      await plugin.changeResourceRecordSet("UPSERT", domain);

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

    it("Create a new A Alias Record for a websocket domain", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, { HostedZones: [{ Name: "test_domain", Id: "test_host_id", Config: { PrivateZone: false } }] });
      });

      AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        websockets: {
          domainName: "test_domain",
        }
      });
      plugin.route53 = new aws.Route53();
      plugin.givenDomainNameWs = plugin.serverless.service.custom.customDomain.websockets.domainName;
      const spy = chai.spy.on(plugin.route53, "changeResourceRecordSets");

      const domain = new DomainInfoWs(
        {
          DomainNameConfigurations: [{
              HostedZoneId: "test_id",
              ApiGatewayDomainName: "test_distribution_name",
          }]
        },
      );

      await plugin.changeResourceRecordSetWs("UPSERT", domain);

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

    it("Do not create a Route53 record for a REST domain", async () => {
      const plugin = constructPlugin({
        createRoute53Record: false,
        domainName: "test_domain",
        websockets: {}
      });
      const result = await plugin.changeResourceRecordSet("UPSERT", new DomainInfo({}));
      expect(result).to.equal(undefined);
    });

    it("Do not create a Route53 record for a websocket domain", async () => {
      const plugin = constructPlugin({
        websockets: {
          createRoute53Record: false,
          domainName: "test_domain",
        }
      });
      const result = await plugin.changeResourceRecordSetWs("UPSERT", new DomainInfoWs({DomainNameConfigurations: [{}]}));
      expect(result).to.equal(undefined);
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
    });
  });

  describe("Gets existing basepath mappings correctly", () => {
    it("Returns undefined if no basepaths map to current restApiId", async () => {
      AWS.mock("APIGateway", "getBasePathMappings", (params, callback) => {
        callback(null, {
          items: [
            { basePath: "(none)", restApiId: "test_rest_api_id_one", stage: "test" },
          ],
        });
      });

      const plugin = constructPlugin({
        domainName: "test_domain",
        websockets: {}
      });
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;
      plugin.basePath = plugin.serverless.service.custom.customDomain.basePath;
      plugin.initializeVariables();

      const result = await plugin.getBasePathMapping("test_rest_api_id_two");
      expect(result).to.equal(undefined);
    });

    it("Returns current api", async () => {
      AWS.mock("APIGateway", "getBasePathMappings", (params, callback) => {
        callback(null, {
          items: [
            { basePath: "api", restApiId: "test_rest_api_id", stage: "test" },
          ],
        });
      });

      const plugin = constructPlugin({
        basePath: "api",
        domainName: "test_domain",
        websockets: {}
      });
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;
      plugin.basePath = plugin.serverless.service.custom.customDomain.basePath;
      plugin.initializeVariables();

      const result = await plugin.getBasePathMapping("test_rest_api_id");
      expect(result).to.equal("api");
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
    });
  });

  describe("Gets existing websocket API mappings correctly", () => {
    it("Returns undefined if no mappings exist for current wssApiId", async () => {
      AWS.mock("ApiGatewayV2", "getApiMappings", (params, callback) => {
        callback(null, {
          Items: [
            { ApiMappingId: "test_api_mapping_id", ApiId: "test_rest_api_id_one", Stage: "test", ApiMappingKey: "" },
          ],
        });
      });

      const plugin = constructPlugin({
        websockets: {
          domainName: "test_domain",
        }
      });
      plugin.givenDomainNameWs = plugin.serverless.service.custom.customDomain.websockets.domainName;
      plugin.initializeVariables();

      const result = await plugin.getApiMappingWs("test_rest_api_id_two");
      expect(result).to.equal(undefined);
    });

    it("Returns current api mapping ID for given wssApiId", async () => {
      AWS.mock("ApiGatewayV2", "getApiMappings", (params, callback) => {
        callback(null, {
          Items: [
            { ApiMappingId: "test_api_mapping_id", ApiId: "test_rest_api_id", Stage: "test", ApiMappingKey: "" },
          ],
        });
      });

      const plugin = constructPlugin({
        websockets: {
          domainName: "test_domain",
        }
      });
      plugin.givenDomainNameWs = plugin.serverless.service.custom.customDomain.websockets.domainName;
      plugin.initializeVariables();

      const result = await plugin.getApiMappingWs("test_rest_api_id");
      expect(result).to.equal("test_api_mapping_id");
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
    });
  });

  describe("Gets Rest API correctly", () => {
    it("Fetches restApiId correctly when no ApiGateway specified", async () => {
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
        websockets: {}
      });
      plugin.cloudformation = new aws.CloudFormation();

      const result = await plugin.getRestApiId();
      expect(result).to.equal("test_rest_api_id");
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
        websockets: {}
      });
      plugin.cloudformation = new aws.CloudFormation();
      plugin.serverless.service.provider.apiGateway.restApiId = "custom_test_rest_api_id";

      const result = await plugin.getRestApiId();
      expect(result).to.equal("custom_test_rest_api_id");
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
    });
  });

  describe("Gets websocket API correctly", () => {
    it("Fetches wssApiId correctly when no ApiGateway specified", async () => {
      AWS.mock("CloudFormation", "describeStackResource", (params, callback) => {
        callback(null, {
          StackResourceDetail:
            {
              LogicalResourceId: "WebsocketsApi",
              PhysicalResourceId: "test_wss_api_id",
            },
        });
      });
      const plugin = constructPlugin({
        websockets: {
          domainName: "test_domain",
        }
      });
      plugin.cloudformation = new aws.CloudFormation();
      plugin.givenDomainNameWs = plugin.serverless.service.custom.customDomain.websockets.domainName;

      const result = await plugin.getWssApiId();
      expect(result).to.equal("test_wss_api_id");
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
    });
  });

  describe("Delete the new REST domain", () => {
    it("Find available domains", async () => {
      AWS.mock("APIGateway", "getDomainName", (params, callback) => {
        callback(null, { distributionDomainName: "test_domain" });
      });

      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
        websockets: {}
      });
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;

      const result = await plugin.getDomainInfo();

      expect(result.domainName).to.equal("test_domain");
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
        websockets: {}
      });
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;
      const spy = chai.spy.on(plugin.route53, "changeResourceRecordSets");

      const domain = new DomainInfo({
        distributionDomainName: "test_distribution_name",
        distributionHostedZoneId: "test_id",
      });

      await plugin.changeResourceRecordSet("DELETE", domain);
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
      AWS.mock("APIGateway", "deleteDomainName", (params, callback) => {
        callback(null, {});
      });

      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
        websockets: {}
      });
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;
      const spy = chai.spy.on(plugin.apigateway, "deleteDomainName");

      await plugin.deleteCustomDomain();
      expect(spy).to.be.called.with({
        domainName: "test_domain",
      });
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
    });
  });

  describe("Delete the new websocket domain", () => {
    it("Find available domains", async () => {
      AWS.mock("ApiGatewayV2", "getDomainName", (params, callback) => {
        callback(null, {  DomainName: "test_domain",
                          DomainNameConfigurations: [ { ApiGatewayDomainName: "apigw",
                                                        HostedZoneId: "test_hosted_zone_id",
                                                        CertificateArn: "arn",
                                                        CertificateName: "certName",
                                                        EndpointType: "REGIONAL" } ],
                          ApiMappingSelectionExpression: "$request.basepath" });
        });

      const plugin = constructPlugin({
        websockets: {
          domainName: "test_domain",
        }
      });
      plugin.apigatewayv2 = new aws.ApiGatewayV2();
      plugin.givenDomainNameWs = plugin.serverless.service.custom.customDomain.websockets.domainName;

      const result = await plugin.getDomainInfoWs();

      expect(result.domainName).to.equal("test_domain");
      expect(result.apiGatewayDomainName).to.equal("apigw");
      expect(result.hostedZoneId).to.equal("test_hosted_zone_id");
    });

    it("Delete A Alias Record", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, { HostedZones: [{ Name: "test_domain", Id: "test_host_id", Config: { PrivateZone: false } }] });
      });

      AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        websockets: {
          domainName: "test_domain",
        }
      });
      plugin.route53 = new aws.Route53();
      plugin.givenDomainNameWs = plugin.serverless.service.custom.customDomain.websockets.domainName;
      const spy = chai.spy.on(plugin.route53, "changeResourceRecordSets");

      const domain = new DomainInfoWs({
        DomainNameConfigurations: [{
          HostedZoneId: "test_id",
          ApiGatewayDomainName: "test_distribution_name",
        }]
      });

      await plugin.changeResourceRecordSetWs("DELETE", domain);
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
        websockets: {
          domainName: "test_domain",
        }
      });
      plugin.apigatewayv2 = new aws.ApiGatewayV2();
      plugin.givenDomainNameWs = plugin.serverless.service.custom.customDomain.websockets.domainName;
      const spy = chai.spy.on(plugin.apigatewayv2, "deleteDomainName");

      await plugin.deleteCustomDomainWs();
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
      AWS.mock("APIGateway", "getDomainName", (params, callback) => {
        callback(null, { domainName: "fake_domain", distributionDomainName: "fake_dist_name" });
      });
      AWS.mock("APIGateway", "getBasePathMappings", (params, callback) => {
        callback(null, { items: [] });
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
      const plugin = constructPlugin({
        domainName: "test_domain",
        websockets: {}
      });
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();
      plugin.cloudformation = new aws.CloudFormation();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;
      const spy = chai.spy.on(plugin, "createBasePathMapping");

      await plugin.setupBasePathMapping();

      expect(spy).to.be.called();
    });

    it("deleteDomain", async () => {
      AWS.mock("APIGateway", "getDomainName", (params, callback) => {
        callback(null, { distributionDomainName: "test_distribution", regionalHostedZoneId: "test_id" });
      });
      AWS.mock("APIGateway", "deleteDomainName", (params, callback) => {
        callback(null, {});
      });
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, { HostedZones: [{ Name: "test_domain", Id: "test_id", Config: { PrivateZone: false } }] });
      });
      AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        domainName: "test_domain",
        websockets: {}
      });
      plugin.apigateway = new aws.APIGateway();
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;
      await plugin.deleteDomain();
      expect(consoleOutput[0]).to.equal(`Custom domain ${plugin.givenDomainName} was deleted.`);
    });

    it("createDomain if one does not exist before", async () => {
      AWS.mock("ACM", "listCertificates", certTestData);
      AWS.mock("APIGateway", "getDomainName", (params, callback) => {
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
        websockets: {}
      });
      plugin.apigateway = new aws.APIGateway();
      plugin.route53 = new aws.Route53();
      plugin.acm = new aws.ACM();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;
      await plugin.createDomain();
      expect(consoleOutput[0]).to.equal(`Custom domain ${plugin.givenDomainName} was created.
            New domains may take up to 40 minutes to be initialized.`);
    });

    it("Does not create domain if one existed before", async () => {
      AWS.mock("ACM", "listCertificates", certTestData);
      AWS.mock("APIGateway", "getDomainName", (params, callback) => {
        callback(null, { distributionDomainName: "foo", regionalHostedZoneId: "test_id" });
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
        websockets: {},
      });
      plugin.apigateway = new aws.APIGateway();
      plugin.route53 = new aws.Route53();
      plugin.acm = new aws.ACM();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;
      await plugin.createDomain();
      expect(consoleOutput[0]).to.equal(`Custom domain ${plugin.givenDomainName} already exists.`);
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
        websockets: {},
      });
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = "ccc.bbb.aaa.com";
      plugin.givenDomainNameWs = "bbb.aaa.com";

      const result = await plugin.getRoute53HostedZoneId();
      const resultWs = await plugin.getRoute53HostedZoneIdWs();
      expect(result).to.equal("test_id_2");
      expect(resultWs).to.equal("test_id_1");
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
        websockets: {},
      });
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = "test.ccc.bbb.aaa.com";
      plugin.givenDomainNameWs = "test.bbb.aaa.com";

      const result = await plugin.getRoute53HostedZoneId();
      const resultWs = await plugin.getRoute53HostedZoneIdWs();
      expect(result).to.equal("test_id_1");
      expect(resultWs).to.equal("test_id_2");
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
        websockets: {},
      });
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = "test.ccc.bbb.aaa.com";
      plugin.givenDomainNameWs = "test.bbb.aaa.com";

      const result = await plugin.getRoute53HostedZoneId();
      const resultWs = await plugin.getRoute53HostedZoneIdWs();
      expect(result).to.equal("test_id_2");
      expect(resultWs).to.equal("test_id_0");
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
        websockets: {},
      });
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = "bar.foo.bbb.fr";
      plugin.givenDomainNameWs = "bar.foo.aaa.com";

      const result = await plugin.getRoute53HostedZoneId();
      const resultWs = await plugin.getRoute53HostedZoneIdWs();
      expect(result).to.equal("test_id_1");
      expect(resultWs).to.equal("test_id_0");
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
        websockets: {},
      });
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = "test.a.aaa.com";
      plugin.givenDomainNameWs = "test.aaa.com";

      const result = await plugin.getRoute53HostedZoneId();
      const resultWs = await plugin.getRoute53HostedZoneIdWs();
      expect(result).to.equal("test_id_0");
      expect(resultWs).to.equal("test_id_1");
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
        websockets: {},
      });
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = "bar.foo.bbb.fr";
      plugin.givenDomainNameWs = "bar.aaa.com";

      const result = await plugin.getRoute53HostedZoneId();
      const resultWs = await plugin.getRoute53HostedZoneIdWs();
      expect(result).to.equal("test_id_3");
      expect(resultWs).to.equal("test_id_0");
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
        websockets: {},
      });
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = "bar.foo.bbb.fr";
      plugin.givenDomainNameWs = "bar.bbb.fr";

      const result = await plugin.getRoute53HostedZoneId();
      const resultWs = await plugin.getRoute53HostedZoneIdWs();
      expect(result).to.equal("test_id_3");
      expect(resultWs).to.equal("test_id_1");
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
        websockets: {},
      });
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = "bar.foo.bbb.fr";
      plugin.givenDomainNameWs = "bar.aaa.com";

      const result = await plugin.getRoute53HostedZoneId();
      const resultWs = await plugin.getRoute53HostedZoneIdWs();
      expect(result).to.equal("test_id_3");
      expect(resultWs).to.equal("test_id_0");
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
        websockets: {},
      });
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = "aaa.com";
      plugin.givenDomainNameWs = "bar.aaa.com";
      plugin.hostedZonePrivate = true;
      plugin.hostedZonePrivateWs = false;

      const result = await plugin.getRoute53HostedZoneId();
      const resultWs = await plugin.getRoute53HostedZoneIdWs();
      expect(result).to.equal("test_id_0");
      expect(resultWs).to.equal("test_id_1");
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
        websockets: {},
      });
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = "aaa.com";
      plugin.givenDomainNameWs = "bar.bbb.com";

      const result = await plugin.getRoute53HostedZoneId();
      const resultWs = await plugin.getRoute53HostedZoneIdWs();
      expect(result).to.equal("test_id_0");
      expect(resultWs).to.equal("test_id_1");
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
        websockets: {},
      };
      const plugin = constructPlugin(options);
      plugin.acm = new aws.ACM();

      return plugin.getCertArn().then(() => {
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
        websockets: {}
      });
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;

      return plugin.getRoute53HostedZoneId().then(() => {
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
      const plugin = constructPlugin({
        domainName: "test_domain",
        websockets: {}
      });
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;

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
        websockets: {}
      });
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;

      // set sls debug to true
      process.env.SLS_DEBUG = "True";
      plugin.logIfDebug("test message");
      expect(consoleOutput).to.contain("test message");
    });

    it("Should not log if SLS_DEBUG is not set", async () => {
      const plugin = constructPlugin({
        domainName: "test_domain",
        websockets: {},
      });
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;

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
      AWS.mock("APIGateway", "getDomainName", (params, callback) => {
        callback(null, { domainName: params, distributionDomainName: "test_distributed_domain_name" });
      });
      AWS.mock("ApiGatewayV2", "getDomainName", (params, callback) => {
        callback(null, { DomainName: params, DomainNameConfigurations: [ {ApiGatewayDomainName: "test_api_gateway_domain_name"} ] });
      });
      const plugin = constructPlugin({
        domainName: "test_domain",
        websockets: {
          domainName: "test_wss_domain",
        }
      });
      plugin.apigateway = new aws.APIGateway();
      plugin.apigatewayv2 = new aws.ApiGatewayV2();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;
      plugin.givenDomainNameWs = plugin.serverless.service.custom.customDomain.websockets.domainName;

      await plugin.domainSummary();
      expect(consoleOutput[0]).to.contain("Serverless Domain Manager Summary");
      expect(consoleOutput[1]).to.contain("Domain Name");
      expect(consoleOutput[2]).to.contain("test_domain");
      expect(consoleOutput[3]).to.contain("Distribution Domain Name");
      expect(consoleOutput[4]).to.contain("test_distributed_domain_name");
      expect(consoleOutput[5]).to.contain("Websockets Domain Name");
      expect(consoleOutput[6]).to.contain("test_wss_domain");
      expect(consoleOutput[7]).to.contain("API Gateway Domain Name");
      expect(consoleOutput[8]).to.contain("test_api_gateway_domain_name");
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
    });
  });

  describe("Enable/disable functionality", () => {
    it("Should enable the plugin by default", () => {
      const plugin = constructPlugin({
        websockets: {},
      });

      plugin.initializeVariables();

      const returnedCreds = plugin.apigateway.config.credentials;
      const returnedCredsV2 = plugin.apigatewayv2.config.credentials;
      expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
      expect(returnedCredsV2.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCredsV2.sessionToken).to.equal(testCreds.sessionToken);
      expect(plugin.enabled).to.equal(true);
      expect(plugin.enabledWs).to.equal(true);
    });

    it("Should enable the plugin when passing a true parameter with type boolean", () => {
      const plugin = constructPlugin({
        enabled: true,
        websockets: {
          enabled: true,
        }
      });

      plugin.initializeVariables();

      const returnedCreds = plugin.apigateway.config.credentials;
      const returnedCredsV2 = plugin.apigatewayv2.config.credentials;
      expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
      expect(returnedCredsV2.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCredsV2.sessionToken).to.equal(testCreds.sessionToken);
      expect(plugin.enabled).to.equal(true);
      expect(plugin.enabledWs).to.equal(true);
    });

    it("Should enable the plugin when passing a true parameter with type string", () => {
      const plugin = constructPlugin({
        enabled: "true",
        websockets: {
          enabled: "true",
        }
      });

      plugin.initializeVariables();

      const returnedCreds = plugin.apigateway.config.credentials;
      const returnedCredsV2 = plugin.apigatewayv2.config.credentials;
      expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
      expect(returnedCredsV2.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCredsV2.sessionToken).to.equal(testCreds.sessionToken);
      expect(plugin.enabled).to.equal(true);
      expect(plugin.enabledWs).to.equal(true);
    });

    it("Should disable the plugin when passing a false parameter with type boolean", () => {
      const plugin = constructPlugin({
        enabled: false,
        websockets: {
          enabled: false,
        }
      });

      plugin.initializeVariables();

      expect(plugin.enabled).to.equal(false);
      expect(plugin.enabledWs).to.equal(false);
    });

    it("Should disable the plugin when passing a false parameter with type string", () => {
      const plugin = constructPlugin({
        enabled: "false",
        websockets: {
          enabled: "false",
        }
      });

      plugin.initializeVariables();

      expect(plugin.enabled).to.equal(false);
      expect(plugin.enabledWs).to.equal(false);
    });

    it("createDomains should do nothing when domain manager is disabled", async () => {
      const plugin = constructPlugin({
        enabled: false,
        websockets: {
          enabled: false,
        }
      });

      const result = await plugin.hookWrapper(plugin.createDomains);

      expect(plugin.enabled).to.equal(false);
      expect(plugin.enabledWs).to.equal(false);
      expect(result).to.equal(undefined);
    });

    it("deleteDomains should do nothing when domain manager is disabled", async () => {
      const plugin = constructPlugin({
        enabled: false,
        websockets: {
          enabled: false,
        }
      });

      const result = await plugin.hookWrapper(plugin.deleteDomains);

      expect(plugin.enabled).to.equal(false);
      expect(plugin.enabledWs).to.equal(false);
      expect(result).to.equal(undefined);
    });

    it("setupMappings should do nothing when domain manager is disabled", async () => {
      const plugin = constructPlugin({
        enabled: false,
        websockets: {
          enabled: false,
        }
      });

      const result = await plugin.hookWrapper(plugin.setupMappings);

      expect(plugin.enabled).to.equal(false);
      expect(plugin.enabledWs).to.equal(false);
      expect(result).to.equal(undefined);
    });

    it("removeMappings should do nothing when domain manager is disabled", async () => {
      const plugin = constructPlugin({
        enabled: false,
        websockets: {
          enabled: false,
        }
      });

      const result = await plugin.hookWrapper(plugin.removeMappings);

      expect(plugin.enabled).to.equal(false);
      expect(plugin.enabledWs).to.equal(false);
      expect(result).to.equal(undefined);
    });

    it("domainSummary should do nothing when domain manager is disabled", async () => {
      const plugin = constructPlugin({
        enabled: false,
        websockets: {
          enabled: false,
        }
      });

      const result = await plugin.hookWrapper(plugin.domainSummary);

      expect(plugin.enabled).to.equal(false);
      expect(plugin.enabledWs).to.equal(false);
      expect(result).to.equal(undefined);
    });

    it("Should throw an Error when passing a parameter that is not boolean", () => {
      const stringWithValueYes = "yes";
      const plugin = constructPlugin({
        enabled: 0,
        websockets: {}
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

    it("Should throw an Error when passing a parameter that cannot be converted to boolean", () => {
      const plugin = constructPlugin({
        enabled: "yes",
        websockets: {}
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

    it("Should throw an Error when passing a websocket parameter that is not boolean", () => {
      const stringWithValueYes = "yes";
      const plugin = constructPlugin({
        websockets: { enabled: 0 }
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

    it("Should throw an Error when passing a websocket parameter that cannot be converted to boolean", () => {
      const plugin = constructPlugin({
        websockets: { enabled: "yes" }
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
      const plugin = constructPlugin({
        websockets: {},
      });
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
      const plugin = constructPlugin({
        websockets: {},
      });
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
});

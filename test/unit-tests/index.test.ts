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

    plugin.initializeDomainManager();

    const returnedCreds = plugin.apigateway.config.credentials;
    const returnedCredsV2 = plugin.apigatewayv2.config.credentials;
    expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
    expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
    expect(returnedCredsV2.accessKeyId).to.equal(testCreds.accessKeyId);
    expect(returnedCredsV2.sessionToken).to.equal(testCreds.sessionToken);
  });

  it("Checks for correct default value of basePath", () => {
    const plugin = constructPlugin({
      domainName: "test_domain",
    });

    plugin.initializeDomainManager();

    const domain = plugin.domains.values().next().value;
    expect(domain.basePath).to.equal("");

  });

  it("Checks for correct default value of securityPolicy", () => {
    const plugin = constructPlugin({
      domainName: "test_domain",
    });

    plugin.initializeDomainManager();

    const domain = plugin.domains.values().next().value;
    expect(domain.securityPolicy).to.equal("TLS_1_2");

  });

  it("Checks for correct default value of endpointType", () => {
    const plugin = constructPlugin({
      domainName: "test_domain",
    });

    plugin.initializeDomainManager();

    const domain = plugin.domains.values().next().value;
    expect(domain.endpointType).to.equal("EDGE");

  });

  it("Checks for correct default value of enabled", () => {
    const plugin = constructPlugin({
      domainName: "test_domain",
    });

    plugin.initializeDomainManager();

    const domain = plugin.domains.values().next().value;
    expect(domain.enabled).to.equal(true);

  });

  it("Checks for correct default value of websocket", () => {
    const plugin = constructPlugin({
      domainName: "test_domain",
    });

    plugin.initializeDomainManager();

    const domain = plugin.domains.values().next().value;
    expect(domain.websocket).to.equal(false);

  });

  it("Checks for correct default value of createRoute53Record", () => {
    const plugin = constructPlugin({
      domainName: "test_domain",
    });

    plugin.initializeDomainManager();

    const domain = plugin.domains.values().next().value;
    expect(domain.createRoute53Record).to.equal(true);

  });

  describe("Set Domain Name and Base Path", () => {
    it("Creates api mapping", async () => {
      AWS.mock("ApiGatewayV2", "createApiMapping", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
        stage: "test",
      });

      plugin.initializeDomainManager();

      const iterator = plugin.domains.values();

      const spy = chai.spy.on(plugin.apigatewayv2, "createApiMapping");

      await plugin.createApiMapping("test_api_id", iterator.next().value);
      expect(spy).to.have.been.called.with({
        ApiId: "test_api_id",
        ApiMappingKey: "test_basepath",
        DomainName: "test_domain",
        Stage: "test",
      });
    });

    it("Updates api mapping", async () => {
      AWS.mock("ApiGatewayV2", "updateApiMapping", (params, callback) => {
        callback(null, params);
      });
      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
        stage: "test_stage",
      });

      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();

      const spy = chai.spy.on(plugin.apigatewayv2, "updateApiMapping");

      await plugin.updateApiMapping("mapping_id", iterator.next().value, "test_api_id");
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

      plugin.initializeDomainManager();
      let iterator = plugin.domains.values();
      let domain = iterator.next().value;

      domain.SetApiGatewayRespV1({
        distributionDomainName: "fake_dist_name",
        distributionHostedZoneId: "fake_zone_id"});

      plugin.domains.set(domain.domainName, domain);

      iterator = plugin.domains.values();
      domain = iterator.next().value;

      plugin.addOutputs(domain);
      const cfTemplat = plugin.serverless.service.provider.compiledCloudFormationTemplate.Outputs;
      expect(cfTemplat).to.not.equal(undefined);
    });

    it("Add Domain Name and HostedZoneId to stack output and check if outputs are defined (Websocket)", () => {
      const plugin = constructPlugin({
        domainName: "fake_domain",
        websocket: true,
      });

      plugin.initializeDomainManager();
      let iterator = plugin.domains.values();
      let domain = iterator.next().value;

      domain.SetApiGatewayRespV2({
        DomainNameConfigurations: [{
          ApiGatewayDomainName: "fake_dist_name",
          HostedZoneId: "fake_zone_id",
        }]});

      plugin.domains.set(domain.domainName, domain);

      iterator = plugin.domains.values();
      domain = iterator.next().value;

      plugin.addOutputs(domain);
      const cfTemplat = plugin.serverless.service.provider.compiledCloudFormationTemplate.Outputs;
      expect(cfTemplat).to.not.equal(undefined);
    });

    it("Add Domain Name and HostedZoneId to stack output and check the output contents (REST)", () => {
      const plugin = constructPlugin({
        domainName: "fake_domain",
      });

      plugin.initializeDomainManager();
      let iterator = plugin.domains.values();
      let domain = iterator.next().value;

      domain.SetApiGatewayRespV1({
        distributionDomainName: "fake_dist_name",
        distributionHostedZoneId: "fake_zone_id"});
      plugin.domains.set(domain.domainName, domain);

      iterator = plugin.domains.values();
      domain = iterator.next().value;

      plugin.addOutputs(domain);
      const cfTemplat = plugin.serverless.service.provider.compiledCloudFormationTemplate.Outputs;
      expect(cfTemplat.aliasTarget.Value).to.equal("fake_dist_name");
      expect(cfTemplat.aliasHostedZoneId.Value).to.equal("fake_zone_id");
    });

    it("Add Domain Name and HostedZoneId to stack output and check the output contents (Websocket)", () => {
      const plugin = constructPlugin({
        domainName: "fake_domain",
        websocket: true,
      });

      plugin.initializeDomainManager();
      let iterator = plugin.domains.values();
      let domain = iterator.next().value;

      domain.SetApiGatewayRespV2({
        DomainNameConfigurations: [{
          ApiGatewayDomainName: "fake_dist_name",
          HostedZoneId: "fake_zone_id",
        }]});
      plugin.domains.set(domain.domainName, domain);

      iterator = plugin.domains.values();
      domain = iterator.next().value;

      plugin.addOutputs(domain);
      const cfTemplat = plugin.serverless.service.provider.compiledCloudFormationTemplate.Outputs;
      expect(cfTemplat.aliasTarget.Value).to.equal("fake_dist_name");
      expect(cfTemplat.aliasHostedZoneId.Value).to.equal("fake_zone_id");
    });

    it("Empty string is added if no value is given for basepath (null)", async () => {
      AWS.mock("ApiGatewayV2", "createApiMapping", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        basePath: null,
        domainName: "test_domain",
      });
      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();

      const spy = chai.spy.on(plugin.apigatewayv2, "createApiMapping");

      await plugin.createApiMapping("test_api_id", iterator.next().value);
      expect(spy).to.have.been.called.with({
        ApiId: "test_api_id",
        ApiMappingKey: "",
        DomainName: "test_domain",
        Stage: "test",
      });
    });

    it("Empty string is added if basepath attribute is missing (undefined)", async () => {
      AWS.mock("ApiGatewayV2", "createApiMapping", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        domainName: "test_domain",
      });
      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();

      const spy = chai.spy.on(plugin.apigatewayv2, "createApiMapping");

      await plugin.createApiMapping("test_api_id", iterator.next().value);
      expect(spy).to.have.been.called.with({
        ApiId: "test_api_id",
        ApiMappingKey: "",
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
      });
      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();

      const spy = chai.spy.on(plugin.apigatewayv2, "createApiMapping");

      await plugin.createApiMapping("test_api_id", iterator.next().value);
      expect(spy).to.have.been.called.with({
        ApiId: "test_api_id",
        ApiMappingKey: "",
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
      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();
      const domain = iterator.next().value;

      await plugin.getCertArn(domain);

      expect(domain.certificateArn).to.equal("test_given_arn");
    });

    it("Get a given certificate name for a domain", async () => {
      AWS.mock("ACM", "listCertificates", certTestData);

      const plugin = constructPlugin({
        certificateName: "cert_name",
        domainName: "test_domain",
      });
      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();
      const domain = iterator.next().value;

      await plugin.getCertArn(domain);

      expect(domain.certificateArn).to.equal("test_given_cert_name");
    });

    it("Create a new A Alias Record", async () => {
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
      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();
      const domain = iterator.next().value;

      const spy = chai.spy.on(plugin.route53, "changeResourceRecordSets");

      domain.SetApiGatewayRespV1({
        distributionDomainName: "test_distribution_name",
        distributionHostedZoneId: "test_id",
      });

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

    it("Create a new A Alias Record", async () => {
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
      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();
      const domain = iterator.next().value;

      const spy = chai.spy.on(plugin.route53, "changeResourceRecordSets");

      domain.SetApiGatewayRespV2({
        DomainNameConfigurations: [{
          ApiGatewayDomainName: "test_distribution_name",
          HostedZoneId: "test_id",
        }],
      });

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

    it("Do not create a Route53 record for a domain", async () => {
      const plugin = constructPlugin({
        createRoute53Record: false,
        domainName: "test_domain",
      });

      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();

      const result = await plugin.changeResourceRecordSet("UPSERT", iterator.next().value);
      expect(result).to.equal(undefined);
    });

    it("Do not create a Route53 record for a domain", async () => {
      const plugin = constructPlugin({
        createRoute53Record: false,
        domainName: "test_domain",
        websocket: true,
      });

      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();

      const result = await plugin.changeResourceRecordSet("UPSERT", iterator.next().value);
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

      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();

      const result = await plugin.getMapping("test_api_id", iterator.next().value);
      expect(result).to.equal(undefined);
    });

    it("Returns current apiMappingKey and apiMappingId", async () => {
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

      plugin.initializeDomainManager();

      const iterator = plugin.domains.values();

      const result = await plugin.getMapping("test_api_id", iterator.next().value);
      expect(result.apiMappingId).to.equal("test_api_mapping_id");
      expect(result.apiMappingKey).to.equal("api");
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

      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();

      const result = await plugin.getApiId(iterator.next().value);
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

      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();

      plugin.serverless.service.provider.apiGateway.restApiId = "custom_test_api_id";

      const result = await plugin.getApiId(iterator.next().value);
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

      plugin.initializeDomainManager();
      let iterator = plugin.domains.values();

      await plugin.getAliasInfo(iterator.next().value);

      iterator = plugin.domains.values();

      expect(iterator.next().value.aliasTarget).to.equal("test_domain");
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

      plugin.initializeDomainManager();

      const iterator = plugin.domains.values();
      const domain = iterator.next().value;

      domain.SetApiGatewayRespV1({
        distributionDomainName: "test_distribution_name",
        distributionHostedZoneId: "test_id",
      });

      const spy = chai.spy.on(plugin.route53, "changeResourceRecordSets");

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
      AWS.mock("ApiGatewayV2", "deleteDomainName", (params, callback) => {
        callback(null, {});
      });

      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",

      });

      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();

      const spy = chai.spy.on(plugin.apigatewayv2, "deleteDomainName");

      await plugin.deleteCustomDomain(iterator.next().value);
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
    it("propogateMappings", async () => {
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

      plugin.initializeDomainManager();

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
      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();
      const domain = iterator.next().value;

      await plugin.deleteDomains();

      expect(consoleOutput[0]).to.equal(`Domain ${domain.domainName} was deleted.`);
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

      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();
      const domain = iterator.next().value;

      await plugin.createDomains();
      const output0 = `Domain ${domain.domainName} not found. Creating...`;
      const output1 = `${domain.domainName} was created. Could take up to 40 minutes to be initialized.`;
      expect(consoleOutput[0]).to.equal(output0);
      expect(consoleOutput[1]).to.equal(output1);
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
      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();
      const domain = iterator.next().value;

      await plugin.createDomains();
      expect(consoleOutput[0]).to.equal(`Domain ${domain.domainName} already exists. Skipping...`);
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
      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();

      const result = await plugin.getRoute53HostedZoneId(iterator.next().value);
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
      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();
      const domain = iterator.next().value;

      const result = await plugin.getRoute53HostedZoneId(domain);
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
      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();
      const domain = iterator.next().value;

      const result = await plugin.getRoute53HostedZoneId(domain);
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
      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();
      const domain = iterator.next().value;

      const result = await plugin.getRoute53HostedZoneId(domain);
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
      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();
      const domain = iterator.next().value;

      const result = await plugin.getRoute53HostedZoneId(domain);
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
      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();
      const domain = iterator.next().value;

      const result = await plugin.getRoute53HostedZoneId(domain);
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
      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();
      const domain = iterator.next().value;

      const result = await plugin.getRoute53HostedZoneId(domain);
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
      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();
      const domain = iterator.next().value;

      const result = await plugin.getRoute53HostedZoneId(domain);
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
      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();
      const domain = iterator.next().value;

      const result = await plugin.getRoute53HostedZoneId(domain);
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
      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();
      const domain = iterator.next().value;

      const result = await plugin.getRoute53HostedZoneId(domain);
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
      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();
      const domain = iterator.next().value;

      return plugin.getCertArn(domain).then(() => {
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
      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();
      const domain = iterator.next().value;

      return plugin.getRoute53HostedZoneId(domain).then(() => {
        throw new Error("Test has failed, getHostedZone did not catch errors.");
      }).catch((err) => {
        const expectedErrorMessage = "Error: Could not find hosted zone \"test_domain\"";
        expect(err.message).to.equal(expectedErrorMessage);
      });
    });

    it("Fail domain initialization due to missing domainName", async () => {
      AWS.mock("APIGateway", "createDomainName", (params, callback) => {
        callback(null, { distributionDomainName: "foo" });
      });

      const plugin = constructPlugin({
        domainName: "test_domain",
      });

      try {
        const domain = new DomainInfo({domainName: undefined}, plugin.serverless, plugin.options);
      } catch (err) {
        expect(err.message).to.equal("domainName is required. Pass it on your serverless.yaml file.");
      }
    });

    it("Domain summary failed", async () => {
      AWS.mock("ApiGatewayV2", "getDomainName", (params, callback) => {
        callback(null, null);
      });
      const plugin = constructPlugin({
        domainName: "test_domain",
      });
      plugin.initializeDomainManager();

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
      plugin.initializeDomainManager();

      // set sls debug to true
      process.env.SLS_DEBUG = "True";
      plugin.logIfDebug("test message");
      expect(consoleOutput).to.contain("test message");
    });

    it("Should not log if SLS_DEBUG is not set", async () => {
      const plugin = constructPlugin({
        domainName: "test_domain",
      });

      plugin.initializeDomainManager();

      plugin.logIfDebug("test message");
      expect(consoleOutput).to.not.contain("test message");
    });

    it("Unsupported endpoint types throw exception", () => {
      const plugin = constructPlugin({
        domainName: "test_domain",
        endpointType: "notSupported",
      });
      let errored = false;
      try {
        plugin.initializeDomainManager();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal("notSupported is not supported endpointType, use edge or regional.");
      }
      expect(errored).to.equal(true);
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

      plugin.initializeDomainManager();

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

      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();
      const domain = iterator.next().value;

      const returnedCreds = plugin.apigateway.config.credentials;
      const returnedCredsV2 = plugin.apigatewayv2.config.credentials;
      expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
      expect(returnedCredsV2.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCredsV2.sessionToken).to.equal(testCreds.sessionToken);
      expect(domain.enabled).to.equal(true);
    });

    it("Should be disabled by default", () => {
      const plugin = constructPlugin({
        domainName: "test_domain",
      });

      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();
      const domain = iterator.next().value;

      const returnedCreds = plugin.apigateway.config.credentials;
      const returnedCredsV2 = plugin.apigatewayv2.config.credentials;
      expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
      expect(returnedCredsV2.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCredsV2.sessionToken).to.equal(testCreds.sessionToken);
      expect(domain.websocket).to.equal(false);
    });

    it("Should enable the domain when passing a true parameter with type boolean", () => {
      const plugin = constructPlugin({
        domainName: "test_domain",
        enabled: true,
        websocket: true,
      });

      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();
      const domain = iterator.next().value;

      const returnedCreds = plugin.apigateway.config.credentials;
      const returnedCredsV2 = plugin.apigatewayv2.config.credentials;
      expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
      expect(returnedCredsV2.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCredsV2.sessionToken).to.equal(testCreds.sessionToken);
      expect(domain.enabled).to.equal(true);
      expect(domain.websocket).to.equal(true);
    });

    it("Should enable the plugin when passing a true parameter with type string", () => {
      const plugin = constructPlugin({
        domainName: "test_domain",
        enabled: "true",
        websocket: "true",
      });

      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();
      const domain = iterator.next().value;

      const returnedCreds = plugin.apigateway.config.credentials;
      const returnedCredsV2 = plugin.apigatewayv2.config.credentials;
      expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
      expect(returnedCredsV2.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCredsV2.sessionToken).to.equal(testCreds.sessionToken);
      expect(domain.enabled).to.equal(true);
      expect(domain.websocket).to.equal(true);
    });

    it("Should disable the plugin when passing a false parameter with type boolean", async () => {
      const plugin = constructPlugin({
        domainName: "test_domain",
        enabled: false,
      });

      await plugin.hookWrapper(plugin.propogateMappings);

      const output0 = "Domain generation for test_domain has been disabled. Skipping...";
      const output1 = "No domains are enabled. To use Domain Manager pass \'enabled: true\' in your serverless.yaml";
      expect(consoleOutput[0]).to.equal(output0);
      expect(consoleOutput[1]).to.equal(output1);
    });

    it("Should disable the plugin when passing a false parameter with type string", async () => {
      const plugin = constructPlugin({
        domainName: "test_domain",
        enabled: "false",
        websocket: "false",
      });

      await plugin.hookWrapper(plugin.propogateMappings);

      const output0 = "Domain generation for test_domain has been disabled. Skipping...";
      const output1 = "No domains are enabled. To use Domain Manager pass \'enabled: true\' in your serverless.yaml";
      expect(consoleOutput[0]).to.equal(output0);
      expect(consoleOutput[1]).to.equal(output1);
    });

    it("propogateMappings should do nothing when domain manager is disabled", async () => {
      const plugin = constructPlugin({
        domainName: "test_domain",
        enabled: false,
      });

      const result = await plugin.hookWrapper(plugin.propogateMappings);

      expect(result).to.equal(undefined);
    });

    it("removeMappings should do nothing when domain manager is disabled", async () => {
      const plugin = constructPlugin({
        domainName: "test_domain",
        enabled: false,
        websocket: false,
      });

      const result = await plugin.hookWrapper(plugin.propogateMappings);

      expect(result).to.equal(undefined);
    });

    it("domainSummary should do nothing when domain manager is disabled", async () => {
      const plugin = constructPlugin({
        domainName: "test_domain",
        enabled: false,
        websocket: false,
      });

      const result = await plugin.hookWrapper(plugin.domainSummary);

      expect(result).to.equal(undefined);
    });

    it("Should throw an Error when passing a parameter that is not boolean", () => {
      const plugin = constructPlugin({
        domainName: "test_domain",
        enabled: 0,
        websocket: 0,
      });

      let errored = false;
      try {
        plugin.initializeDomainManager();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal("serverless-domain-manager: Ambiguous enablement boolean: \"0\"");
      }
      expect(errored).to.equal(true);
    });

    it("Should throw an Error when passing a parameter that cannot be converted to boolean", () => {
      const plugin = constructPlugin({
        domainName: "test_domain",
        enabled: "yes",
        websocket: "yes",
      });

      let errored = false;
      try {
        plugin.initializeDomainManager();
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
        plugin.initializeDomainManager();
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
        plugin.initializeDomainManager();

      } catch (err) {
        errored = true;
        expect(err.message).to.equal("serverless-domain-manager: Plugin configuration is missing.");
      }
      expect(errored).to.equal(true);
    });

    it("Should set endpoint type to regional per default", () => {
      const plugin = constructPlugin({
        domainName: "test_domain",
        websocket: true,
      });

      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();
      const domain = iterator.next().value;
      expect(domain.endpointType).to.equal("REGIONAL");
    });

    it("Should set endpoint type to regional even if missing ", () => {
      const plugin = constructPlugin({
        domainName: "test_domain",
        websocket: true,
      });

      plugin.initializeDomainManager();
      const iterator = plugin.domains.values();
      const domain = iterator.next().value;
      expect(domain.endpointType).to.equal("REGIONAL");
    });

    afterEach(() => {
      consoleOutput = [];
    });
  });
});

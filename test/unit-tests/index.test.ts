import Globals from "../../src/globals";
import { chaiSpy, consoleOutput, constructPlugin, expect, getDomainConfig, getV3Utils } from "./base";
import Logging from "../../src/logging";
import DomainConfig = require("../../src/models/domain-config");
import APIGatewayV1Wrapper = require("../../src/aws/api-gateway-v1-wrapper");
import APIGatewayV2Wrapper = require("../../src/aws/api-gateway-v2-wrapper");
import { mockClient } from "aws-sdk-client-mock";
import {
  APIGatewayClient, CreateBasePathMappingCommand, CreateDomainNameCommand, DeleteBasePathMappingCommand,
  DeleteDomainNameCommand,
  GetBasePathMappingsCommand,
  GetDomainNameCommand, UpdateBasePathMappingCommand
} from "@aws-sdk/client-api-gateway";
import { ACMClient, ListCertificatesCommand } from "@aws-sdk/client-acm";
import { ChangeResourceRecordSetsCommand, ListHostedZonesCommand, Route53Client } from "@aws-sdk/client-route-53";
import { CloudFormationClient, DescribeStackResourceCommand, ResourceStatus } from "@aws-sdk/client-cloudformation";

describe("Custom Domain Plugin", () => {
  beforeEach(() => {
    consoleOutput.length = 0;
    Globals.v3Utils = null;
  });

  describe("Initialization", () => {
    it("with v3Utils", () => {
      const testMessage = "test message";
      const v3Utils = getV3Utils();
      const domainConfig = getDomainConfig({});

      constructPlugin(domainConfig, null, v3Utils);
      Logging.logInfo(testMessage);

      expect(consoleOutput[0]).to.equal("V3 [Info] " + testMessage);
    });

    it("init AWS resources", () => {
      const domainConfig = getDomainConfig({});
      const plugin = constructPlugin(domainConfig);

      let errored = false;
      try {
        plugin.initializeVariables();
        plugin.validateDomainConfigs();
        plugin.initAWSResources();
      } catch (err) {
        errored = true;
      }
      expect(errored).to.equal(false);
    });

    it("Unsupported endpoint types throw exception", () => {
      const domainConfig = getDomainConfig({ endpointType: "notSupported" });
      const plugin = constructPlugin(domainConfig);

      let errored = false;
      try {
        plugin.initializeVariables();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal("notSupported is not supported endpointType, use EDGE or REGIONAL.");
      }
      expect(errored).to.equal(true);
    });

    it("Unsupported api type throw exception", () => {
      const domainConfig = getDomainConfig({ apiType: "notSupported" });
      const plugin = constructPlugin(domainConfig);

      let errored = false;
      try {
        plugin.initializeVariables();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal("notSupported is not supported api type, use REST, HTTP or WEBSOCKET.");
      }
      expect(errored).to.equal(true);
    });

    it("Get ApiGateway V1", () => {
      const plugin = constructPlugin({});
      plugin.initAWSResources();

      const dc = new DomainConfig(getDomainConfig({
        apiType: Globals.apiTypes.rest
      }));
      const apiGateway = plugin.getApiGateway(dc);

      expect(apiGateway instanceof APIGatewayV1Wrapper).to.equal(true);
    });

    it("Get ApiGateway V2", () => {
      const plugin = constructPlugin({});
      plugin.initAWSResources();

      // for the http API type should be APIGatewayV2Wrapper
      let dc = new DomainConfig(getDomainConfig({
        apiType: Globals.apiTypes.http
      }));
      expect(plugin.getApiGateway(dc) instanceof APIGatewayV2Wrapper).to.equal(true);

      // for the websocket API type should be APIGatewayV2Wrapper
      dc = new DomainConfig(getDomainConfig({
        apiType: Globals.apiTypes.websocket
      }));
      expect(plugin.getApiGateway(dc) instanceof APIGatewayV2Wrapper).to.equal(true);

      // for the multi-level base path and rest API type should be APIGatewayV2Wrapper
      dc = new DomainConfig(getDomainConfig({
        basePath: "api/test",
        apiType: Globals.apiTypes.rest
      }));
      expect(plugin.getApiGateway(dc) instanceof APIGatewayV2Wrapper).to.equal(true);
    });
  });

  describe("Validate plugin configuration", () => {
    it("Should thrown an Error when plugin customDomain configuration object is missing", () => {
      const plugin = constructPlugin(getDomainConfig(getDomainConfig({})));
      delete plugin.serverless.service.custom.customDomain;

      let errored = false;
      try {
        plugin.validateConfigExists();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal(`${Globals.pluginName}: Plugin configuration is missing.`);
      }
      expect(errored).to.equal(true);
    });

    it("Should thrown an Error when Serverless custom configuration object is missing for multiple domains", () => {
      const plugin = constructPlugin(getDomainConfig({}), null, null);
      delete plugin.serverless.service.custom.customDomain;
      delete plugin.serverless.service.custom.customDomains;

      let errored = false;
      try {
        plugin.validateConfigExists();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal(`${Globals.pluginName}: Plugin configuration is missing.`);
      }
      expect(errored).to.equal(true);
    });

    it("Should thrown an Error when Serverless custom configuration object is missing", () => {
      const plugin = constructPlugin(getDomainConfig({}));
      delete plugin.serverless.service.custom;

      let errored = false;
      try {
        plugin.validateConfigExists();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal(`${Globals.pluginName}: Plugin configuration is missing.`);
      }
      expect(errored).to.equal(true);
    });

    it("Unsupported HTTP EDGE endpoint configuration", () => {
      const domainOptions = getDomainConfig({ apiType: "http" });
      const plugin = constructPlugin(domainOptions);

      let errored = false;
      try {
        plugin.initializeVariables();
        plugin.validateDomainConfigs();
      } catch (err) {
        errored = true;
        expect(err.message).to.contains("'EDGE' endpointType is not compatible with HTTP APIs");
      }
      expect(errored).to.equal(true);
    });

    it("Unsupported WS EDGE endpoint configuration", () => {
      const domainOptions = getDomainConfig({ apiType: "websocket" });
      const plugin = constructPlugin(domainOptions);

      let errored = false;
      try {
        plugin.initializeVariables();
        plugin.validateDomainConfigs();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal("'EDGE' endpointType is not compatible with WebSocket APIs");
      }
      expect(errored).to.equal(true);
    });

    it("Lowercase edge endpoint type without errors", () => {
      const domainOptions = getDomainConfig({ endpointType: "edge" });
      const plugin = constructPlugin(domainOptions);

      let errored = false;
      try {
        plugin.initializeVariables();
        plugin.validateDomainConfigs();
      } catch (err) {
        errored = true;
      }
      expect(errored).to.equal(false);
    });

    it("Nested api type configuration", () => {
      const domainOptions = getDomainConfig({});
      const plugin = constructPlugin({ rest: domainOptions });

      plugin.initializeVariables();
      plugin.validateDomainConfigs();

      expect(plugin.domains.length).to.equal(1);
    });

    it("Should enable the plugin by default", () => {
      const plugin = constructPlugin(getDomainConfig({}));

      plugin.initializeVariables();
      plugin.validateDomainConfigs();

      expect(plugin.domains).length.to.be.greaterThan(0);
      for (const domain of plugin.domains) {
        expect(domain.enabled).to.equal(true);
      }
    });

    it("Should enable the plugin when passing a true parameter with type boolean", () => {
      const plugin = constructPlugin(getDomainConfig({ enabled: true }));

      plugin.initializeVariables();
      plugin.validateDomainConfigs();

      expect(plugin.domains).length.to.be.greaterThan(0);
      for (const domain of plugin.domains) {
        expect(domain.enabled).to.equal(true);
      }
    });

    it("Should enable the plugin when passing a true parameter with type string", () => {
      const plugin = constructPlugin(getDomainConfig({ enabled: "true" }));

      plugin.initializeVariables();
      plugin.validateDomainConfigs();

      expect(plugin.domains).length.to.be.greaterThan(0);
      for (const domain of plugin.domains) {
        expect(domain.enabled).to.equal(true);
      }
    });

    it("Should disable the plugin when passing a false parameter with type boolean", () => {
      const plugin = constructPlugin(getDomainConfig({ enabled: false }));

      plugin.initializeVariables();
      plugin.validateDomainConfigs();

      expect(plugin.domains.length).to.equal(0);
    });

    it("Should disable the plugin when passing a false parameter with type string", () => {
      const plugin = constructPlugin(getDomainConfig({ enabled: "false" }));

      plugin.initializeVariables();
      plugin.validateDomainConfigs();

      expect(plugin.domains.length).to.equal(0);
    });

    it("Should throw an Error when passing a parameter that is not boolean", async () => {
      const plugin = constructPlugin(getDomainConfig({ enabled: "11" }));

      let errored = false;
      try {
        await plugin.hookWrapper(null);
      } catch (err) {
        errored = true;
        expect(err.message).to.equal(`${Globals.pluginName}: Ambiguous boolean config: "11"`);
      }
      expect(errored).to.equal(true);
    });

    it("Should throw an Error when passing a parameter that cannot be converted to boolean", async () => {
      const plugin = constructPlugin(getDomainConfig({ enabled: "yes" }));

      let errored = false;
      try {
        await plugin.hookWrapper(null);
      } catch (err) {
        errored = true;
        expect(err.message).to.equal(`${Globals.pluginName}: Ambiguous boolean config: "yes"`);
      }
      expect(errored).to.equal(true);
    });

    it("Should throw an Error when mutual TLS is enabled for edge APIs", async () => {
      const plugin = constructPlugin(getDomainConfig({
        endpointType: "edge",
        tlsTruststoreUri: "s3://bucket-name/key-name"
      }));

      let errored = false;
      try {
        await plugin.hookWrapper(null);
      } catch (err) {
        errored = true;
        expect(err.message).to.equal("EDGE APIs do not support mutual TLS, remove tlsTruststoreUri or change to a regional API.");
      }
      expect(errored).to.equal(true);
    });

    it("Should throw an Error when mutual TLS uri is not an S3 uri", async () => {
      const plugin = constructPlugin(getDomainConfig({
        endpointType: "regional",
        tlsTruststoreUri: "https://example.com"
      }));

      let errored = false;
      try {
        await plugin.hookWrapper(null);
      } catch (err) {
        errored = true;
        expect(err.message).to.equal("https://example.com is not a valid s3 uri, try something like s3://bucket-name/key-name.");
      }
      expect(errored).to.equal(true);
    });
  });

  describe("Hooks checks", () => {
    it("after:deploy:deploy with the createBasePathMapping", async () => {
      const APIGatewayMock = mockClient(APIGatewayClient);
      APIGatewayMock.on(GetDomainNameCommand).resolves({
        domainName: "dummy_domain",
        regionalHostedZoneId: "test_id"
      });
      APIGatewayMock.on(GetBasePathMappingsCommand).resolves({ items: [] });
      APIGatewayMock.on(CreateBasePathMappingCommand).resolves(null);
      const CloudFormationMock = mockClient(CloudFormationClient);
      CloudFormationMock.on(DescribeStackResourceCommand).resolves({
        StackResourceDetail: {
          LogicalResourceId: Globals.CFResourceIds[Globals.apiTypes.rest],
          PhysicalResourceId: "test_rest_api_id",
          ResourceType: "",
          LastUpdatedTimestamp: null,
          ResourceStatus: ResourceStatus.CREATE_COMPLETE
        }
      });

      const domainOptions = getDomainConfig({ domainName: "test_domain" });
      const plugin = constructPlugin(domainOptions);
      plugin.initAWSRegion = async () => null;

      await plugin.hooks["after:deploy:deploy"]();

      const commandCalls = APIGatewayMock.commandCalls(CreateBasePathMappingCommand);
      expect(commandCalls.length).to.equal(1);
    });

    it("after:deploy:deploy with the updateBasePathMapping", async () => {
      const APIGatewayMock = mockClient(APIGatewayClient);
      APIGatewayMock.on(GetDomainNameCommand).resolves({
        domainName: "dummy_domain",
        regionalHostedZoneId: "test_id"
      });
      APIGatewayMock.on(GetBasePathMappingsCommand).resolves({
        items: [{
          restApiId: "test_rest_api_id",
          basePath: "test",
          stage: "test"
        }]
      });
      APIGatewayMock.on(UpdateBasePathMappingCommand).resolves(null);
      const CloudFormationMock = mockClient(CloudFormationClient);
      CloudFormationMock.on(DescribeStackResourceCommand).resolves({
        StackResourceDetail: {
          LogicalResourceId: Globals.CFResourceIds[Globals.apiTypes.rest],
          PhysicalResourceId: "test_rest_api_id",
          ResourceType: "",
          LastUpdatedTimestamp: null,
          ResourceStatus: ResourceStatus.CREATE_COMPLETE
        }
      });

      const domainOptions = getDomainConfig({ domainName: "test_domain" });
      const plugin = constructPlugin(domainOptions);
      plugin.initAWSRegion = async () => null;

      await plugin.hooks["after:deploy:deploy"]();

      const commandCalls = APIGatewayMock.commandCalls(UpdateBasePathMappingCommand);
      expect(commandCalls.length).to.equal(1);
    });

    it("after:info:info", async () => {
      const APIGatewayMock = mockClient(APIGatewayClient);
      APIGatewayMock.on(GetDomainNameCommand).resolves({
        domainName: "dummy_domain",
        regionalHostedZoneId: "test_id"
      });

      const plugin = constructPlugin(getDomainConfig({ domainName: "test_domain" }));
      plugin.initAWSRegion = async () => null;

      await plugin.hooks["after:info:info"]();

      expect(consoleOutput[0]).to.equal("[Summary] Distribution Domain Name");
      expect(consoleOutput[1]).to.equal(" Domain Name: test_domain");
      expect(consoleOutput[2]).to.equal(" Target Domain: dummy_domain");
      expect(consoleOutput[3]).to.equal(" Hosted Zone Id: test_id");
    });

    it("before:deploy:deploy with autoDomain false", async () => {
      const APIGatewayMock = mockClient(APIGatewayClient);
      APIGatewayMock.on(GetDomainNameCommand).resolvesOnce({})
        .resolves({
          domainName: "dummy_domain",
          regionalHostedZoneId: "test_id"
        });

      const domainOptions = getDomainConfig({ domainName: "test_domain" });
      const plugin = constructPlugin(domainOptions);
      plugin.initAWSRegion = async () => null;

      const createDomainSpy = chaiSpy.on(plugin, "createDomain");
      await plugin.hooks["before:deploy:deploy"]();

      expect(createDomainSpy).to.not.have.been.called();
    });

    it("before:deploy:deploy with autoDomain true", async () => {
      const APIGatewayMock = mockClient(APIGatewayClient);
      APIGatewayMock.on(GetDomainNameCommand)
        .rejectsOnce({ $metadata: { httpStatusCode: 404 } })
        .resolves({
          domainName: "dummy_domain",
          regionalHostedZoneId: "test_id"
        });

      const plugin = constructPlugin(getDomainConfig({
        domainName: "test_domain",
        autoDomain: true
      }));
      plugin.createDomain = async () => null;
      plugin.initAWSRegion = async () => null;

      const createDomainSpy = chaiSpy.on(plugin, "createDomain");
      await plugin.hooks["before:deploy:deploy"]();

      expect(createDomainSpy).to.have.been.called();
    });

    it("before:remove:remove with autoDomain true", async () => {
      const APIGatewayMock = mockClient(APIGatewayClient);
      APIGatewayMock.on(GetDomainNameCommand).resolves({
        domainName: "dummy_domain",
        regionalHostedZoneId: "test_id"
      });
      APIGatewayMock.on(GetBasePathMappingsCommand).resolves({
        items: [{
          restApiId: "test_rest_api_id",
          basePath: "test",
          stage: "test"
        }]
      });
      APIGatewayMock.on(DeleteBasePathMappingCommand).resolves(null);
      const CloudFormationMock = mockClient(CloudFormationClient);
      CloudFormationMock.on(DescribeStackResourceCommand).resolves({
        StackResourceDetail: {
          LogicalResourceId: Globals.CFResourceIds[Globals.apiTypes.rest],
          PhysicalResourceId: "test_rest_api_id",
          ResourceType: "",
          LastUpdatedTimestamp: null,
          ResourceStatus: ResourceStatus.CREATE_COMPLETE
        }
      });

      const domainOptions = getDomainConfig({ domainName: "test_domain" });
      const plugin = constructPlugin(domainOptions);
      plugin.initAWSRegion = async () => null;

      await plugin.hooks["before:remove:remove"]();

      const commandCalls = APIGatewayMock.commandCalls(DeleteBasePathMappingCommand);
      expect(commandCalls.length).to.equal(1);
    });

    it("before:remove:remove with autoDomain false", async () => {
      const APIGatewayMock = mockClient(APIGatewayClient);
      APIGatewayMock.on(GetDomainNameCommand).resolves({
        domainName: "dummy_domain",
        regionalHostedZoneId: "test_id"
      });
      APIGatewayMock.on(GetBasePathMappingsCommand).resolves({
        items: [{
          restApiId: "test_rest_api_id",
          basePath: "test",
          stage: "test"
        }]
      });
      APIGatewayMock.on(DeleteBasePathMappingCommand).resolves(null);
      const CloudFormationMock = mockClient(CloudFormationClient);
      CloudFormationMock.on(DescribeStackResourceCommand).resolves({
        StackResourceDetail: {
          LogicalResourceId: Globals.CFResourceIds[Globals.apiTypes.rest],
          PhysicalResourceId: "test_rest_api_id",
          ResourceType: "",
          LastUpdatedTimestamp: null,
          ResourceStatus: ResourceStatus.CREATE_COMPLETE
        }
      });

      const domainOptions = getDomainConfig({
        domainName: "test_domain",
        autoDomain: true
      });
      const plugin = constructPlugin(domainOptions);
      plugin.initAWSRegion = async () => null;
      plugin.deleteDomain = async () => null;

      const deleteDomainSpy = chaiSpy.on(plugin, "deleteDomain");
      await plugin.hooks["before:remove:remove"]();

      const commandCalls = APIGatewayMock.commandCalls(DeleteBasePathMappingCommand);
      expect(commandCalls.length).to.equal(1);
      expect(deleteDomainSpy).to.have.been.called();
    });

    it("create_domain:create", async () => {
      const APIGatewayMock = mockClient(APIGatewayClient);
      APIGatewayMock.on(GetDomainNameCommand).resolves({
        domainName: "dummy_domain",
        regionalHostedZoneId: "test_id"
      });
      const Route53Mock = mockClient(Route53Client);
      Route53Mock.on(ListHostedZonesCommand).resolves({
        HostedZones: [{
          CallerReference: "1",
          Config: { PrivateZone: true },
          Id: "public_host_id",
          Name: "test_domain"
        }]
      });
      Route53Mock.on(ChangeResourceRecordSetsCommand).resolves(null);

      const plugin = constructPlugin(getDomainConfig({ domainName: "test_domain" }));
      plugin.initAWSRegion = async () => null;
      plugin.deleteDomain = async () => null;

      const deleteDomainSpy = chaiSpy.on(plugin, "deleteDomain");
      await plugin.hooks["create_domain:create"]();

      const commandCalls = Route53Mock.commandCalls(ChangeResourceRecordSetsCommand);
      expect(commandCalls.length).to.equal(1);
      expect(deleteDomainSpy).to.not.have.been.called();
    });

    it("create_domain:create with no domain info", async () => {
      const APIGatewayMock = mockClient(APIGatewayClient);
      APIGatewayMock.on(GetDomainNameCommand).rejects({ $metadata: { httpStatusCode: 404 } });
      APIGatewayMock.on(CreateDomainNameCommand).resolves({
        distributionDomainName: "foo",
        securityPolicy: "TLS_1_0"
      });
      const ACMCMock = mockClient(ACMClient);
      ACMCMock.on(ListCertificatesCommand).resolves({
        CertificateSummaryList: [{
          CertificateArn: "test_certificate_arn",
          DomainName: "test_domain"
        }]
      });
      const Route53Mock = mockClient(Route53Client);
      Route53Mock.on(ListHostedZonesCommand).resolves({
        HostedZones: [{
          CallerReference: "1",
          Config: { PrivateZone: true },
          Id: "public_host_id",
          Name: "test_domain"
        }]
      });
      Route53Mock.on(ChangeResourceRecordSetsCommand).resolves(null);

      const plugin = constructPlugin(getDomainConfig({ domainName: "test_domain" }));
      plugin.initAWSRegion = async () => null;
      plugin.deleteDomain = async () => null;

      const deleteDomainSpy = chaiSpy.on(plugin, "deleteDomain");
      await plugin.hooks["create_domain:create"]();

      const commandCalls = Route53Mock.commandCalls(ChangeResourceRecordSetsCommand);
      expect(commandCalls.length).to.equal(1);
      expect(deleteDomainSpy).to.not.have.been.called();
    });

    it("delete_domain:delete", async () => {
      const APIGatewayMock = mockClient(APIGatewayClient);
      APIGatewayMock.on(GetDomainNameCommand).resolves({
        domainName: "dummy_domain",
        regionalHostedZoneId: "test_id"
      });
      APIGatewayMock.on(DeleteDomainNameCommand).resolves(null);
      const ACMCMock = mockClient(ACMClient);
      ACMCMock.on(ListCertificatesCommand).resolves({
        CertificateSummaryList: [{
          CertificateArn: "test_certificate_arn",
          DomainName: "test_domain"
        }]
      });
      const Route53Mock = mockClient(Route53Client);
      Route53Mock.on(ListHostedZonesCommand).resolves({
        HostedZones: [{
          CallerReference: "1",
          Config: { PrivateZone: true },
          Id: "public_host_id",
          Name: "test_domain"
        }]
      });
      Route53Mock.on(ChangeResourceRecordSetsCommand).resolves(null);

      const plugin = constructPlugin(getDomainConfig({ domainName: "test_domain" }));
      plugin.initAWSRegion = async () => null;

      await plugin.hooks["delete_domain:delete"]();

      const commandCalls = Route53Mock.commandCalls(ChangeResourceRecordSetsCommand);
      expect(commandCalls.length).to.equal(1);
    });
  });
});

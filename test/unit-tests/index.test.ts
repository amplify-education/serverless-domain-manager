import Globals from "../../src/globals";
import { chaiSpy, consoleOutput, constructPlugin, expect, getDomainConfig, getV3Utils } from "./base";
import Logging from "../../src/logging";
import DomainConfig = require("../../src/models/domain-config");
import utils = require("../../src/utils");
import APIGatewayV1Wrapper = require("../../src/aws/api-gateway-v1-wrapper");
import APIGatewayV2Wrapper = require("../../src/aws/api-gateway-v2-wrapper");
import { mockClient } from "aws-sdk-client-mock";
import {
  APIGatewayClient, CreateBasePathMappingCommand, CreateDomainNameCommand, DeleteBasePathMappingCommand, UpdateDomainNameCommand,
  DeleteDomainNameCommand,
  GetBasePathMappingsCommand,
  GetDomainNameCommand, UpdateBasePathMappingCommand
} from "@aws-sdk/client-api-gateway";
import { ACMClient, ListCertificatesCommand } from "@aws-sdk/client-acm";
import { ApiGatewayV2Client, GetDomainNameCommand as GetDomainNameCommandV2 } from "@aws-sdk/client-apigatewayv2";
import { ChangeResourceRecordSetsCommand, ListHostedZonesCommand, Route53Client } from "@aws-sdk/client-route-53";
import {
  CloudFormationClient,
  DescribeStackResourceCommand,
  DescribeStacksCommand,
  ResourceStatus
} from "@aws-sdk/client-cloudformation";

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
        expect(err.message).to.equal("notSupported is not supported endpointType, use EDGE, REGIONAL, or PRIVATE.");
      }
      expect(errored).to.equal(true);
    });

    it("Unsupported endpointAccessMode throws exception", () => {
      expect(() => new DomainConfig(getDomainConfig({
        securityPolicy: "SecurityPolicy_TLS13_1_2_PFS_PQ_2025_09",
        endpointAccessMode: "OPEN"
      }))).to.throw("OPEN is not a supported endpointAccessMode, use BASIC or STRICT.");
    });

    it("endpointAccessMode with a multi-level basePath throws exception", () => {
      expect(() => new DomainConfig(getDomainConfig({
        basePath: "api/test",
        endpointAccessMode: "BASIC"
      }))).to.throw("endpointAccessMode is not supported with a multi-level basePath ('api/test').");
    });

    it("non-string endpointAccessMode throws a validation error", () => {
      expect(() => new DomainConfig(getDomainConfig({
        endpointAccessMode: 1
      }))).to.throw("1 is not a supported endpointAccessMode, use BASIC or STRICT.");
    });

    it("endpointAccessMode on a non-REST API throws exception", () => {
      expect(() => new DomainConfig(getDomainConfig({
        apiType: Globals.apiTypes.http,
        endpointAccessMode: "BASIC"
      }))).to.throw("endpointAccessMode is only supported for REST APIs.");
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
        expect(err.message).to.contains("'EDGE' or 'PRIVATE' endpointType is not compatible with HTTP APIs");
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
        expect(err.message).to.equal("'EDGE' or 'PRIVATE' endpointType is not compatible with WebSocket APIs");
      }
      expect(errored).to.equal(true);
    });

    it("Unsupported HTTP PRIVATE endpoint configuration", () => {
      const domainOptions = getDomainConfig({ apiType: "http", endpointType: "private" });
      const plugin = constructPlugin(domainOptions);

      let errored = false;
      try {
        plugin.initializeVariables();
        plugin.validateDomainConfigs();
      } catch (err) {
        errored = true;
        expect(err.message).to.contains("'PRIVATE' endpointType is not compatible with HTTP APIs");
      }
      expect(errored).to.equal(true);
    });

    it("Unsupported WS PRIVATE endpoint configuration", () => {
      const domainOptions = getDomainConfig({ apiType: "websocket", endpointType: "private" });
      const plugin = constructPlugin(domainOptions);

      let errored = false;
      try {
        plugin.initializeVariables();
        plugin.validateDomainConfigs();
      } catch (err) {
        errored = true;
        expect(err.message).to.contains("'PRIVATE' endpointType is not compatible with WebSocket APIs");
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

    it("Lowercase private endpoint type without errors", () => {
      const domainOptions = getDomainConfig({ endpointType: "private" });
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

    it("Should leave the security policy unset when none specified", () => {
      const dc = new DomainConfig(getDomainConfig({}));
      expect(dc.securityPolicy).to.equal(undefined);
    });

    const securityPolicyScenarios: { config: Record<string, any>; warning: string | null }[] = [
      { config: { endpointType: "REGIONAL", securityPolicy: "TLS_1_2" }, warning: null },
      { config: { endpointType: "EDGE", securityPolicy: "tls_1_0" }, warning: null },
      {
        config: { endpointType: "REGIONAL", securityPolicy: "SecurityPolicy_TLS13_1_3_2025_09", endpointAccessMode: "BASIC" },
        warning: null
      },
      {
        config: { endpointType: "EDGE", securityPolicy: "SecurityPolicy_TLS13_2025_EDGE", endpointAccessMode: "STRICT" },
        warning: null
      },
      { config: { apiType: "HTTP", endpointType: "REGIONAL", securityPolicy: "TLS_1_2" }, warning: null },
      {
        config: { apiType: "HTTP", endpointType: "REGIONAL", securityPolicy: "SecurityPolicy_TLS13_1_3_2025_09" },
        warning: "is not supported for HTTP/WebSocket APIs and multi-level base paths, use TLS_1_0 or TLS_1_2."
      },
      {
        config: { endpointType: "REGIONAL", basePath: "api/v1", securityPolicy: "SecurityPolicy_TLS13_1_3_2025_09" },
        warning: "is not supported for HTTP/WebSocket APIs and multi-level base paths, use TLS_1_0 or TLS_1_2."
      },
      {
        config: { endpointType: "REGIONAL", securityPolicy: "tls_1_3" },
        warning: "is not a known REST API security policy, AWS may reject it."
      },
      {
        config: { endpointType: "REGIONAL", securityPolicy: "SecurityPolicy_TLS13_2025_EDGE", endpointAccessMode: "BASIC" },
        warning: "is for EDGE endpoints only, not REGIONAL."
      },
      {
        config: { endpointType: "EDGE", securityPolicy: "SecurityPolicy_TLS13_1_3_2025_09", endpointAccessMode: "BASIC" },
        warning: "is not supported for EDGE endpoints, use a SecurityPolicy_*_EDGE policy."
      },
      {
        config: { endpointType: "PRIVATE", securityPolicy: "SecurityPolicy_TLS13_1_2_2021_06" },
        warning: "requires endpointAccessMode (BASIC or STRICT)."
      }
    ];
    for (const { config, warning } of securityPolicyScenarios) {
      it(`Should ${warning ? "warn" : "not warn"} about securityPolicy for ${JSON.stringify(config)}`, () => {
        consoleOutput.length = 0;
        const dc = new DomainConfig(getDomainConfig({ domainName: "test_domain", ...config }));
        const warnings = consoleOutput.filter((line) => line.includes("securityPolicy"));
        if (warning) {
          expect(warnings).to.have.length(1);
          expect(warnings[0]).to.contain(`securityPolicy '${dc.securityPolicy}' ${warning}`);
        } else {
          expect(warnings).to.have.length(0);
        }
      });
    }

    it("Should convert legacy lowercase tls_1_2 to TLS_1_2", () => {
      const dc = new DomainConfig(getDomainConfig({ securityPolicy: "tls_1_2" }));
      expect(dc.securityPolicy).to.equal("TLS_1_2");
    });

    it("Should convert legacy lowercase tls_1_0 to TLS_1_0", () => {
      const dc = new DomainConfig(getDomainConfig({ securityPolicy: "tls_1_0" }));
      expect(dc.securityPolicy).to.equal("TLS_1_0");
    });

    it("Should accept arbitrary security policy values", () => {
      const dc = new DomainConfig(getDomainConfig({ securityPolicy: "SecurityPolicy_TLS13_2025_EDGE" }));
      expect(dc.securityPolicy).to.equal("SecurityPolicy_TLS13_2025_EDGE");
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

    it("Should fall back to the default when a boolean option is left empty", () => {
      const plugin = constructPlugin(getDomainConfig({
        domainName: "test_domain",
        enabled: null,
        autoDomain: null
      }));

      plugin.initializeVariables();
      expect(plugin.domains.length).to.equal(1);
      expect(plugin.domains[0].enabled).to.equal(true);
      expect(plugin.domains[0].autoDomain).to.equal(false);
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

    it("Should throw an Error when mutual TLS is enabled for private APIs", async () => {
      const plugin = constructPlugin(getDomainConfig({
        endpointType: "private",
        tlsTruststoreUri: "s3://bucket-name/key-name"
      }));

      let errored = false;
      try {
        await plugin.hookWrapper(null);
      } catch (err) {
        errored = true;
        expect(err.message).to.equal("PRIVATE APIs do not support mutual TLS, remove tlsTruststoreUri or change to a regional API.");
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

    for (const tlsTruststoreUri of ["https://example.com/a/b", "s3://bucket-name", "s3://bucket-name/", "not a uri"]) {
      it(`Should throw an Error when mutual TLS uri is not a valid S3 object uri: '${tlsTruststoreUri}'`, async () => {
        const plugin = constructPlugin(getDomainConfig({ endpointType: "regional", tlsTruststoreUri }));

        let errored = false;
        try {
          await plugin.hookWrapper(null);
        } catch (err) {
          errored = true;
          expect(err.message).to.equal(
            `${tlsTruststoreUri} is not a valid s3 uri, try something like s3://bucket-name/key-name.`
          );
        }
        expect(errored).to.equal(true);
      });
    }

    it("Should accept a valid S3 uri for mutual TLS", () => {
      const plugin = constructPlugin(getDomainConfig({
        endpointType: "regional",
        tlsTruststoreUri: "s3://bucket-name/path/to/truststore.pem"
      }));

      plugin.initializeVariables();
      expect(plugin.domains[0].tlsTruststoreUri).to.equal("s3://bucket-name/path/to/truststore.pem");
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

    it("before:deploy:deploy with autoDomain true only polls domains that do not exist yet", async () => {
      const APIGatewayMock = mockClient(APIGatewayClient);
      APIGatewayMock.on(GetDomainNameCommand, { domainName: "ready.test_domain" }).resolves({
        domainName: "dummy_domain",
        regionalHostedZoneId: "test_id"
      });
      APIGatewayMock.on(GetDomainNameCommand, { domainName: "pending.test_domain" })
        .rejects({ $metadata: { httpStatusCode: 404 } });

      const plugin = constructPlugin([
        getDomainConfig({ domainName: "ready.test_domain", autoDomain: true, autoDomainWaitFor: "6" }),
        getDomainConfig({ domainName: "pending.test_domain", autoDomain: true, autoDomainWaitFor: "6" })
      ]);
      plugin.createDomain = async () => null;
      plugin.initAWSRegion = async () => null;

      const originalSleep = utils.sleep;
      let sleepCalls = 0;
      utils.sleep = async () => {
        sleepCalls++;
      };
      try {
        await plugin.hooks["before:deploy:deploy"]();
      } finally {
        utils.sleep = originalSleep;
      }

      // 6s wait / 3s interval => 2 polls, for the pending domain only
      expect(sleepCalls).to.equal(2);
      const readyCalls = APIGatewayMock.commandCalls(GetDomainNameCommand, { domainName: "ready.test_domain" });
      const pendingCalls = APIGatewayMock.commandCalls(GetDomainNameCommand, { domainName: "pending.test_domain" });
      // hookWrapper credentials probe + initial lookup; no re-polling of an existing domain
      expect(readyCalls.length).to.equal(2);
      expect(pendingCalls.length).to.equal(3);
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

    for (const { preserveExternalPathMappings, shouldDeleteDomain } of [
      { preserveExternalPathMappings: false, shouldDeleteDomain: true },
      { preserveExternalPathMappings: true, shouldDeleteDomain: false }
    ]) {
      it(`before:remove:remove without a CloudFormation stack and preserveExternalPathMappings ${preserveExternalPathMappings}`, async () => {
        mockClient(APIGatewayClient);
        const CloudFormationMock = mockClient(CloudFormationClient);
        CloudFormationMock.on(DescribeStackResourceCommand).rejects(new Error("Stack does not exist"));
        CloudFormationMock.on(DescribeStacksCommand).resolves({ Stacks: [] });

        const plugin = constructPlugin(getDomainConfig({
          domainName: "test_domain",
          autoDomain: true,
          preserveExternalPathMappings
        }));
        plugin.initAWSRegion = async () => null;
        plugin.deleteDomain = async () => null;
        const deleteDomainSpy = chaiSpy.on(plugin, "deleteDomain");

        await plugin.hooks["before:remove:remove"]();

        expect(consoleOutput.join("\n")).to.contains("Unable to find Cloudformation Stack for test_domain");
        if (shouldDeleteDomain) {
          expect(deleteDomainSpy).to.have.been.called();
        } else {
          expect(deleteDomainSpy).to.not.have.been.called();
        }
      });
    }

    it("before:remove:remove warns with the error when removing the base path mapping fails", async () => {
      const APIGatewayMock = mockClient(APIGatewayClient);
      APIGatewayMock.on(GetBasePathMappingsCommand).rejects(new Error("access denied"));
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

      const plugin = constructPlugin(getDomainConfig({ domainName: "test_domain" }));
      plugin.initAWSRegion = async () => null;

      await plugin.hooks["before:remove:remove"]();

      const output = consoleOutput.join("\n");
      expect(output).to.contains("Unable to remove base path mappings for 'test_domain'");
      expect(output).to.contains("access denied");
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
          basePath: "test2",
          stage: "dummy"
        }, {
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

    it("create_domain:create updates an existing domain whose endpoint access mode differs", async () => {
      const APIGatewayMock = mockClient(APIGatewayClient);
      APIGatewayMock.on(GetDomainNameCommand).resolves({
        domainName: "test_domain",
        regionalHostedZoneId: "test_id",
        securityPolicy: "TLS_1_2"
      });
      APIGatewayMock.on(UpdateDomainNameCommand).resolves({
        domainName: "test_domain",
        regionalHostedZoneId: "test_id",
        securityPolicy: "SecurityPolicy_TLS13_1_2_PFS_PQ_2025_09",
        endpointAccessMode: "BASIC"
      });
      const ACMCMock = mockClient(ACMClient);
      ACMCMock.on(ListCertificatesCommand).resolves({
        CertificateSummaryList: [{ CertificateArn: "test_certificate_arn", DomainName: "test_domain" }]
      });
      const Route53Mock = mockClient(Route53Client);
      Route53Mock.on(ListHostedZonesCommand).resolves({
        HostedZones: [{ CallerReference: "1", Config: { PrivateZone: true }, Id: "public_host_id", Name: "test_domain" }]
      });
      Route53Mock.on(ChangeResourceRecordSetsCommand).resolves(null);

      const plugin = constructPlugin(getDomainConfig({
        domainName: "test_domain",
        securityPolicy: "SecurityPolicy_TLS13_1_2_PFS_PQ_2025_09",
        endpointAccessMode: "BASIC"
      }));
      plugin.initAWSRegion = async () => null;
      await plugin.hooks["create_domain:create"]();

      expect(APIGatewayMock.commandCalls(UpdateDomainNameCommand).length).to.equal(1);
    });

    it("create_domain:create leaves an existing domain alone when no endpoint access mode is configured", async () => {
      const APIGatewayMock = mockClient(APIGatewayClient);
      APIGatewayMock.on(GetDomainNameCommand).resolves({
        domainName: "test_domain",
        regionalHostedZoneId: "test_id",
        securityPolicy: "TLS_1_0"
      });
      const ACMCMock = mockClient(ACMClient);
      ACMCMock.on(ListCertificatesCommand).resolves({
        CertificateSummaryList: [{ CertificateArn: "test_certificate_arn", DomainName: "test_domain" }]
      });
      const Route53Mock = mockClient(Route53Client);
      Route53Mock.on(ListHostedZonesCommand).resolves({
        HostedZones: [{ CallerReference: "1", Config: { PrivateZone: true }, Id: "public_host_id", Name: "test_domain" }]
      });
      Route53Mock.on(ChangeResourceRecordSetsCommand).resolves(null);

      const plugin = constructPlugin(getDomainConfig({ domainName: "test_domain" }));
      plugin.initAWSRegion = async () => null;
      await plugin.hooks["create_domain:create"]();

      expect(APIGatewayMock.commandCalls(UpdateDomainNameCommand).length).to.equal(0);
    });

    const existingDomains: { existing: Record<string, any>; expectedUpdates: number }[] = [
      { existing: { securityPolicy: "TLS_1_2" }, expectedUpdates: 1 },
      { existing: { securityPolicy: "SecurityPolicy_TLS13_1_2_PFS_PQ_2025_09", endpointAccessMode: "BASIC" }, expectedUpdates: 0 }
    ];
    for (const { existing, expectedUpdates } of existingDomains) {
      it(`after:deploy:deploy makes ${expectedUpdates} domain update(s) for an existing domain with ${JSON.stringify(existing)}`, async () => {
        const APIGatewayMock = mockClient(APIGatewayClient);
        APIGatewayMock.on(GetDomainNameCommand).resolves({
          domainName: "test_domain",
          regionalHostedZoneId: "test_id",
          ...existing
        });
        APIGatewayMock.on(UpdateDomainNameCommand).resolves({
          domainName: "test_domain",
          regionalHostedZoneId: "test_id",
          securityPolicy: "SecurityPolicy_TLS13_1_2_PFS_PQ_2025_09",
          endpointAccessMode: "BASIC"
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

        const plugin = constructPlugin(getDomainConfig({
          domainName: "test_domain",
          securityPolicy: "SecurityPolicy_TLS13_1_2_PFS_PQ_2025_09",
          endpointAccessMode: "BASIC"
        }));
        plugin.initAWSRegion = async () => null;
        await plugin.hooks["after:deploy:deploy"]();

        const updateCalls = APIGatewayMock.commandCalls(UpdateDomainNameCommand);
        expect(updateCalls.length).to.equal(expectedUpdates);
        if (expectedUpdates) {
          expect(updateCalls[0].args[0].input.patchOperations).to.deep.equal([
            { op: "replace", path: "/securityPolicy", value: "SecurityPolicy_TLS13_1_2_PFS_PQ_2025_09" },
            { op: "replace", path: "/endpointAccessMode", value: "BASIC" }
          ]);
        }
        expect(APIGatewayMock.commandCalls(CreateBasePathMappingCommand).length).to.equal(1);
      });
    }

    const policyOnlyDomains: { existing: Record<string, any>; expectedUpdates: number }[] = [
      { existing: { securityPolicy: "TLS_1_0" }, expectedUpdates: 1 },
      { existing: { securityPolicy: "TLS_1_2" }, expectedUpdates: 0 }
    ];
    for (const { existing, expectedUpdates } of policyOnlyDomains) {
      it(`after:deploy:deploy with only securityPolicy set makes ${expectedUpdates} domain update(s) for ${existing.securityPolicy}`, async () => {
        const APIGatewayMock = mockClient(APIGatewayClient);
        APIGatewayMock.on(GetDomainNameCommand).resolves({
          domainName: "test_domain",
          regionalHostedZoneId: "test_id",
          ...existing
        });
        APIGatewayMock.on(UpdateDomainNameCommand).resolves({
          domainName: "test_domain",
          regionalHostedZoneId: "test_id",
          securityPolicy: "TLS_1_2"
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

        const plugin = constructPlugin(getDomainConfig({ domainName: "test_domain", securityPolicy: "TLS_1_2" }));
        plugin.initAWSRegion = async () => null;
        await plugin.hooks["after:deploy:deploy"]();

        const updateCalls = APIGatewayMock.commandCalls(UpdateDomainNameCommand);
        expect(updateCalls.length).to.equal(expectedUpdates);
        if (expectedUpdates) {
          expect(updateCalls[0].args[0].input.patchOperations).to.deep.equal([
            { op: "replace", path: "/securityPolicy", value: "TLS_1_2" }
          ]);
        }
      });
    }

    it("after:deploy:deploy with only endpointAccessMode set updates the mode and keeps the security policy", async () => {
      const APIGatewayMock = mockClient(APIGatewayClient);
      APIGatewayMock.on(GetDomainNameCommand).resolves({
        domainName: "test_domain",
        regionalHostedZoneId: "test_id",
        securityPolicy: "TLS_1_0"
      });
      APIGatewayMock.on(UpdateDomainNameCommand).resolves({
        domainName: "test_domain",
        regionalHostedZoneId: "test_id",
        securityPolicy: "TLS_1_0",
        endpointAccessMode: "BASIC"
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

      const plugin = constructPlugin(getDomainConfig({ domainName: "test_domain", endpointAccessMode: "BASIC" }));
      plugin.initAWSRegion = async () => null;
      await plugin.hooks["after:deploy:deploy"]();

      const updateCalls = APIGatewayMock.commandCalls(UpdateDomainNameCommand);
      expect(updateCalls.length).to.equal(1);
      expect(updateCalls[0].args[0].input.patchOperations).to.deep.equal([
        { op: "replace", path: "/endpointAccessMode", value: "BASIC" }
      ]);
    });

    it("create_domain:create warns when the security policy of an HTTP API domain differs", async () => {
      const APIGatewayV2Mock = mockClient(ApiGatewayV2Client);
      APIGatewayV2Mock.on(GetDomainNameCommandV2).resolves({
        DomainName: "test_domain",
        DomainNameConfigurations: [{ SecurityPolicy: "TLS_1_0", HostedZoneId: "test_id" }]
      });
      const Route53Mock = mockClient(Route53Client);
      Route53Mock.on(ListHostedZonesCommand).resolves({
        HostedZones: [{ CallerReference: "1", Config: { PrivateZone: false }, Id: "public_host_id", Name: "test_domain" }]
      });
      Route53Mock.on(ChangeResourceRecordSetsCommand).resolves(null);

      const plugin = constructPlugin(getDomainConfig({
        domainName: "test_domain",
        apiType: Globals.apiTypes.http,
        endpointType: Globals.endpointTypes.regional,
        securityPolicy: "TLS_1_2"
      }));
      plugin.initAWSRegion = async () => null;
      await plugin.hooks["create_domain:create"]();

      expect(consoleOutput.join("\n")).to.contain(
        "Custom domain 'test_domain' security policy cannot be updated for HTTP/WebSocket APIs or multi-level base paths."
      );
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
      const deleteDomainCalls = APIGatewayMock.commandCalls(DeleteDomainNameCommand);
      expect(deleteDomainCalls.length).to.equal(1);
      expect(commandCalls[0].calledBefore(deleteDomainCalls[0])).to.equal(true);
    });

    it("delete_domain:delete keeps the domain when removing the Route53 records fails", async () => {
      const APIGatewayMock = mockClient(APIGatewayClient);
      APIGatewayMock.on(GetDomainNameCommand).resolves({
        domainName: "dummy_domain",
        regionalHostedZoneId: "test_id"
      });
      APIGatewayMock.on(DeleteDomainNameCommand).resolves(null);
      const Route53Mock = mockClient(Route53Client);
      Route53Mock.on(ListHostedZonesCommand).resolves({
        HostedZones: [{
          CallerReference: "1",
          Config: { PrivateZone: false },
          Id: "public_host_id",
          Name: "test_domain"
        }]
      });
      Route53Mock.on(ChangeResourceRecordSetsCommand).rejects(new Error("route53 failure"));

      const plugin = constructPlugin(getDomainConfig({ domainName: "test_domain" }));
      plugin.initAWSRegion = async () => null;

      let errored = false;
      try {
        await plugin.hooks["delete_domain:delete"]();
      } catch (err) {
        errored = true;
        expect(err.message).to.contains("Unable to delete domain 'test_domain'");
        expect(err.message).to.contains("route53 failure");
      }
      expect(errored).to.equal(true);
      expect(APIGatewayMock.commandCalls(DeleteDomainNameCommand).length).to.equal(0);
    });

    it("delete_domain:delete uses the framework credentials for Route53 when route53Profile is not set", async () => {
      const frameworkCreds = {
        accessKeyId: "framework_key_id",
        secretAccessKey: "framework_secret"
      };
      const APIGatewayMock = mockClient(APIGatewayClient);
      APIGatewayMock.on(GetDomainNameCommand).resolves({
        domainName: "dummy_domain",
        regionalHostedZoneId: "test_id"
      });
      APIGatewayMock.on(DeleteDomainNameCommand).resolves(null);
      const Route53Mock = mockClient(Route53Client);
      Route53Mock.on(ListHostedZonesCommand).resolves({
        HostedZones: [{
          CallerReference: "1",
          Config: { PrivateZone: false },
          Id: "public_host_id",
          Name: "test_domain"
        }]
      });
      Route53Mock.on(ChangeResourceRecordSetsCommand).resolves(null);

      const plugin = constructPlugin(getDomainConfig({ domainName: "test_domain" }));
      // serverless v3 wraps the AWS SDK v2 credentials as { credentials }
      plugin.serverless.providers.aws.getCredentials = () => ({ credentials: frameworkCreds });
      plugin.initAWSRegion = async () => null;

      try {
        await plugin.hooks["delete_domain:delete"]();

        const commandCalls = Route53Mock.commandCalls(ChangeResourceRecordSetsCommand);
        expect(commandCalls.length).to.equal(1);
        const route53Client = commandCalls[0].thisValue as Route53Client;
        expect(await route53Client.config.credentials()).to.deep.include(frameworkCreds);
      } finally {
        Globals.credentials = null;
      }
    });
  });

  describe("osls v4 / AWS SDK v2 surface removed", () => {
    let originalServerless: any;
    before(() => { originalServerless = Globals.serverless; });
    after(() => { Globals.serverless = originalServerless; });

    it("getServiceEndpoint does not touch providers.aws.sdk when getAwsSdkV3Config is present", () => {
      // osls v4 removed the bundled AWS SDK v2 module: providers.aws.sdk is a
      // throwing surface. The plugin must not access it when getAwsSdkV3Config
      // is available, and AWS SDK v3 clients resolve endpoints natively.
      Globals.serverless = {
        providers: {
          aws: {
            getAwsSdkV3Config: async () => ({}),
            get sdk () {
              throw new Error("AWS_SDK_V2_SURFACE_REMOVED");
            }
          }
        }
      } as any;
      expect(Globals.getServiceEndpoint("cloudformation")).to.equal(null);
    });

    it("getServiceEndpoint still reads sdk.config on v3 frameworks", () => {
      Globals.serverless = {
        providers: {
          aws: {
            sdk: { config: { cloudformation: { endpoint: "http://localstack:4566" } } }
          }
        }
      } as any;
      expect(Globals.getServiceEndpoint("cloudformation")).to.equal("http://localstack:4566");
    });

    it("initSLSCredentials pulls credentials from getAwsSdkV3Config and never calls getCredentials", async () => {
      // osls v4: getCredentials() is a throwing removal stub. With no profile
      // configured, credentials must come from getAwsSdkV3Config().credentials.
      const plugin = constructPlugin(getDomainConfig({}));
      let credentialsCalls = 0;
      Globals.serverless = {
        providers: {
          aws: {
            getAwsSdkV3Config: async () => ({ credentials: { accessKeyId: "v4-creds" } }),
            getCredentials () {
              credentialsCalls++;
              throw new Error("AWS_SDK_V2_SURFACE_REMOVED");
            }
          }
        },
        service: { provider: {} }
      } as any;
      await plugin.initSLSCredentials();
      expect(Globals.credentials).to.deep.equal({ accessKeyId: "v4-creds" });
      expect(credentialsCalls).to.equal(0);
    });

    it("initSLSCredentials survives a throwing getCredentials when getAwsSdkV3Config is absent", async () => {
      // Defensive: if a framework lacks getAwsSdkV3Config but makes getCredentials
      // throw, the plugin must not crash — it falls back to the SDK v3 default chain.
      const plugin = constructPlugin(getDomainConfig({}));
      Globals.serverless = {
        providers: {
          aws: {
            getCredentials () {
              throw new Error("AWS_SDK_V2_SURFACE_REMOVED");
            }
          }
        },
        service: { provider: {} },
        cli: { log: () => null }
      } as any;
      await plugin.initSLSCredentials();
      expect(Globals.credentials).to.equal(null);
    });
  });

  describe("serverless v3 getCredentials() (#683)", () => {
    const v2Credentials = {
      accessKeyId: "env_key_id",
      secretAccessKey: "env_secret",
      sessionToken: "env_token",
      expireTime: null,
      get: () => null
    };
    let originalServerless: any;
    beforeEach(() => { originalServerless = Globals.serverless; });
    afterEach(() => {
      Globals.serverless = originalServerless;
      Globals.credentials = null;
    });

    for (const { name, result, expected } of [
      {
        name: "unwraps the AWS SDK v2 credentials into AWS SDK v3 credentials",
        result: { credentials: v2Credentials, signatureVersion: "v4" },
        expected: { accessKeyId: "env_key_id", secretAccessKey: "env_secret", sessionToken: "env_token" }
      },
      { name: "falls back to the default chain when nothing was found", result: {}, expected: null },
      {
        name: "falls back to the default chain when the keys are not loaded (e.g. SSO profiles)",
        result: { credentials: { accessKeyId: undefined, secretAccessKey: undefined } },
        expected: null
      }
    ]) {
      it(`initSLSCredentials ${name}`, async () => {
        const plugin = constructPlugin(getDomainConfig({}));
        plugin.serverless.providers.aws.getCredentials = () => result;
        await plugin.initSLSCredentials();
        expect(Globals.credentials).to.deep.equal(expected);
      });
    }

    it("passes valid credentials to the AWS SDK v3 clients", async () => {
      const APIGatewayMock = mockClient(APIGatewayClient);
      APIGatewayMock.on(GetDomainNameCommand).resolves({ domainName: "test_domain", regionalHostedZoneId: "test_id" });

      const plugin = constructPlugin(getDomainConfig({ domainName: "test_domain" }));
      plugin.serverless.providers.aws.getCredentials = () => ({ credentials: v2Credentials });
      plugin.initAWSRegion = async () => null;
      await plugin.hookWrapper(async () => null);

      expect(await plugin.apiGatewayV1Wrapper.apiGateway.config.credentials()).to.deep.include({
        accessKeyId: "env_key_id",
        secretAccessKey: "env_secret",
        sessionToken: "env_token"
      });
    });
  });
});

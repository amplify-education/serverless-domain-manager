import { mockClient } from "aws-sdk-client-mock";
import {
  ApiGatewayV2Client, CreateApiMappingCommand,
  CreateDomainNameCommand, DeleteApiMappingCommand,
  DeleteDomainNameCommand, EndpointType, GetApiMappingsCommand,
  GetDomainNameCommand, SecurityPolicy, UpdateApiMappingCommand
} from "@aws-sdk/client-apigatewayv2";
import { consoleOutput, expect, getDomainConfig } from "../base";
import Globals from "../../../src/globals";
import DomainConfig = require("../../../src/models/domain-config");
import DomainInfo = require("../../../src/models/domain-info");
import ApiGatewayMap = require("../../../src/models/api-gateway-map");
import APIGatewayV2Wrapper = require("../../../src/aws/api-gateway-v2-wrapper");

describe("API Gateway V2 wrapper checks", () => {
  beforeEach(() => {
    consoleOutput.length = 0;
  });

  it("Initialization", async () => {
    const apiGatewayV2Wrapper = new APIGatewayV2Wrapper();
    const actualResult = await apiGatewayV2Wrapper.apiGateway.config.region();
    expect(actualResult).to.equal(Globals.currentRegion);
  });

  describe("Custom domain", () => {
    it("create custom domain edge", async () => {
      const APIGatewayMock = mockClient(ApiGatewayV2Client);
      APIGatewayMock.on(CreateDomainNameCommand).resolves({
        DomainName: "foo",
        DomainNameConfigurations: [{ SecurityPolicy: "TLS_1_2" }]
      });

      const apiGatewayV2Wrapper = new APIGatewayV2Wrapper();
      const dc = new DomainConfig(getDomainConfig({
        domainName: "test_domain",
        basePath: "test_basepath",
        endpointType: Globals.endpointTypes.edge,
        securityPolicy: "tls_1_0",
        certificateArn: "test_arn"
      }));

      const actualResult = await apiGatewayV2Wrapper.createCustomDomain(dc);
      const expectedResult = new DomainInfo({
        DomainName: "foo",
        DomainNameConfigurations: [{ SecurityPolicy: "TLS_1_2" }]
      });

      expect(actualResult).to.eql(expectedResult);

      const expectedParams = {
        DomainName: dc.givenDomainName,
        DomainNameConfigurations: [
          {
            CertificateArn: dc.certificateArn,
            EndpointType: EndpointType.EDGE,
            SecurityPolicy: SecurityPolicy.TLS_1_0
          }
        ],
        Tags: {
          ...Globals.serverless.service.provider.stackTags,
          ...Globals.serverless.service.provider.tags
        }
      };
      const commandCalls = APIGatewayMock.commandCalls(CreateDomainNameCommand, expectedParams, true);

      expect(commandCalls.length).to.equal(1);
    });

    it("create custom domain regional", async () => {
      const APIGatewayMock = mockClient(ApiGatewayV2Client);
      APIGatewayMock.on(CreateDomainNameCommand).resolves({
        DomainName: "foo",
        DomainNameConfigurations: [{ SecurityPolicy: "TLS_1_2" }]
      });

      const apiGatewayV2Wrapper = new APIGatewayV2Wrapper();
      const dc = new DomainConfig(getDomainConfig({
        domainName: "test_domain",
        basePath: "test_basepath",
        endpointType: Globals.endpointTypes.regional,
        securityPolicy: "tls_1_0",
        certificateArn: "test_arn"
      }));

      const actualResult = await apiGatewayV2Wrapper.createCustomDomain(dc);
      const expectedResult = new DomainInfo({
        DomainName: "foo",
        DomainNameConfigurations: [{ SecurityPolicy: "TLS_1_2" }]
      });

      expect(actualResult).to.eql(expectedResult);

      const expectedParams = {
        DomainName: dc.givenDomainName,
        DomainNameConfigurations: [
          {
            CertificateArn: dc.certificateArn,
            EndpointType: EndpointType.REGIONAL,
            SecurityPolicy: SecurityPolicy.TLS_1_0
          }
        ],
        Tags: {
          ...Globals.serverless.service.provider.stackTags,
          ...Globals.serverless.service.provider.tags
        }
      };
      const commandCalls = APIGatewayMock.commandCalls(CreateDomainNameCommand, expectedParams, true);

      expect(commandCalls.length).to.equal(1);
    });

    it("create custom domain with mutual TLS authentication", async () => {
      const APIGatewayMock = mockClient(ApiGatewayV2Client);
      APIGatewayMock.on(CreateDomainNameCommand).resolves({
        DomainName: "foo",
        DomainNameConfigurations: [{ SecurityPolicy: "TLS_1_2" }]
      });

      const apiGatewayV2Wrapper = new APIGatewayV2Wrapper();
      const dc = new DomainConfig(getDomainConfig({
        domainName: "test_domain",
        basePath: "test_basepath",
        endpointType: Globals.endpointTypes.regional,
        securityPolicy: "tls_1_0",
        certificateArn: "test_arn",
        tlsTruststoreUri: "s3://bucket-name/key-name",
        tlsTruststoreVersion: "test_version"
      }));
      const actualResult = await apiGatewayV2Wrapper.createCustomDomain(dc);
      const expectedResult = new DomainInfo({
        DomainName: "foo",
        DomainNameConfigurations: [{ SecurityPolicy: "TLS_1_2" }]
      });

      expect(actualResult).to.eql(expectedResult);

      const expectedParams = {
        DomainName: dc.givenDomainName,
        DomainNameConfigurations: [
          {
            CertificateArn: dc.certificateArn,
            EndpointType: EndpointType.REGIONAL,
            SecurityPolicy: SecurityPolicy.TLS_1_0
          }
        ],
        Tags: {
          ...Globals.serverless.service.provider.stackTags,
          ...Globals.serverless.service.provider.tags
        },
        MutualTlsAuthentication: {
          TruststoreUri: dc.tlsTruststoreUri,
          TruststoreVersion: dc.tlsTruststoreVersion
        }
      };
      const commandCalls = APIGatewayMock.commandCalls(CreateDomainNameCommand, expectedParams, true);

      expect(commandCalls.length).to.equal(1);
    });

    it("create custom domain failure", async () => {
      const APIGatewayMock = mockClient(ApiGatewayV2Client);
      APIGatewayMock.on(CreateDomainNameCommand).rejects();

      const apiGatewayV2Wrapper = new APIGatewayV2Wrapper();
      const dc = new DomainConfig(getDomainConfig({
        domainName: "test_domain",
        basePath: "test_basepath",
        endpointType: Globals.endpointTypes.regional,
        securityPolicy: "tls_1_0",
        certificateArn: "test_arn"
      }));

      let errored = false;
      try {
        await apiGatewayV2Wrapper.createCustomDomain(dc);
      } catch (err) {
        errored = true;
        expect(err.message).to.contains("V2 - Failed to create custom domain");
      }
      expect(errored).to.equal(true);
    });

    it("get custom domain", async () => {
      const APIGatewayMock = mockClient(ApiGatewayV2Client);
      APIGatewayMock.on(GetDomainNameCommand).resolves({
        DomainName: "test_domain",
        DomainNameConfigurations: [{ SecurityPolicy: "TLS_1_2" }]
      });

      const apiGatewayV2Wrapper = new APIGatewayV2Wrapper();
      const dc = new DomainConfig(getDomainConfig({
        domainName: "test_domain"
      }));

      const actualResult = await apiGatewayV2Wrapper.getCustomDomain(dc);
      const expectedResult = new DomainInfo({
        domainName: "test_domain",
        defaultHostedZoneId: "Z2FDTNDATAQYW2",
        defaultSecurityPolicy: "TLS_1_2"
      });

      expect(actualResult).to.eql(expectedResult);

      const expectedParams = {
        DomainName: dc.givenDomainName
      };
      const commandCalls = APIGatewayMock.commandCalls(GetDomainNameCommand, expectedParams, true);

      expect(commandCalls.length).to.equal(1);
    });

    it("get custom domain not found", async () => {
      const APIGatewayMock = mockClient(ApiGatewayV2Client);
      APIGatewayMock.on(GetDomainNameCommand).rejects({
        $metadata: { httpStatusCode: 404 }
      });

      const apiGatewayV2Wrapper = new APIGatewayV2Wrapper();
      const dc = new DomainConfig(getDomainConfig({
        domainName: "test_domain"
      }));

      let errored = false;
      try {
        await apiGatewayV2Wrapper.getCustomDomain(dc);
      } catch (err) {
        errored = true;
      }
      expect(errored).to.equal(false);
      expect(consoleOutput[0]).to.contains("'test_domain' does not exist.");
    });

    it("get custom domain failure", async () => {
      const APIGatewayMock = mockClient(ApiGatewayV2Client);
      APIGatewayMock.on(GetDomainNameCommand).rejects({
        $metadata: { httpStatusCode: 400 }
      });

      const apiGatewayV2Wrapper = new APIGatewayV2Wrapper();
      const dc = new DomainConfig(getDomainConfig({
        domainName: "test_domain"
      }));

      let errored = false;
      try {
        await apiGatewayV2Wrapper.getCustomDomain(dc);
      } catch (err) {
        errored = true;
        expect(err.message).to.contains("V2 - Unable to fetch information about");
      }
      expect(errored).to.equal(true);
    });

    it("delete custom domain", async () => {
      const APIGatewayMock = mockClient(ApiGatewayV2Client);
      APIGatewayMock.on(DeleteDomainNameCommand).resolves(null);

      const apiGatewayV2Wrapper = new APIGatewayV2Wrapper();
      const dc = new DomainConfig(getDomainConfig({
        domainName: "test_domain"
      }));

      await apiGatewayV2Wrapper.deleteCustomDomain(dc);

      const expectedParams = {
        DomainName: dc.givenDomainName
      };
      const commandCalls = APIGatewayMock.commandCalls(DeleteDomainNameCommand, expectedParams, true);

      expect(commandCalls.length).to.equal(1);
    });

    it("delete custom domain failure", async () => {
      const APIGatewayMock = mockClient(ApiGatewayV2Client);
      APIGatewayMock.on(DeleteDomainNameCommand).rejects();

      const apiGatewayV2Wrapper = new APIGatewayV2Wrapper();
      const dc = new DomainConfig(getDomainConfig({
        domainName: "test_domain"
      }));

      let errored = false;
      try {
        await apiGatewayV2Wrapper.deleteCustomDomain(dc);
      } catch (err) {
        errored = true;
        expect(err.message).to.contains("V2 - Failed to delete custom domain");
      }
      expect(errored).to.equal(true);
    });
  });

  describe("Base path", () => {
    it("create base path mapping", async () => {
      const APIGatewayMock = mockClient(ApiGatewayV2Client);
      APIGatewayMock.on(CreateApiMappingCommand).resolves(null);

      const apiGatewayV2Wrapper = new APIGatewayV2Wrapper();
      const dc = new DomainConfig(getDomainConfig({
        domainName: "test_domain",
        basePath: "test_basepath",
        apiId: "test_rest_api_id"
      }));

      await apiGatewayV2Wrapper.createBasePathMapping(dc);

      const expectedParams = {
        ApiMappingKey: dc.basePath,
        DomainName: dc.givenDomainName,
        ApiId: dc.apiId,
        Stage: dc.stage
      };
      const commandCalls = APIGatewayMock.commandCalls(CreateApiMappingCommand, expectedParams, true);

      expect(commandCalls.length).to.equal(1);
      expect(consoleOutput[0]).to.contains("V2 - Created API mapping");
    });

    it("create http base path mapping", async () => {
      const APIGatewayMock = mockClient(ApiGatewayV2Client);
      APIGatewayMock.on(CreateApiMappingCommand).resolves(null);

      const apiGatewayV2Wrapper = new APIGatewayV2Wrapper();
      const dc = new DomainConfig(getDomainConfig({
        domainName: "test_domain",
        basePath: "test_basepath",
        apiId: "test_rest_api_id",
        apiType: Globals.apiTypes.http
      }));

      await apiGatewayV2Wrapper.createBasePathMapping(dc);

      const expectedParams = {
        ApiMappingKey: dc.basePath,
        DomainName: dc.givenDomainName,
        ApiId: dc.apiId,
        Stage: dc.stage
      };
      const commandCalls = APIGatewayMock.commandCalls(CreateApiMappingCommand, expectedParams, true);

      expect(commandCalls.length).to.equal(1);
      expect(consoleOutput[0]).to.contains("V2 - Created API mapping");
    });

    it("create base path mapping failure", async () => {
      const APIGatewayMock = mockClient(ApiGatewayV2Client);
      APIGatewayMock.on(CreateApiMappingCommand).rejects();

      const apiGatewayV2Wrapper = new APIGatewayV2Wrapper();
      const dc = new DomainConfig(getDomainConfig({
        domainName: "test_domain",
        basePath: "test_basepath",
        apiId: "test_rest_api_id"
      }));

      let errored = false;
      try {
        await apiGatewayV2Wrapper.createBasePathMapping(dc);
      } catch (err) {
        errored = true;
        expect(err.message).to.contains("Unable to create base path mapping for");
      }
      expect(errored).to.equal(true);
    });

    it("get base path mapping", async () => {
      const APIGatewayMock = mockClient(ApiGatewayV2Client);
      APIGatewayMock.on(GetApiMappingsCommand).resolves({
        Items: [{
          ApiId: "test_rest_api_id",
          ApiMappingKey: "test",
          Stage: "test",
          ApiMappingId: "test_id"
        }, {
          ApiId: "test_rest_api_id2",
          ApiMappingKey: "test2",
          Stage: "test",
          ApiMappingId: "test_id2"
        }, {
          ApiId: "test_rest_api_id3",
          ApiMappingKey: "test3",
          Stage: "dummy",
          ApiMappingId: "test_id3"
        }]
      });

      const apiGatewayV2Wrapper = new APIGatewayV2Wrapper();
      const dc = new DomainConfig(getDomainConfig({
        domainName: "test_domain"
      }));

      const actualResult = await apiGatewayV2Wrapper.getBasePathMappings(dc);
      // should be filtered by stage
      const expectedResult = [
        new ApiGatewayMap("test_rest_api_id", "test", "test", "test_id"),
        new ApiGatewayMap("test_rest_api_id2", "test2", "test", "test_id2")
      ];

      expect(actualResult).to.eql(expectedResult);

      const expectedParams = {
        DomainName: dc.givenDomainName
      };
      const commandCalls = APIGatewayMock.commandCalls(GetApiMappingsCommand, expectedParams, true);

      expect(commandCalls.length).to.equal(1);
    });

    it("get all base path mappings", async () => {
      const APIGatewayMock = mockClient(ApiGatewayV2Client);
      APIGatewayMock.on(GetApiMappingsCommand).resolvesOnce({
        Items: [{
          ApiId: "test_rest_api_id",
          ApiMappingKey: "test",
          Stage: "test",
          ApiMappingId: "test_id"
        }],
        NextToken: "NextToken"
      })
        .resolves({
          Items: [{
            ApiId: "test_rest_api_id2",
            ApiMappingKey: "test2",
            Stage: "test",
            ApiMappingId: "test_id2"
          }]
        });

      const apiGatewayV2Wrapper = new APIGatewayV2Wrapper();
      const dc = new DomainConfig(getDomainConfig({
        domainName: "test_domain"
      }));

      const actualResult = await apiGatewayV2Wrapper.getBasePathMappings(dc);
      const expectedResult = [
        new ApiGatewayMap("test_rest_api_id", "test", "test", "test_id"),
        new ApiGatewayMap("test_rest_api_id2", "test2", "test", "test_id2")
      ];

      expect(actualResult).to.eql(expectedResult);
      expect(APIGatewayMock.calls().length).to.equal(2);
    });

    it("get base path mapping failure", async () => {
      const APIGatewayMock = mockClient(ApiGatewayV2Client);
      APIGatewayMock.on(GetApiMappingsCommand).rejects();

      const apiGatewayV2Wrapper = new APIGatewayV2Wrapper();
      const dc = new DomainConfig(getDomainConfig({
        domainName: "test_domain"
      }));

      let errored = false;
      try {
        await apiGatewayV2Wrapper.getBasePathMappings(dc);
      } catch (err) {
        errored = true;
        expect(err.message).to.contains("Unable to get API Mappings");
      }
      expect(errored).to.equal(true);
    });

    it("update base path mapping", async () => {
      const APIGatewayMock = mockClient(ApiGatewayV2Client);
      APIGatewayMock.on(UpdateApiMappingCommand).resolves(null);

      const apiGatewayV2Wrapper = new APIGatewayV2Wrapper();
      const dc = new DomainConfig(getDomainConfig({
        domainName: "test_domain",
        basePath: "test_basepath",
        apiId: "test_rest_api_id"
      }));
      dc.apiMapping = {
        apiId: "old_api_id",
        basePath: "old_basepath",
        stage: "test",
        apiMappingId: null
      };

      await apiGatewayV2Wrapper.updateBasePathMapping(dc);

      const expectedParams = {
        ApiId: dc.apiId,
        ApiMappingId: dc.apiMapping.apiMappingId,
        ApiMappingKey: dc.basePath,
        DomainName: dc.givenDomainName,
        Stage: dc.stage
      };
      const commandCalls = APIGatewayMock.commandCalls(UpdateApiMappingCommand, expectedParams, true);

      expect(commandCalls.length).to.equal(1);
      expect(consoleOutput[0]).to.contains("V2 - Updated API mapping to");
    });

    it("update http base path mapping", async () => {
      const APIGatewayMock = mockClient(ApiGatewayV2Client);
      APIGatewayMock.on(UpdateApiMappingCommand).resolves(null);

      const apiGatewayV2Wrapper = new APIGatewayV2Wrapper();
      const dc = new DomainConfig(getDomainConfig({
        domainName: "test_domain",
        basePath: "test_basepath",
        apiId: "test_rest_api_id",
        apiType: Globals.apiTypes.http
      }));
      dc.apiMapping = {
        apiId: "old_api_id",
        basePath: "old_basepath",
        stage: "test",
        apiMappingId: null
      };

      await apiGatewayV2Wrapper.updateBasePathMapping(dc);

      const expectedParams = {
        ApiId: dc.apiId,
        ApiMappingId: dc.apiMapping.apiMappingId,
        ApiMappingKey: dc.basePath,
        DomainName: dc.givenDomainName,
        Stage: dc.stage
      };
      const commandCalls = APIGatewayMock.commandCalls(UpdateApiMappingCommand, expectedParams, true);

      expect(commandCalls.length).to.equal(1);
      expect(consoleOutput[0]).to.contains("V2 - Updated API mapping to");
    });

    it("update base path mapping failure", async () => {
      const APIGatewayMock = mockClient(ApiGatewayV2Client);
      APIGatewayMock.on(UpdateApiMappingCommand).rejects();

      const apiGatewayV2Wrapper = new APIGatewayV2Wrapper();
      const dc = new DomainConfig(getDomainConfig({
        domainName: "test_domain",
        basePath: "test_basepath",
        apiId: "test_rest_api_id"
      }));
      dc.apiMapping = {
        apiId: "old_api_id",
        basePath: "old_basepath",
        stage: "test",
        apiMappingId: null
      };

      let errored = false;
      try {
        await apiGatewayV2Wrapper.updateBasePathMapping(dc);
      } catch (err) {
        errored = true;
        expect(err.message).to.contains("V2 - Unable to update base path mapping for");
      }
      expect(errored).to.equal(true);
    });

    it("delete base path mapping", async () => {
      const APIGatewayMock = mockClient(ApiGatewayV2Client);
      APIGatewayMock.on(DeleteApiMappingCommand).resolves(null);

      const apiGatewayV2Wrapper = new APIGatewayV2Wrapper();
      const dc = new DomainConfig(getDomainConfig({
        domainName: "test_domain",
        basePath: "test_basepath",
        apiId: "test_rest_api_id"
      }));
      dc.apiMapping = {
        apiId: "old_api_id",
        basePath: "old_basepath",
        stage: "test",
        apiMappingId: "old_api_id"
      };

      await apiGatewayV2Wrapper.deleteBasePathMapping(dc);

      const expectedParams = {
        ApiMappingId: dc.apiMapping.apiMappingId,
        DomainName: dc.givenDomainName
      };
      const commandCalls = APIGatewayMock.commandCalls(DeleteApiMappingCommand, expectedParams, true);

      expect(commandCalls.length).to.equal(1);
      expect(consoleOutput[0]).to.contains("V2 - Removed API Mapping with id");
    });

    it("delete base path mapping failure", async () => {
      const APIGatewayMock = mockClient(ApiGatewayV2Client);
      APIGatewayMock.on(DeleteApiMappingCommand).rejects();

      const apiGatewayV2Wrapper = new APIGatewayV2Wrapper();
      const dc = new DomainConfig(getDomainConfig({
        domainName: "test_domain",
        basePath: "test_basepath",
        apiId: "test_rest_api_id"
      }));
      dc.apiMapping = {
        apiId: "old_api_id",
        basePath: "old_basepath",
        stage: "test",
        apiMappingId: null
      };

      let errored = false;
      try {
        await apiGatewayV2Wrapper.deleteBasePathMapping(dc);
      } catch (err) {
        errored = true;
        expect(err.message).to.contains("V2 - Unable to remove base path mapping for");
      }
      expect(errored).to.equal(true);
    });
  });
});

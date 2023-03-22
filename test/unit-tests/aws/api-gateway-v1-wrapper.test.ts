import {mockClient} from "aws-sdk-client-mock";
import {
    APIGatewayClient, CreateBasePathMappingCommand,
    CreateDomainNameCommand, DeleteBasePathMappingCommand,
    DeleteDomainNameCommand, GetBasePathMappingsCommand,
    GetDomainNameCommand, UpdateBasePathMappingCommand
} from "@aws-sdk/client-api-gateway";
import {consoleOutput, expect, getDomainConfig} from "../base";
import Globals from "../../../src/globals";
import DomainConfig = require("../../../src/models/domain-config");
import APIGatewayV1Wrapper = require("../../../src/aws/api-gateway-v1-wrapper");
import DomainInfo = require("../../../src/models/domain-info");
import ApiGatewayMap = require("../../../src/models/api-gateway-map");


describe("API Gateway V1 wrapper checks", () => {
    beforeEach(() => {
        consoleOutput.length = 0;
    });

    it("Initialization", async () => {
        const apiGatewayV1Wrapper = new APIGatewayV1Wrapper();
        const actualResult = await apiGatewayV1Wrapper.apiGateway.config.region();
        expect(actualResult).to.equal(Globals.currentRegion);
    });

    describe("Custom domain", () => {
        it("create custom domain edge", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(CreateDomainNameCommand).resolves({
                distributionDomainName: "foo",
                securityPolicy: "TLS_1_0"
            });

            const apiGatewayV1Wrapper = new APIGatewayV1Wrapper();
            const dc = new DomainConfig(getDomainConfig({
                domainName: "test_domain",
                basePath: "test_basepath",
                endpointType: Globals.endpointTypes.edge,
                securityPolicy: "tls_1_0",
                certificateArn: "test_arn"
            }));

            const actualResult = await apiGatewayV1Wrapper.createCustomDomain(dc);
            const expectedResult = new DomainInfo({
                distributionDomainName: "foo",
                securityPolicy: "TLS_1_0"
            });

            expect(actualResult).to.eql(expectedResult);

            const expectedParams = {
                domainName: dc.givenDomainName,
                endpointConfiguration: {
                    types: [dc.endpointType],
                },
                securityPolicy: dc.securityPolicy,
                tags: {
                    ...Globals.serverless.service.provider.stackTags,
                    ...Globals.serverless.service.provider.tags,
                },
                certificateArn: dc.certificateArn
            }
            const commandCalls = APIGatewayMock.commandCalls(CreateDomainNameCommand, expectedParams, true);

            expect(commandCalls.length).to.equal(1);
        });

        it("create custom domain regional", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(CreateDomainNameCommand).resolves({
                distributionDomainName: "foo",
                securityPolicy: "TLS_1_0"
            });

            const apiGatewayV1Wrapper = new APIGatewayV1Wrapper();
            const dc = new DomainConfig(getDomainConfig({
                domainName: "test_domain",
                basePath: "test_basepath",
                endpointType: Globals.endpointTypes.regional,
                securityPolicy: "tls_1_0",
                certificateArn: "test_arn"
            }));

            const actualResult = await apiGatewayV1Wrapper.createCustomDomain(dc);
            const expectedResult = new DomainInfo({
                distributionDomainName: "foo",
                securityPolicy: "TLS_1_0"
            });

            expect(actualResult).to.eql(expectedResult);

            const expectedParams = {
                domainName: dc.givenDomainName,
                endpointConfiguration: {
                    types: [dc.endpointType],
                },
                securityPolicy: dc.securityPolicy,
                tags: {
                    ...Globals.serverless.service.provider.stackTags,
                    ...Globals.serverless.service.provider.tags,
                },
                regionalCertificateArn: dc.certificateArn
            }
            const commandCalls = APIGatewayMock.commandCalls(CreateDomainNameCommand, expectedParams, true);

            expect(commandCalls.length).to.equal(1);
        });

        it("create custom domain with mutual TLS authentication", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(CreateDomainNameCommand).resolves({
                distributionDomainName: "foo",
                securityPolicy: "TLS_1_0"
            });

            const apiGatewayV1Wrapper = new APIGatewayV1Wrapper();
            const dc = new DomainConfig(getDomainConfig({
                domainName: "test_domain",
                basePath: "test_basepath",
                endpointType: Globals.endpointTypes.regional,
                securityPolicy: "tls_1_0",
                certificateArn: "test_arn",
                tlsTruststoreUri: "s3://bucket-name/key-name",
                tlsTruststoreVersion: "test_version"
            }));
            const actualResult = await apiGatewayV1Wrapper.createCustomDomain(dc);
            const expectedResult = new DomainInfo({
                distributionDomainName: "foo",
                securityPolicy: "TLS_1_0"
            });

            expect(actualResult).to.eql(expectedResult);

            const expectedParams = {
                domainName: dc.givenDomainName,
                endpointConfiguration: {
                    types: [dc.endpointType],
                },
                securityPolicy: dc.securityPolicy,
                tags: {
                    ...Globals.serverless.service.provider.stackTags,
                    ...Globals.serverless.service.provider.tags,
                },
                regionalCertificateArn: dc.certificateArn,
                mutualTlsAuthentication: {
                    truststoreUri: dc.tlsTruststoreUri,
                    truststoreVersion: dc.tlsTruststoreVersion
                }
            }
            const commandCalls = APIGatewayMock.commandCalls(CreateDomainNameCommand, expectedParams, true);

            expect(commandCalls.length).to.equal(1);
        });

        it("create custom domain failure", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(CreateDomainNameCommand).rejects();

            const apiGatewayV1Wrapper = new APIGatewayV1Wrapper();
            const dc = new DomainConfig(getDomainConfig({
                domainName: "test_domain",
                basePath: "test_basepath",
                endpointType: Globals.endpointTypes.regional,
                securityPolicy: "tls_1_0",
                certificateArn: "test_arn",
            }));

            let errored = false;
            try {
                await apiGatewayV1Wrapper.createCustomDomain(dc);
            } catch (err) {
                errored = true;
                expect(err.message).to.contains("V1 - Failed to create custom domain");
            }
            expect(errored).to.equal(true);
        });

        it("get custom domain", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(GetDomainNameCommand).resolves({
                domainName: "test_domain",
                regionalHostedZoneId: "test_id"
            });

            const apiGatewayV1Wrapper = new APIGatewayV1Wrapper();
            const dc = new DomainConfig(getDomainConfig({
                domainName: "test_domain",
            }));

            const actualResult = await apiGatewayV1Wrapper.getCustomDomain(dc);
            const expectedResult = new DomainInfo({
                domainName: "test_domain",
                regionalHostedZoneId: "test_id"
            });

            expect(actualResult).to.eql(expectedResult);

            const expectedParams = {
                domainName: dc.givenDomainName,
            }
            const commandCalls = APIGatewayMock.commandCalls(GetDomainNameCommand, expectedParams, true);

            expect(commandCalls.length).to.equal(1);
        });

        it("get custom domain not found", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(GetDomainNameCommand).rejects({
                "$metadata": {httpStatusCode: 404}
            });

            const apiGatewayV1Wrapper = new APIGatewayV1Wrapper();
            const dc = new DomainConfig(getDomainConfig({
                domainName: "test_domain",
            }));

            let errored = false;
            try {
                await apiGatewayV1Wrapper.getCustomDomain(dc);
            } catch (err) {
                errored = true;
            }
            expect(errored).to.equal(false);
            expect(consoleOutput[0]).to.contains("\'test_domain\' does not exist.");
        });

        it("get custom domain failure", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(GetDomainNameCommand).rejects({
                "$metadata": {httpStatusCode: 400}
            });

            const apiGatewayV1Wrapper = new APIGatewayV1Wrapper();
            const dc = new DomainConfig(getDomainConfig({
                domainName: "test_domain",
            }));

            let errored = false;
            try {
                await apiGatewayV1Wrapper.getCustomDomain(dc);
            } catch (err) {
                errored = true;
                expect(err.message).to.contains("V1 - Unable to fetch information about");
            }
            expect(errored).to.equal(true);
        });

        it("delete custom domain", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(DeleteDomainNameCommand).resolves(null);

            const apiGatewayV1Wrapper = new APIGatewayV1Wrapper();
            const dc = new DomainConfig(getDomainConfig({
                domainName: "test_domain",
            }));

            await apiGatewayV1Wrapper.deleteCustomDomain(dc);

            const expectedParams = {
                domainName: dc.givenDomainName,
            }
            const commandCalls = APIGatewayMock.commandCalls(DeleteDomainNameCommand, expectedParams, true);

            expect(commandCalls.length).to.equal(1);
        });

        it("delete custom domain failure", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(DeleteDomainNameCommand).rejects();

            const apiGatewayV1Wrapper = new APIGatewayV1Wrapper();
            const dc = new DomainConfig(getDomainConfig({
                domainName: "test_domain",
            }));

            let errored = false;
            try {
                await apiGatewayV1Wrapper.deleteCustomDomain(dc);
            } catch (err) {
                errored = true;
                expect(err.message).to.contains("V1 - Failed to delete custom domain");
            }
            expect(errored).to.equal(true);
        });
    });

    describe("Base path", () => {
        it("create base path mapping", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(CreateBasePathMappingCommand).resolves(null);

            const apiGatewayV1Wrapper = new APIGatewayV1Wrapper();
            const dc = new DomainConfig(getDomainConfig({
                domainName: "test_domain",
                basePath: "test_basepath",
                apiId: "test_rest_api_id",
            }));

            await apiGatewayV1Wrapper.createBasePathMapping(dc);

            const expectedParams = {
                basePath: dc.basePath,
                domainName: dc.givenDomainName,
                restApiId: dc.apiId,
                stage: dc.baseStage,
            }
            const commandCalls = APIGatewayMock.commandCalls(CreateBasePathMappingCommand, expectedParams, true);

            expect(commandCalls.length).to.equal(1);
            expect(consoleOutput[0]).to.contains("V1 - Created API mapping");
        });

        it("create base path mapping failure", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(CreateBasePathMappingCommand).rejects();

            const apiGatewayV1Wrapper = new APIGatewayV1Wrapper();
            const dc = new DomainConfig(getDomainConfig({
                domainName: "test_domain",
                basePath: "test_basepath",
                apiId: "test_rest_api_id",
            }));

            let errored = false;
            try {
                await apiGatewayV1Wrapper.createBasePathMapping(dc);
            } catch (err) {
                errored = true;
                expect(err.message).to.contains("Unable to create base path mapping for");
            }
            expect(errored).to.equal(true);
        });

        it("get base path mapping", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(GetBasePathMappingsCommand).resolves({
                items: [{
                    restApiId: "test_rest_api_id",
                    basePath: "test",
                    stage: "test"
                }]
            });

            const apiGatewayV1Wrapper = new APIGatewayV1Wrapper();
            const dc = new DomainConfig(getDomainConfig({
                domainName: "test_domain"
            }));

            const actualResult = await apiGatewayV1Wrapper.getBasePathMappings(dc);
            const expectedResult = [
                new ApiGatewayMap("test_rest_api_id", "test", "test", null)
            ]

            expect(actualResult).to.eql(expectedResult);

            const expectedParams = {
                domainName: dc.givenDomainName,
            }
            const commandCalls = APIGatewayMock.commandCalls(GetBasePathMappingsCommand, expectedParams, true);

            expect(commandCalls.length).to.equal(1);
        });

        it("get base path mapping failure", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(GetBasePathMappingsCommand).rejects();

            const apiGatewayV1Wrapper = new APIGatewayV1Wrapper();
            const dc = new DomainConfig(getDomainConfig({
                domainName: "test_domain"
            }));

            let errored = false;
            try {
                await apiGatewayV1Wrapper.getBasePathMappings(dc);
            } catch (err) {
                errored = true;
                expect(err.message).to.contains("Unable to get Base Path Mappings");
            }
            expect(errored).to.equal(true);
        });

        it("update base path mapping", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(UpdateBasePathMappingCommand).resolves(null);

            const apiGatewayV1Wrapper = new APIGatewayV1Wrapper();
            const dc = new DomainConfig(getDomainConfig({
                domainName: "test_domain",
                basePath: "test_basepath",
                apiId: "test_rest_api_id",
            }));
            dc.apiMapping = {
                apiId: "old_api_id",
                basePath: "old_basepath",
                stage: "test",
                apiMappingId: null
            };

            await apiGatewayV1Wrapper.updateBasePathMapping(dc);

            const expectedParams = {
                basePath: dc.apiMapping.basePath,
                domainName: dc.givenDomainName,
                patchOperations: [{
                    op: "replace",
                    path: "/basePath",
                    value: dc.basePath,
                }]
            }
            const commandCalls = APIGatewayMock.commandCalls(UpdateBasePathMappingCommand, expectedParams, true);

            expect(commandCalls.length).to.equal(1);
            expect(consoleOutput[0]).to.contains("V1 - Updated API mapping from");
        });

        it("update base path mapping failure", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(UpdateBasePathMappingCommand).rejects();

            const apiGatewayV1Wrapper = new APIGatewayV1Wrapper();
            const dc = new DomainConfig(getDomainConfig({
                domainName: "test_domain",
                basePath: "test_basepath",
                apiId: "test_rest_api_id",
            }));
            dc.apiMapping = {
                apiId: "old_api_id",
                basePath: "old_basepath",
                stage: "test",
                apiMappingId: null
            };

            let errored = false;
            try {
                await apiGatewayV1Wrapper.updateBasePathMapping(dc);
            } catch (err) {
                errored = true;
                expect(err.message).to.contains("V1 - Unable to update base path mapping for");
            }
            expect(errored).to.equal(true);
        });

        it("delete base path mapping", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(DeleteBasePathMappingCommand).resolves(null);

            const apiGatewayV1Wrapper = new APIGatewayV1Wrapper();
            const dc = new DomainConfig(getDomainConfig({
                domainName: "test_domain",
                basePath: "test_basepath",
                apiId: "test_rest_api_id",
            }));
            dc.apiMapping = {
                apiId: "old_api_id",
                basePath: "old_basepath",
                stage: "test",
                apiMappingId: null
            };

            await apiGatewayV1Wrapper.deleteBasePathMapping(dc);

            const expectedParams = {
                basePath: dc.apiMapping.basePath,
                domainName: dc.givenDomainName,
            }
            const commandCalls = APIGatewayMock.commandCalls(DeleteBasePathMappingCommand, expectedParams, true);

            expect(commandCalls.length).to.equal(1);
            expect(consoleOutput[0]).to.contains("V1 - Removed");
        });

        it("delete base path mapping failure", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(DeleteBasePathMappingCommand).rejects();

            const apiGatewayV1Wrapper = new APIGatewayV1Wrapper();
            const dc = new DomainConfig(getDomainConfig({
                domainName: "test_domain",
                basePath: "test_basepath",
                apiId: "test_rest_api_id",
            }));
            dc.apiMapping = {
                apiId: "old_api_id",
                basePath: "old_basepath",
                stage: "test",
                apiMappingId: null
            };

            let errored = false;
            try {
                await apiGatewayV1Wrapper.deleteBasePathMapping(dc);
            } catch (err) {
                errored = true;
                expect(err.message).to.contains("V1 - Unable to remove base path mapping for");
            }
            expect(errored).to.equal(true);
        });
    });
});

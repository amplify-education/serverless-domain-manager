import chai = require("chai");
import spies = require("chai-spies");
import DomainConfig = require("../../src/models/domain-config");
import DomainInfo = require("../../src/models/domain-info");
import ServerlessCustomDomain = require("../../src/index");
import Route53Wrapper = require("../../src/aws/route53-wrapper");
import ACMWrapper = require("../../src/aws/acm-wrapper");
import S3Wrapper = require("../../src/aws/s3-wrapper");
import "mocha";
import Globals from "../../src/globals";
import {ServerlessOptions} from "../../src/types";
import Logging from "../../src/logging";
import {mockClient} from "aws-sdk-client-mock";
import {
    APIGatewayClient,
    CreateBasePathMappingCommand,
    CreateDomainNameCommand as CreateDomainNameCommandV1,
    DeleteBasePathMappingCommand,
    DeleteDomainNameCommand as DeleteDomainNameCommandV1,
    GetBasePathMappingsCommand,
    GetDomainNameCommand as GetDomainNameCommandV1,
    UpdateBasePathMappingCommand
} from "@aws-sdk/client-api-gateway";
import {ChangeResourceRecordSetsCommand, ListHostedZonesCommand, Route53Client} from "@aws-sdk/client-route-53";
import {
    ApiGatewayV2Client,
    CreateApiMappingCommand,
    CreateDomainNameCommand as CreateDomainNameCommandV2, DeleteApiCommand, DeleteApiMappingCommand,
    DeleteDomainNameCommand as DeleteDomainNameCommandV2,
    GetApiMappingsCommand,
    GetDomainNameCommand as GetDomainNameCommandV2,
    UpdateApiMappingCommand
} from "@aws-sdk/client-apigatewayv2";
import {
    CloudFormationClient,
    DescribeStackResourceCommand,
    DescribeStacksCommand,
    ResourceStatus,
    StackStatus
} from "@aws-sdk/client-cloudformation";
import {HeadObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {ACMClient, ListCertificatesCommand} from "@aws-sdk/client-acm";

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

const constructPlugin = (customDomainOptions, options?: ServerlessOptions, multiple: boolean = false) => {
    const custom = {
        allowPathMatching: customDomainOptions.allowPathMatching,
        apiType: customDomainOptions.apiType,
        autoDomain: customDomainOptions.autoDomain,
        autoDomainWaitFor: customDomainOptions.autoDomainWaitFor,
        basePath: customDomainOptions.basePath,
        certificateArn: customDomainOptions.certificateArn,
        certificateName: customDomainOptions.certificateName,
        createRoute53Record: customDomainOptions.createRoute53Record,
        createRoute53IPv6Record: customDomainOptions.createRoute53IPv6Record,
        domainName: customDomainOptions.domainName,
        enabled: customDomainOptions.enabled,
        endpointType: customDomainOptions.endpointType,
        tlsTruststoreUri: customDomainOptions.tlsTruststoreUri,
        tlsTruststoreVersion: customDomainOptions.tlsTruststoreVersion,
        hostedZoneId: customDomainOptions.hostedZoneId,
        hostedZonePrivate: customDomainOptions.hostedZonePrivate,
        splitHorizonDns: customDomainOptions.splitHorizonDns,
        route53Profile: customDomainOptions.route53Profile,
        route53Region: customDomainOptions.route53Region,
        preserveExternalPathMappings: customDomainOptions.preserveExternalPathMappings,
        securityPolicy: customDomainOptions.securityPolicy,
        stage: customDomainOptions.stage,
        route53Params: customDomainOptions.route53Params
    };

    const serverless = {
        cli: {
            log(str: string) {
                consoleOutput.push(str);
            },
            consoleLog(str: any) {
                consoleOutput.push(str);
            },
        },
        providers: {
            aws: {
                getRegion: () => "eu-west-1",
            },
        },
        service: {
            custom: {
                customDomain: multiple ? undefined : custom,
                customDomains: multiple ? [custom] : undefined,
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
                stage: null,
                stackTags: {
                    test: "test"
                },
                tags: {
                    test2: "test2"
                }
            },
            service: "test",
        },
    };
    const defaultOptions = {
        stage: "test",
    };
    return new ServerlessCustomDomain(serverless, options || defaultOptions);
};

Logging.cliLog = (prefix: string, message: string) => {
    consoleOutput.push(message);
};

describe("Custom Domain Plugin", () => {
    it.skip("Checks aws config", () => {
        const plugin = constructPlugin({});

        plugin.initAWSResources();

        const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
        const returnedCreds = plugin.getApiGateway(dc).apiGateway.config.credentials;

        expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
        expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
    });

    describe("custom route53 profile", () => {
        it.skip("uses the provided profile for route53", () => {
            const APIGatewayMock = mockClient(APIGatewayClient);

            const route53ProfileConfig = {
                route53Profile: "testroute53profile",
                route53Region: "area-53-zone",
            };
            const plugin = constructPlugin(route53ProfileConfig);

            plugin.initAWSResources();
            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            const spy = chai.spy.on(Route53Wrapper, "fromIni");
            const route53Wrapper = new Route53Wrapper(dc.route53Profile, dc.route53Region);


            expect(spy).to.be.called.with({
                profile: route53ProfileConfig.route53Profile
            })

            APIGatewayMock.call(1);
            expect(route53Wrapper.route53.config.credentials).to.equal(route53ProfileConfig.route53Profile);
            expect(route53Wrapper.route53.config.region).to.equal(route53ProfileConfig.route53Region);
        });
    });

    describe("Domain Endpoint types", () => {
        it("Unsupported endpoint types throw exception", () => {
            const plugin = constructPlugin({endpointType: "notSupported"});

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
            const plugin = constructPlugin({apiType: "notSupported"});

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
            const plugin = constructPlugin({apiType: "http"});

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
            const plugin = constructPlugin({apiType: "websocket"});

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
            const plugin = constructPlugin({
                endpointType: "edge",
            });

            let errored = false;
            try {
                plugin.initializeVariables();
                plugin.validateDomainConfigs();
            } catch (err) {
                errored = true;
            }
            expect(errored).to.equal(false);
        });

    });

    describe("Set Domain Name and Base Path", () => {
        it("Creates basepath mapping for edge REST api", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(CreateBasePathMappingCommand).resolves(null);

            const plugin = constructPlugin({
                basePath: "test_basepath",
                domainName: "test_domain",
                endpointType: "EDGE",
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            dc.apiId = "test_rest_api_id";


            const apiGateway = plugin.getApiGateway(dc);
            await apiGateway.createBasePathMapping(dc);

            APIGatewayMock.commandCalls(CreateBasePathMappingCommand, {
                basePath: "test_basepath",
                domainName: "test_domain",
                restApiId: "test_rest_api_id",
                stage: "test",
            });
        });

        it("Creates basepath mapping for regional tls 1.0 REST api", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(CreateBasePathMappingCommand).resolves(null);

            const plugin = constructPlugin({
                basePath: "test_basepath",
                domainName: "test_domain",
                endpointType: "REGIONAL",
                securityPolicy: "tls_1_0",
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            dc.apiId = "test_rest_api_id";

            const apiGateway = plugin.getApiGateway(dc);
            await apiGateway.createBasePathMapping(dc);

            APIGatewayMock.commandCalls(CreateBasePathMappingCommand, {
                basePath: "test_basepath",
                domainName: "test_domain",
                restApiId: "test_rest_api_id",
                stage: "test",
            });
        });

        it("Creates basepath mapping for regional tls 1.2 REST api", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(CreateBasePathMappingCommand).resolves(null);

            const plugin = constructPlugin({
                basePath: "test_basepath",
                domainName: "test_domain",
                endpointType: "REGIONAL",
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            dc.apiId = "test_rest_api_id";

            const apiGateway = plugin.getApiGateway(dc);
            await apiGateway.createBasePathMapping(dc);
            APIGatewayMock.commandCalls(CreateBasePathMappingCommand, {
                domainName: "test_domain",
                restApiId: "test_rest_api_id",
                basePath: "test_basepath",
                stage: "test",
            });
        });

        it("Creates basepath mapping for regional tls 1.2 REST api with '/' in base path", async () => {
            const ApiGatewayV2Mock = mockClient(ApiGatewayV2Client);
            ApiGatewayV2Mock.on(CreateApiMappingCommand).resolves(null);

            const plugin = constructPlugin({
                apiType: "rest",
                basePath: "test/basepath",
                domainName: "test_domain",
                endpointType: "REGIONAL",
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            dc.apiId = "test_rest_api_id";

            const apiGateway = plugin.getApiGateway(dc);
            await apiGateway.createBasePathMapping(dc);

            ApiGatewayV2Mock.commandCalls(CreateApiMappingCommand, {
                ApiId: "test_rest_api_id",
                ApiMappingKey: "test/basepath",
                DomainName: "test_domain",
                Stage: "test",
            });
        });

        it("Creates basepath mapping for regional HTTP/Websocket api", async () => {
            const ApiGatewayV2Mock = mockClient(ApiGatewayV2Client);
            ApiGatewayV2Mock.on(CreateApiMappingCommand).resolves(null);

            const plugin = constructPlugin({
                apiType: "http",
                basePath: "test_basepath",
                domainName: "test_domain",
                endpointType: "REGIONAL",
            }, {
                stage: null
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.apiId = "test_rest_api_id";

            const apiGateway = plugin.getApiGateway(dc);
            await apiGateway.createBasePathMapping(dc);
            ApiGatewayV2Mock.commandCalls(CreateApiMappingCommand, {
                ApiId: "test_rest_api_id",
                ApiMappingKey: "test_basepath",
                DomainName: "test_domain",
                Stage: "$default",
            });
        });

        it("Updates basepath mapping for a edge REST api", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(UpdateBasePathMappingCommand).resolves(null);

            const plugin = constructPlugin({
                basePath: "test_basepath",
                domainName: "test_domain",
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.apiMapping = {
                apiId: "",
                basePath: "old_basepath",
                stage: "test",
                apiMappingId: null
            };

            const apiGateway = plugin.getApiGateway(dc);
            await apiGateway.updateBasePathMapping(dc);
            APIGatewayMock.commandCalls(UpdateBasePathMappingCommand, {
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
            const ApiGatewayV2Mock = mockClient(ApiGatewayV2Client);
            ApiGatewayV2Mock.on(UpdateApiMappingCommand).resolves(null);

            const plugin = constructPlugin({
                apiType: "http",
                basePath: "test_basepath",
                domainName: "test_domain",
                endpointType: "REGIONAL",
            }, {
                stage: null
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            dc.apiId = "test_api_id";
            dc.apiMapping = {
                apiId: "",
                basePath: "",
                stage: "",
                apiMappingId: "test_mapping_id"
            };
            dc.domainInfo = new DomainInfo({
                DomainNameConfigurations: [{
                    ApiGatewayDomainName: "fake_dist_name",
                    HostedZoneId: "fake_zone_id",
                    SecurityPolicy: "TLS_1_2",
                }],
            });

            const apiGateway = plugin.getApiGateway(dc);
            await apiGateway.updateBasePathMapping(dc);
            ApiGatewayV2Mock.commandCalls(UpdateApiMappingCommand, {
                ApiId: "test_api_id",
                ApiMappingId: "test_mapping_id",
                ApiMappingKey: dc.basePath,
                DomainName: dc.givenDomainName,
                Stage: "$default",
            });
        });

        it("Remove basepath mappings", async () => {
            const CloudFormationMock = mockClient(CloudFormationClient);
            CloudFormationMock.on(DescribeStackResourceCommand).resolves({
                StackResourceDetail: {
                    LogicalResourceId: "ApiGatewayRestApi",
                    PhysicalResourceId: "test_rest_api_id",
                    ResourceType: "",
                    LastUpdatedTimestamp: null,
                    ResourceStatus: ResourceStatus.CREATE_COMPLETE,
                },
            });

            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(GetBasePathMappingsCommand).resolves({
                items: [{
                    restApiId: "test_rest_api_id",
                    basePath: "test",
                    stage: "test"
                }]
            });
            APIGatewayMock.on(DeleteBasePathMappingCommand).resolves(null);

            const ApiGatewayV2Mock = mockClient(ApiGatewayV2Client);
            ApiGatewayV2Mock.on(GetApiMappingsCommand).resolves({
                Items: [{
                    ApiId: "test_rest_api_id",
                    ApiMappingKey: "test",
                    Stage: "test",
                    ApiMappingId: "test_id"
                },],
            });
            ApiGatewayV2Mock.on(DeleteApiMappingCommand).resolves(null);

            const plugin = constructPlugin({
                basePath: "test_basepath",
                domainName: "test_domain",
                restApiId: "test_rest_api_id",
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            await plugin.removeBasePathMappings();
            APIGatewayMock.commandCalls(DeleteBasePathMappingCommand, {
                basePath: "test",
                domainName: "test_domain",
            });

            plugin.domains[0].apiType = Globals.apiTypes.http;
            await plugin.removeBasePathMappings();
            ApiGatewayV2Mock.commandCalls(DeleteApiMappingCommand, {
                ApiMappingId: "test_id",
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
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(CreateBasePathMappingCommand).resolves(null);

            const plugin = constructPlugin({
                basePath: "",
                domainName: "test_domain",
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.apiId = "test_rest_api_id";

            const apiGateway = plugin.getApiGateway(dc);
            await apiGateway.createBasePathMapping(dc);
            const expectedParams = {
                basePath: "(none)",
                domainName: "test_domain",
                restApiId: "test_rest_api_id",
                stage: "test",
            };
            APIGatewayMock.commandCalls(CreateBasePathMappingCommand, expectedParams);
        });

        it("(none) is added if no value is given for basepath (null)", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(CreateBasePathMappingCommand).resolves(null);

            const plugin = constructPlugin({
                basePath: null,
                domainName: "test_domain",
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.apiId = "test_rest_api_id";

            const apiGateway = plugin.getApiGateway(dc);
            await apiGateway.createBasePathMapping(dc);

            const expectedParams = {
                basePath: "(none)",
                domainName: "test_domain",
                restApiId: "test_rest_api_id",
                stage: "test",
            };
            APIGatewayMock.commandCalls(CreateBasePathMappingCommand, expectedParams);
        });

        it("(none) is added if basepath attribute is missing (undefined)", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(CreateBasePathMappingCommand).resolves(null);

            const plugin = constructPlugin({
                domainName: "test_domain",
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.apiId = "test_rest_api_id";

            const apiGateway = plugin.getApiGateway(dc);
            await apiGateway.createBasePathMapping(dc);

            const expectedParams = {
                basePath: "(none)",
                domainName: "test_domain",
                restApiId: "test_rest_api_id",
                stage: "test",
            };
            APIGatewayMock.commandCalls(CreateBasePathMappingCommand, expectedParams);
        });

        it("stage was not given", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(CreateBasePathMappingCommand).resolves(null);

            const plugin = constructPlugin({
                domainName: "test_domain",
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.apiId = "test_rest_api_id";

            const apiGateway = plugin.getApiGateway(dc);
            await apiGateway.createBasePathMapping(dc);

            const expectedParams = {
                basePath: "(none)",
                domainName: "test_domain",
                restApiId: "test_rest_api_id",
                stage: "test",
            };
            APIGatewayMock.commandCalls(CreateBasePathMappingCommand, expectedParams);
        });
    });

    describe("Check Mutual TLS certificate existance in S3", () => {
        it("Should check existance of certificate in S3", async () => {
            const S3Mock = mockClient(S3Client);
            S3Mock.on(HeadObjectCommand).resolves(null);

            const options = {
                domainName: "test_domain",
                endpointType: "regional",
                tlsTruststoreUri: 's3://test_bucket/test_key'
            };
            const plugin = constructPlugin(options);
            plugin.initializeVariables();

            const s3Wrapper = new S3Wrapper();
            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            await s3Wrapper.assertTlsCertObjectExists(dc);
            const expectedParams = {
                Bucket: 'test_bucket',
                Key: 'test_key'
            }
            S3Mock.commandCalls(HeadObjectCommand, expectedParams);
        });

        it("Should check existance of a concrete certificate version in S3", async () => {
            const S3Mock = mockClient(S3Client);
            S3Mock.on(HeadObjectCommand).resolves(null);

            const options = {
                domainName: "test_domain",
                endpointType: "regional",
                tlsTruststoreUri: 's3://test_bucket/test_key',
                tlsTruststoreVersion: 'test_version'
            };
            const plugin = constructPlugin(options);
            plugin.initializeVariables();

            const s3Wrapper = new S3Wrapper();
            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            await s3Wrapper.assertTlsCertObjectExists(dc);
            const expectedParams = {
                Bucket: 'test_bucket',
                Key: 'test_key',
                VersionId: 'test_version'
            }
            S3Mock.commandCalls(HeadObjectCommand, expectedParams);
        });

        it('should fail when the mutual TLS certificate is not stored in S3', async () => {
            const S3Mock = mockClient(S3Client);
            S3Mock.on(HeadObjectCommand).rejects({Code: "404", "$metadata": {httpStatusCode: 404}});

            const options = {
                domainName: "test_domain",
                endpointType: "regional",
                tlsTruststoreUri: 's3://test_bucket/test_key'
            };
            const plugin = constructPlugin(options);
            plugin.initializeVariables();

            const s3Wrapper = new S3Wrapper();
            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            try {
                await s3Wrapper.assertTlsCertObjectExists(dc);
            } catch (e) {
                expect(e.message).to.contain('Could not head S3 object');
            }
        });

        it("Should not fail due to lack of S3 permissions", async () => {
            const S3Mock = mockClient(S3Client);
            S3Mock.on(HeadObjectCommand).resolves(null);

            const options = {
                domainName: "test_domain",
                endpointType: "regional",
                tlsTruststoreUri: 's3://test_bucket/test_key'
            };
            const plugin = constructPlugin(options);
            plugin.initializeVariables();

            const s3Wrapper = new S3Wrapper();
            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            let err;
            try {
                await s3Wrapper.assertTlsCertObjectExists(dc);
            } catch (e) {
                err = e;
            } finally {
                expect(err).to.equal(undefined);
            }
        });
    });

    describe("Create a New Domain Name", () => {
        it("Get a given certificate by given domain name ", async () => {
            const ACMCMock = mockClient(ACMClient);
            ACMCMock.on(ListCertificatesCommand).resolves(certTestData);

            const options = {
                domainName: "test_domain",
                endpointType: "REGIONAL",
            };
            const plugin = constructPlugin(options);
            plugin.initializeVariables();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            const acm = new ACMWrapper(dc.endpointType);
            const result = await acm.getCertArn(dc);

            expect(result).to.equal("test_arn");
        });

        it("Get a given certificate name", async () => {
            const ACMCMock = mockClient(ACMClient);
            ACMCMock.on(ListCertificatesCommand).resolves(certTestData);

            const plugin = constructPlugin({certificateName: "cert_name"});
            plugin.initializeVariables();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            const acm = new ACMWrapper(dc.endpointType);
            const result = await acm.getCertArn(dc);

            expect(result).to.equal("test_given_cert_name");
        });

        it("Get a given certificate by alt name with exact match", async () => {
            const ACMCMock = mockClient(ACMClient);
            ACMCMock.on(ListCertificatesCommand).resolves({
                CertificateSummaryList: [
                    {
                        CertificateArn: "test_nomatch",
                        DomainName: "dontmatch.com",
                    },
                    {
                        CertificateArn: "test_arn",
                        DomainName: "test.com",
                        SubjectAlternativeNameSummaries: [
                            "example.com",
                        ],
                    },
                ],
            });

            const options = {
                domainName: "example.com",
                endpointType: "REGIONAL",
            };
            const plugin = constructPlugin(options);
            plugin.initializeVariables();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            const acm = new ACMWrapper(dc.endpointType);
            const result = await acm.getCertArn(dc);

            expect(result).to.equal("test_arn");
        });

        it("Get a given certificate by alt name with subdomain", async () => {
            const ACMCMock = mockClient(ACMClient);
            ACMCMock.on(ListCertificatesCommand).resolves({
                CertificateSummaryList: [
                    {
                        CertificateArn: "test_arn",
                        DomainName: "test.com",
                        SubjectAlternativeNameSummaries: [
                            "example.com",
                        ],
                    },
                ],
            })

            const options = {
                domainName: "sub.example.com",
                endpointType: "REGIONAL",
            };
            const plugin = constructPlugin(options);
            plugin.initializeVariables();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            const acm = new ACMWrapper(dc.endpointType);
            const result = await acm.getCertArn(dc);

            expect(result).to.equal("test_arn");
        });

        it("Get a given certificate by alt name with wildcard", async () => {
            const ACMCMock = mockClient(ACMClient);
            ACMCMock.on(ListCertificatesCommand).resolves({
                CertificateSummaryList: [
                    {
                        CertificateArn: "test_arn",
                        DomainName: "test.com",
                        SubjectAlternativeNameSummaries: [
                            "*.example.com",
                        ],
                    },
                ],
            });

            const options = {
                domainName: "sub.example.com",
                endpointType: "REGIONAL",
            };
            const plugin = constructPlugin(options);
            plugin.initializeVariables();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            const acm = new ACMWrapper(dc.endpointType);
            const result = await acm.getCertArn(dc);

            expect(result).to.equal("test_arn");
        });

        it("Create a domain name", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(CreateDomainNameCommandV1).resolves({
                distributionDomainName: "foo",
                securityPolicy: "TLS_1_2"
            });

            const plugin = constructPlugin({domainName: "test_domain"});
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.certificateArn = "fake_cert";

            const apiGateway = plugin.getApiGateway(dc);
            const domainInfo = await apiGateway.createCustomDomain(dc);

            expect(domainInfo.domainName).to.equal("foo");
            expect(domainInfo.securityPolicy).to.equal("TLS_1_2");
        });

        it("Create an HTTP domain name", async () => {
            const ApiGatewayV2Mock = mockClient(ApiGatewayV2Client);
            ApiGatewayV2Mock.on(CreateDomainNameCommandV2).resolves({
                DomainName: "foo",
                DomainNameConfigurations: [{SecurityPolicy: "TLS_1_2"}]
            });

            const plugin = constructPlugin({domainName: "test_domain", apiType: "http", endpointType: "REGIONAL"});
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.certificateArn = "fake_cert";

            const apiGateway = plugin.getApiGateway(dc);
            const domainInfo = await apiGateway.createCustomDomain(dc);

            expect(domainInfo.domainName).to.equal("foo");
            expect(domainInfo.securityPolicy).to.equal("TLS_1_2");
        });

        it("Create a domain name with specific TLS version", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(CreateDomainNameCommandV1).resolves({
                distributionDomainName: "foo",
                securityPolicy: "TLS_1_2"
            });

            const plugin = constructPlugin({domainName: "test_domain", securityPolicy: "tls_1_2"});
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.certificateArn = "fake_cert";

            const apiGateway = plugin.getApiGateway(dc);
            const domainInfo = await apiGateway.createCustomDomain(dc);

            expect(domainInfo.domainName).to.equal("foo");
            expect(domainInfo.securityPolicy).to.equal("TLS_1_2");
        });

        it("Create a domain name with tags", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(CreateDomainNameCommandV1).resolves({
                distributionDomainName: "foo",
                securityPolicy: "TLS_1_2"
            });

            const plugin = constructPlugin({domainName: "test_domain"});
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            dc.certificateArn = "fake_cert";

            await plugin.getApiGateway(dc).createCustomDomain(dc);
            const expectedParams = {
                domainName: dc.givenDomainName,
                endpointConfiguration: {
                    types: [dc.endpointType],
                },
                securityPolicy: dc.securityPolicy,
                tags: {
                    ...plugin.serverless.service.provider.stackTags,
                    ...plugin.serverless.service.provider.tags,
                },
                certificateArn: dc.certificateArn
            }
            APIGatewayMock.commandCalls(CreateDomainNameCommandV1, expectedParams);
        });

        it("Create a domain name with mutual TLS authentication", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(CreateDomainNameCommandV1).resolves({});

            const ApiGatewayV2Mock = mockClient(ApiGatewayV2Client);
            ApiGatewayV2Mock.on(CreateDomainNameCommandV2).resolves({});

            const plugin = constructPlugin({
                domainName: "test_domain",
                endpointType: "regional",
                securityPolicy: "tls_1_0",
                tlsTruststoreUri: "s3://bucket-name/key-name"
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            dc.certificateArn = "fake_cert";

            await plugin.apiGatewayV1Wrapper.createCustomDomain(dc);
            const expectedParamsV1 = {
                domainName: dc.givenDomainName,
                endpointConfiguration: {
                    types: [dc.endpointType],
                },
                mutualTlsAuthentication: {
                    truststoreUri: dc.tlsTruststoreUri
                },
                securityPolicy: dc.securityPolicy,
                tags: {
                    ...plugin.serverless.service.provider.stackTags,
                    ...plugin.serverless.service.provider.tags,
                },
                regionalCertificateArn: dc.certificateArn
            }
            APIGatewayMock.commandCalls(CreateDomainNameCommandV1, expectedParamsV1);

            dc.endpointType = Globals.endpointTypes.regional;
            await plugin.apiGatewayV2Wrapper.createCustomDomain(dc);
            const expectedParamsV2 = {
                DomainName: dc.givenDomainName,
                DomainNameConfigurations: [
                    {
                        CertificateArn: dc.certificateArn,
                        EndpointType: dc.endpointType,
                        SecurityPolicy: dc.securityPolicy
                    }
                ],
                Tags: {
                    ...plugin.serverless.service.provider.stackTags,
                    ...plugin.serverless.service.provider.tags,
                },
                MutualTlsAuthentication: {TruststoreUri: dc.tlsTruststoreUri}
            }
            ApiGatewayV2Mock.commandCalls(CreateDomainNameCommandV2, expectedParamsV2);
        });

        it("Create an HTTP domain name with mutual TLS authentication", async () => {
            const ApiGatewayV2Mock = mockClient(ApiGatewayV2Client);
            ApiGatewayV2Mock.on(CreateDomainNameCommandV2).resolves({});

            const plugin = constructPlugin({
                domainName: "test_domain",
                endpointType: "regional",
                apiType: "http",
                tlsTruststoreUri: "s3://bucket-name/key-name",
                tlsTruststoreVersion: "test_version"
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            dc.certificateArn = "fake_cert";

            const apiGateway = plugin.getApiGateway(dc);
            await apiGateway.createCustomDomain(dc);
            const expectedParams = {
                DomainName: dc.givenDomainName,
                DomainNameConfigurations: [{
                    CertificateArn: dc.certificateArn,
                    EndpointType: dc.endpointType,
                    SecurityPolicy: dc.securityPolicy
                }],
                MutualTlsAuthentication: {
                    TruststoreUri: dc.tlsTruststoreUri,
                    TruststoreVersion: dc.tlsTruststoreVersion
                },
                Tags: {
                    ...plugin.serverless.service.provider.stackTags,
                    ...plugin.serverless.service.provider.tags,
                }
            }
            ApiGatewayV2Mock.commandCalls(CreateDomainNameCommandV2, expectedParams);
        });

        it("Create new A and AAAA Alias Records", async () => {
            const Route53Mock = mockClient(Route53Client);
            Route53Mock.on(ListHostedZonesCommand).resolves({
                HostedZones: [{
                    CallerReference: "",
                    Config: {PrivateZone: false},
                    Id: "test_host_id",
                    Name: "test_domain",
                }],
            });
            Route53Mock.on(ChangeResourceRecordSetsCommand).resolves(null);

            const plugin = constructPlugin({basePath: "test_basepath", domainName: "test_domain"});
            const route53Wrapper = new Route53Wrapper();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.domainInfo = new DomainInfo(
                {
                    distributionDomainName: "test_distribution_name",
                    distributionHostedZoneId: "test_id",
                },
            );

            await route53Wrapper.changeResourceRecordSet("UPSERT", dc);
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
                    Comment: `Record created by "${Globals.pluginName}"`
                },
                HostedZoneId: "test_host_id",
            };

            Route53Mock.commandCalls(ChangeResourceRecordSetsCommand, expectedParams);
        });

        it("Create new A Alias Record Only", async () => {
            const Route53Mock = mockClient(Route53Client);
            Route53Mock.on(ListHostedZonesCommand).resolves({
                HostedZones: [{
                    CallerReference: "",
                    Config: {PrivateZone: false},
                    Id: "test_host_id",
                    Name: "test_domain",
                }],
            });
            Route53Mock.on(ChangeResourceRecordSetsCommand).resolves(null);

            const plugin = constructPlugin({
                basePath: "test_basepath",
                createRoute53IPv6Record: false,
                domainName: "test_domain",
            });
            const route53Wrapper = new Route53Wrapper();
            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.domainInfo = new DomainInfo({
                distributionDomainName: "test_distribution_name",
                distributionHostedZoneId: "test_id",
            });

            await route53Wrapper.changeResourceRecordSet("UPSERT", dc);

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
                    ],
                    Comment: `Record created by "${Globals.pluginName}"`
                },
                HostedZoneId: "test_host_id",
            };
            Route53Mock.commandCalls(ChangeResourceRecordSetsCommand, expectedParams);
        });

        it("Do not create a Route53 record", async () => {
            const plugin = constructPlugin({
                createRoute53Record: false,
                domainName: "test_domain",
            });

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            const route53Wrapper = new Route53Wrapper();

            const result = await route53Wrapper.changeResourceRecordSet("UPSERT", dc);
            expect(result).to.equal(undefined);
        });

        describe("When split-horizon DNS is requested", () => {
            it("Create new A and AAAA Alias Records in each of the hosted zones with the same domain", async () => {
                const Route53Mock = mockClient(Route53Client);
                Route53Mock.on(ListHostedZonesCommand).resolves({
                    HostedZones: [{
                        CallerReference: "",
                        Config: {PrivateZone: false},
                        Name: "test_domain",
                        Id: "/hostedzone/test_host_id_0",
                    }, {
                        CallerReference: "",
                        Config: {PrivateZone: true},
                        Name: "test_domain",
                        Id: "/hostedzone/test_host_id_1",
                    }]
                });
                Route53Mock.on(ChangeResourceRecordSetsCommand).resolves(null);

                const plugin = constructPlugin({
                    basePath: "test_basepath",
                    domainName: "test_domain",
                    splitHorizonDns: true,
                });
                const route53Wrapper = new Route53Wrapper();

                const dc: DomainConfig = new DomainConfig(
                    plugin.serverless.service.custom.customDomain
                );

                dc.domainInfo = new DomainInfo({
                    distributionDomainName: "test_distribution_name",
                });

                await route53Wrapper.changeResourceRecordSet("UPSERT", dc);

                const expectedParams1 = {
                    ChangeBatch: {
                        Changes: [
                            {
                                Action: "UPSERT",
                                ResourceRecordSet: {
                                    AliasTarget: {
                                        DNSName: "test_distribution_name",
                                        EvaluateTargetHealth: false,
                                        HostedZoneId: "Z2FDTNDATAQYW2",
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
                                        HostedZoneId: "Z2FDTNDATAQYW2",
                                    },
                                    Name: "test_domain",
                                    Type: "AAAA",
                                },
                            },
                        ],
                        Comment: `Record created by "${Globals.pluginName}"`,
                    },
                    HostedZoneId: "test_host_id_0",
                };

                const expectedParams2 = {
                    ChangeBatch: {
                        Changes: [
                            {
                                Action: "UPSERT",
                                ResourceRecordSet: {
                                    AliasTarget: {
                                        DNSName: "test_distribution_name",
                                        EvaluateTargetHealth: false,
                                        HostedZoneId: "Z2FDTNDATAQYW2",
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
                                        HostedZoneId: "Z2FDTNDATAQYW2",
                                    },
                                    Name: "test_domain",
                                    Type: "AAAA",
                                },
                            },
                        ],
                        Comment: `Record created by "${Globals.pluginName}"`,
                    },
                    HostedZoneId: "test_host_id_1",
                };

                Route53Mock.commandCalls(ChangeResourceRecordSetsCommand, expectedParams1);
                Route53Mock.commandCalls(ChangeResourceRecordSetsCommand, expectedParams2);
            });
        });

        afterEach(() => {
            consoleOutput = [];
        });
    });

    describe("Gets existing basepath mappings correctly", () => {
        it("Returns current api mapping", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(GetBasePathMappingsCommand).resolves({
                items: [
                    {restApiId: "test_rest_api_id", basePath: "api", stage: "test"},
                ],
            });

            const ApiGatewayV2Mock = mockClient(ApiGatewayV2Client);
            ApiGatewayV2Mock.on(GetApiMappingsCommand).resolves({
                Items: [{ApiId: "test_rest_api_id", ApiMappingKey: "api", Stage: "test", ApiMappingId: "api_id"},],
            });

            const plugin = constructPlugin({
                apiType: Globals.apiTypes.rest,
                basePath: "api",
                domainName: "test_domain",
            });

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            dc.apiId = "test_rest_api_id";

            plugin.initializeVariables();
            plugin.initAWSResources();

            const resultV1 = await plugin.apiGatewayV1Wrapper.getBasePathMappings(dc);
            expect(resultV1[0]).to.eql({
                apiId: "test_rest_api_id",
                basePath: "api",
                stage: "test",
                apiMappingId: null,
            });

            const resultV2 = await plugin.apiGatewayV2Wrapper.getBasePathMappings(dc);
            expect(resultV2[0]).to.eql({
                apiId: "test_rest_api_id",
                basePath: "api",
                stage: "test",
                apiMappingId: "api_id",
            });
        });

        afterEach(() => {
            consoleOutput = [];
        });
    });

    describe("Gets Rest API id correctly", () => {
        it("Fetches REST API id correctly when no ApiGateway specified", async () => {
            const CloudFormationMock = mockClient(CloudFormationClient);
            CloudFormationMock.on(DescribeStackResourceCommand).resolves({
                StackResourceDetail: {
                    LogicalResourceId: "ApiGatewayRestApi",
                    PhysicalResourceId: "test_rest_api_id",
                    ResourceType: "",
                    LastUpdatedTimestamp: null,
                    ResourceStatus: ResourceStatus.CREATE_COMPLETE,
                },
            });
            CloudFormationMock.on(DescribeStacksCommand).resolves({
                Stacks: [
                    {
                        StackName: "custom-stage-name-NestedStackOne-U89W84TQIHJK",
                        RootId: "arn:aws:cloudformation:us-east-1:000000000000:stack/custom-stage-name/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                        CreationTime: null,
                        StackStatus: StackStatus.CREATE_COMPLETE
                    },
                    {
                        StackName: "custom-stage-name-NestedStackTwo-U89W84TQIHJK",
                        RootId: "arn:aws:cloudformation:us-east-1:000000000000:stack/custom-stage-name/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                        CreationTime: null,
                        StackStatus: StackStatus.CREATE_COMPLETE
                    },
                    {
                        StackName: "outside-stack-NestedStackZERO-U89W84TQIHJK",
                        RootId: "arn:aws:cloudformation:us-east-1:000000000000:stack/outside-stack/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                        CreationTime: null,
                        StackStatus: StackStatus.CREATE_COMPLETE
                    },
                ],
            })
            CloudFormationMock.on(DescribeStackResourceCommand).resolves({
                StackResourceDetail: {
                    LogicalResourceId: "ApiGatewayRestApi",
                    PhysicalResourceId: "test_rest_api_id",
                    ResourceType: "",
                    LastUpdatedTimestamp: null,
                    ResourceStatus: ResourceStatus.CREATE_COMPLETE,
                },
            })

            const plugin = constructPlugin({
                basePath: "test_basepath",
                domainName: "test_domain",
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            const result = await plugin.cloudFormationWrapper.findApiId(dc.apiType);

            expect(result).to.equal("test_rest_api_id");
            CloudFormationMock.commandCalls(DescribeStackResourceCommand, {
                LogicalResourceId: "ApiGatewayRestApi",
                StackName: "custom-stage-name-NestedStackOne-U89W84TQIHJK",
            })
        });

        it("Gets HTTP API id correctly when no ApiGateway specified", async () => {
            const CloudFormationMock = mockClient(CloudFormationClient);
            CloudFormationMock.on(DescribeStackResourceCommand).resolves({
                StackResourceDetail: {
                    LogicalResourceId: "ApiGatewayRestApi",
                    PhysicalResourceId: "test_http_api_id",
                    ResourceType: "",
                    LastUpdatedTimestamp: null,
                    ResourceStatus: ResourceStatus.CREATE_COMPLETE,
                },
            });

            CloudFormationMock.on(DescribeStacksCommand).resolves({
                Stacks: [
                    {
                        StackName: "custom-stage-name-NestedStackOne-U89W84TQIHJK",
                        RootId: "arn:aws:cloudformation:us-east-1:000000000000:stack/custom-stage-name/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                        CreationTime: null,
                        StackStatus: StackStatus.CREATE_COMPLETE
                    },
                    {
                        StackName: "custom-stage-name-NestedStackTwo-U89W84TQIHJK",
                        RootId: "arn:aws:cloudformation:us-east-1:000000000000:stack/custom-stage-name/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                        CreationTime: null,
                        StackStatus: StackStatus.CREATE_COMPLETE
                    },
                    {
                        StackName: "outside-stack-NestedStackZERO-U89W84TQIHJK",
                        RootId: "arn:aws:cloudformation:us-east-1:000000000000:stack/outside-stack/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                        CreationTime: null,
                        StackStatus: StackStatus.CREATE_COMPLETE
                    },
                ],
            })

            const plugin = constructPlugin({
                apiType: "http",
                basePath: "test_basepath",
                domainName: "test_domain",
                endpointType: "REGIONAL",
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            const result = await plugin.cloudFormationWrapper.findApiId(dc.apiType);
            expect(result).to.equal("test_http_api_id");

            CloudFormationMock.commandCalls(DescribeStackResourceCommand, {
                LogicalResourceId: "HttpApi",
                StackName: "custom-stage-name-NestedStackOne-U89W84TQIHJK",
            });
        });

        it("Gets Websocket API id correctly when no ApiGateway specified", async () => {
            const CloudFormationMock = mockClient(CloudFormationClient);
            CloudFormationMock.on(DescribeStackResourceCommand).rejects()
                .resolvesOnce({
                    StackResourceDetail: {
                        LogicalResourceId: "WebsocketsApi",
                        PhysicalResourceId: "test_ws_api_id",
                        ResourceType: "",
                        LastUpdatedTimestamp: null,
                        ResourceStatus: ResourceStatus.CREATE_COMPLETE,
                    },
                });

            CloudFormationMock.on(DescribeStacksCommand).resolves({
                Stacks: [
                    {
                        StackName: "custom-stage-name-NestedStackOne-U89W84TQIHJK",
                        RootId: "arn:aws:cloudformation:us-east-1:000000000000:stack/custom-stage-name/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                        CreationTime: null,
                        StackStatus: StackStatus.CREATE_COMPLETE
                    },
                    {
                        StackName: "custom-stage-name-NestedStackTwo-U89W84TQIHJK",
                        RootId: "arn:aws:cloudformation:us-east-1:000000000000:stack/custom-stage-name/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                        CreationTime: null,
                        StackStatus: StackStatus.CREATE_COMPLETE
                    },
                    {
                        StackName: "outside-stack-NestedStackZERO-U89W84TQIHJK",
                        RootId: "arn:aws:cloudformation:us-east-1:000000000000:stack/outside-stack/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                        CreationTime: null,
                        StackStatus: StackStatus.CREATE_COMPLETE
                    },
                ],
            })

            const plugin = constructPlugin({
                apiType: "websocket",
                basePath: "test_basepath",
                domainName: "test_domain",
                endpointType: "REGIONAL",
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            const result = await plugin.cloudFormationWrapper.findApiId(dc.apiType);
            expect(result).to.equal("test_ws_api_id");

            CloudFormationMock.commandCalls(DescribeStackResourceCommand, {
                LogicalResourceId: "WebsocketsApi",
                StackName: "custom-stage-name-NestedStackTwo-U89W84TQIHJK",
            });
        });

        it("serverless.yml defines explicitly the apiGateway", async () => {
            const CloudFormationMock = mockClient(CloudFormationClient);
            CloudFormationMock.on(DescribeStackResourceCommand).resolves({
                StackResourceDetail: {
                    LogicalResourceId: "ApiGatewayRestApi",
                    PhysicalResourceId: "test_rest_api_id",
                    ResourceType: "",
                    LastUpdatedTimestamp: null,
                    ResourceStatus: ResourceStatus.CREATE_COMPLETE,
                },
            });

            const plugin = constructPlugin({
                basePath: "test_basepath",
                domainName: "test_domain",
            });
            plugin.initializeVariables();
            plugin.initAWSResources();
            plugin.serverless.service.provider.apiGateway.restApiId = "custom_test_rest_api_id";

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            const result = await plugin.cloudFormationWrapper.findApiId(dc.apiType);
            expect(result).to.equal("custom_test_rest_api_id");
        });

        afterEach(() => {
            consoleOutput = [];
        });
    });

    describe("Delete the new domain", () => {
        it("Find available domains", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(GetDomainNameCommandV1).resolves({
                distributionDomainName: "test_domain"
            })

            const plugin = constructPlugin({
                basePath: "test_basepath",
                domainName: "test_domain",
            });

            for (const domain of plugin.domains) {
                const apiGateway = plugin.getApiGateway(domain);
                domain.domainInfo = await apiGateway.getCustomDomain(domain);
                expect(domain.domainInfo.domainName).to.equal("test_domain");
            }
        });

        it("Delete A Alias Record", async () => {
            const Route53Mock = mockClient(Route53Client);
            Route53Mock.on(ListHostedZonesCommand).resolves({
                HostedZones: [{
                    CallerReference: "",
                    Config: {PrivateZone: false},
                    Id: "test_host_id",
                    Name: "test_domain",
                }],
            });
            Route53Mock.on(ChangeResourceRecordSetsCommand).resolves(null);

            const plugin = constructPlugin({
                basePath: "test_basepath",
                domainName: "test_domain",
            });
            const route53Wrapper = new Route53Wrapper();
            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.domainInfo = new DomainInfo({
                distributionDomainName: "test_distribution_name",
                distributionHostedZoneId: "test_id",
            });

            await route53Wrapper.changeResourceRecordSet("DELETE", dc);
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
                    Comment: `Record created by "${Globals.pluginName}"`
                },
                HostedZoneId: "test_host_id"
            };
            Route53Mock.commandCalls(ChangeResourceRecordSetsCommand, expectedParams)
        });

        it("Delete the domain name", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(DeleteDomainNameCommandV1).resolves(null);

            const ApiGatewayV2Mock = mockClient(ApiGatewayV2Client);
            ApiGatewayV2Mock.on(DeleteDomainNameCommandV2).resolves(null);

            const plugin = constructPlugin({
                basePath: "test_basepath",
                domainName: "test_domain",
            });
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            await plugin.apiGatewayV1Wrapper.deleteCustomDomain(dc);

            APIGatewayMock.commandCalls(DeleteDomainNameCommandV1, {domainName: "test_domain"})

            await plugin.apiGatewayV2Wrapper.deleteCustomDomain(dc);

            ApiGatewayV2Mock.commandCalls(DeleteDomainNameCommandV2, {DomainName: "test_domain"});
        });

        describe("When split-horizon DNS is requested", () => {
            it("Delete A and AAAA Alias Records in each of the hosted zones with the same domain", async () => {
                const Route53Mock = mockClient(Route53Client);
                Route53Mock.on(ListHostedZonesCommand).resolves({
                    HostedZones: [{
                        CallerReference: "",
                        Config: {PrivateZone: false},
                        Name: "test_domain",
                        Id: "/hostedzone/test_host_id_0",
                    }, {
                        CallerReference: "",
                        Config: {PrivateZone: true},
                        Name: "test_domain",
                        Id: "/hostedzone/test_host_id_1",
                    }]
                });
                Route53Mock.on(ChangeResourceRecordSetsCommand).resolves(null);

                const plugin = constructPlugin({
                    basePath: "test_basepath",
                    domainName: "test_domain",
                    splitHorizonDns: true,
                });
                const route53Wrapper = new Route53Wrapper();

                const dc: DomainConfig = new DomainConfig(
                    plugin.serverless.service.custom.customDomain
                );

                dc.domainInfo = new DomainInfo({
                    distributionDomainName: "test_distribution_name",
                });

                await route53Wrapper.changeResourceRecordSet("DELETE", dc);

                const expectedParams1 = {
                    ChangeBatch: {
                        Changes: [
                            {
                                Action: "DELETE",
                                ResourceRecordSet: {
                                    AliasTarget: {
                                        DNSName: "test_distribution_name",
                                        EvaluateTargetHealth: false,
                                        HostedZoneId: "Z2FDTNDATAQYW2",
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
                                        HostedZoneId: "Z2FDTNDATAQYW2",
                                    },
                                    Name: "test_domain",
                                    Type: "AAAA",
                                },
                            },
                        ],
                        Comment: `Record created by "${Globals.pluginName}"`,
                    },
                    HostedZoneId: "test_host_id_0",
                };

                const expectedParams2 = {
                    ChangeBatch: {
                        Changes: [
                            {
                                Action: "DELETE",
                                ResourceRecordSet: {
                                    AliasTarget: {
                                        DNSName: "test_distribution_name",
                                        EvaluateTargetHealth: false,
                                        HostedZoneId: "Z2FDTNDATAQYW2",
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
                                        HostedZoneId: "Z2FDTNDATAQYW2",
                                    },
                                    Name: "test_domain",
                                    Type: "AAAA",
                                },
                            },
                        ],
                        Comment: `Record created by "${Globals.pluginName}"`,
                    },
                    HostedZoneId: "test_host_id_1",
                };

                Route53Mock.commandCalls(ChangeResourceRecordSetsCommand, expectedParams1);
                Route53Mock.commandCalls(ChangeResourceRecordSetsCommand, expectedParams2);
            })
        });
        afterEach(() => {
            consoleOutput = [];
        });
    });

    describe("Hook Methods", () => {
        it("setupBasePathMapping", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(GetDomainNameCommandV1).resolves({
                domainName: "test_domain"
            })
            APIGatewayMock.on(CreateBasePathMappingCommand).resolves(null);
            APIGatewayMock.on(GetBasePathMappingsCommand).resolves({
                items: []
            });

            const CloudFormationMock = mockClient(CloudFormationClient);
            CloudFormationMock.on(DescribeStackResourceCommand).resolves({
                StackResourceDetail: {
                    LogicalResourceId: "ApiGatewayRestApi",
                    PhysicalResourceId: "test_rest_api_id",
                    ResourceType: "",
                    LastUpdatedTimestamp: null,
                    ResourceStatus: ResourceStatus.CREATE_COMPLETE,
                },
            });

            CloudFormationMock.on(DescribeStacksCommand).resolves({
                Stacks: [
                    {
                        StackName: "custom-stage-name-NestedStackOne-U89W84TQIHJK",
                        RootId: "arn:aws:cloudformation:us-east-1:000000000000:stack/custom-stage-name/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                        CreationTime: null,
                        StackStatus: StackStatus.CREATE_COMPLETE
                    },
                    {
                        StackName: "custom-stage-name-NestedStackTwo-U89W84TQIHJK",
                        RootId: "arn:aws:cloudformation:us-east-1:000000000000:stack/custom-stage-name/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                        CreationTime: null,
                        StackStatus: StackStatus.CREATE_COMPLETE
                    },
                    {
                        StackName: "outside-stack-NestedStackZERO-U89W84TQIHJK",
                        RootId: "arn:aws:cloudformation:us-east-1:000000000000:stack/outside-stack/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                        CreationTime: null,
                        StackStatus: StackStatus.CREATE_COMPLETE
                    },
                ],
            })

            const plugin = constructPlugin({domainName: "test_domain"});
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            const apiGateway = plugin.getApiGateway(dc);
            const spy = chai.spy.on(apiGateway, "createBasePathMapping");

            await plugin.setupBasePathMappings();

            expect(spy).to.be.called();
        });

        it("deleteDomain", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(GetDomainNameCommandV1).resolves({
                domainName: "test_domain",
                regionalHostedZoneId: "test_id"
            })
            APIGatewayMock.on(DeleteDomainNameCommandV1).resolves(null);

            const Route53Mock = mockClient(Route53Client);
            Route53Mock.on(ListHostedZonesCommand).resolves({
                HostedZones: [{
                    CallerReference: "",
                    Config: {PrivateZone: false},
                    Id: "test_host_id",
                    Name: "test_domain",
                }],
            });
            Route53Mock.on(ChangeResourceRecordSetsCommand).resolves(null);

            const plugin = constructPlugin({domainName: "test_domain"});
            plugin.initializeVariables();
            plugin.initAWSResources();

            await plugin.deleteDomains();
            expect(consoleOutput[0]).to.equal(`Custom domain ${plugin.domains[0].givenDomainName} was deleted.`);
        });

        it("createDomain if one does not exist before", async () => {
            const ACMCMock = mockClient(ACMClient);
            ACMCMock.on(ListCertificatesCommand).resolves(certTestData);

            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(GetDomainNameCommandV1).rejects({
                "$metadata": {httpStatusCode: 404}
            })
            APIGatewayMock.on(CreateDomainNameCommandV1).resolves({
                distributionDomainName: "foo",
                securityPolicy: "TLS_1_2"
            });

            const Route53Mock = mockClient(Route53Client);
            Route53Mock.on(ListHostedZonesCommand).resolves({
                HostedZones: [{
                    CallerReference: "",
                    Config: {PrivateZone: false},
                    Id: "test_host_id",
                    Name: "test_domain",
                }],
            });
            Route53Mock.on(ChangeResourceRecordSetsCommand).resolves(null);

            const plugin = constructPlugin({domainName: "test_domain"});
            plugin.initializeVariables();
            plugin.initializeVariables();
            plugin.initAWSResources();

            await plugin.createDomains();
            expect(consoleOutput[0]).to.contains("'test_domain' does not exist")
            expect(consoleOutput[1]).to.contains("Searching for a certificate with the 'test_domain' domain")
            expect(consoleOutput[2]).to.contains(
                `Custom domain '${plugin.domains[0].givenDomainName}' was created.`
            );
        });

        it("Does not create domain if one existed before", async () => {
            const ACMCMock = mockClient(ACMClient);
            ACMCMock.on(ListCertificatesCommand).resolves(certTestData);

            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(GetDomainNameCommandV1).resolves({
                domainName: "test_domain",
                regionalHostedZoneId: "test_id"
            });
            APIGatewayMock.on(CreateDomainNameCommandV1).resolves({
                distributionDomainName: "foo",
                securityPolicy: "TLS_1_2"
            });

            const ApiGatewayV2Mock = mockClient(ApiGatewayV2Client);
            ApiGatewayV2Mock.on(GetDomainNameCommandV2).resolves({
                DomainName: "test_domain", DomainNameConfigurations: [{HostedZoneId: "test_id"}]
            });

            const Route53Mock = mockClient(Route53Client);
            Route53Mock.on(ListHostedZonesCommand).resolves({
                HostedZones: [{
                    CallerReference: "",
                    Config: {PrivateZone: false},
                    Id: "test_host_id",
                    Name: "test_domain",
                }],
            });
            Route53Mock.on(ChangeResourceRecordSetsCommand).resolves(null);

            const plugin = constructPlugin({domainName: "test_domain"});
            plugin.initializeVariables();
            plugin.initAWSResources();
            plugin.initializeVariables();
            await plugin.createDomains();
            expect(consoleOutput[0]).to.equal(`Custom domain 'test_domain' already exists.`);
            expect(consoleOutput[1]).to.contains(`Creating/updating route53 record for 'test_domain'.`);
        });

        afterEach(() => {
            consoleOutput = [];
        });
    });

    describe("Select Hosted Zone", () => {
        it("Natural order", async () => {
            const Route53Mock = mockClient(Route53Client);
            Route53Mock.on(ListHostedZonesCommand).resolves({
                HostedZones: [{
                    CallerReference: "",
                    Name: "aaa.com.",
                    Id: "/hostedzone/test_id_0",
                    Config: {PrivateZone: false}
                }, {
                    CallerReference: "",
                    Name: "bbb.aaa.com.",
                    Id: "/hostedzone/test_id_1",
                    Config: {PrivateZone: false}
                }, {
                    CallerReference: "",
                    Name: "ccc.bbb.aaa.com.",
                    Id: "/hostedzone/test_id_2",
                    Config: {PrivateZone: false}
                }, {
                    CallerReference: "",
                    Name: "ddd.ccc.bbb.aaa.com.",
                    Id: "/hostedzone/test_id_3",
                    Config: {PrivateZone: false}
                }]
            });

            const plugin = constructPlugin({domainName: "ccc.bbb.aaa.com"});
            plugin.initializeVariables();

            const route53Wrapper = new Route53Wrapper();
            const result = await route53Wrapper.getRoute53HostedZoneId(plugin.domains[0]);

            expect(result).to.equal("test_id_2");
        });

        it("Reverse order", async () => {
            const Route53Mock = mockClient(Route53Client);
            Route53Mock.on(ListHostedZonesCommand).resolves({
                HostedZones: [{
                    CallerReference: "",
                    Name: "ddd.ccc.bbb.aaa.com.",
                    Id: "/hostedzone/test_id_0",
                    Config: {PrivateZone: false}
                }, {
                    CallerReference: "",
                    Name: "ccc.bbb.aaa.com.",
                    Id: "/hostedzone/test_id_1",
                    Config: {PrivateZone: false}
                }, {
                    CallerReference: "",
                    Name: "bbb.aaa.com.",
                    Id: "/hostedzone/test_id_2",
                    Config: {PrivateZone: false}
                }, {
                    CallerReference: "",
                    Name: "aaa.com.",
                    Id: "/hostedzone/test_id_3",
                    Config: {PrivateZone: false}
                }]
            });

            const plugin = constructPlugin({domainName: "test.ccc.bbb.aaa.com"});
            plugin.initializeVariables();

            const route53Wrapper = new Route53Wrapper();
            const result = await route53Wrapper.getRoute53HostedZoneId(plugin.domains[0]);

            expect(result).to.equal("test_id_1");
        });

        it("Random order", async () => {
            const Route53Mock = mockClient(Route53Client);
            Route53Mock.on(ListHostedZonesCommand).resolves({
                HostedZones: [{
                    CallerReference: "",
                    Name: "bbb.aaa.com.",
                    Id: "/hostedzone/test_id_0",
                    Config: {PrivateZone: false}
                }, {
                    CallerReference: "",
                    Name: "ddd.ccc.bbb.aaa.com.",
                    Id: "/hostedzone/test_id_1",
                    Config: {PrivateZone: false}
                }, {
                    CallerReference: "",
                    Name: "ccc.bbb.aaa.com.",
                    Id: "/hostedzone/test_id_2",
                    Config: {PrivateZone: false}
                }, {
                    CallerReference: "",
                    Name: "aaa.com.",
                    Id: "/hostedzone/test_id_3",
                    Config: {PrivateZone: false}
                }],
            });

            const plugin = constructPlugin({domainName: "test.ccc.bbb.aaa.com"});
            plugin.initializeVariables();

            const route53Wrapper = new Route53Wrapper();
            const result = await route53Wrapper.getRoute53HostedZoneId(plugin.domains[0]);

            expect(result).to.equal("test_id_2");
        });

        it("Sub domain name - only root hosted zones", async () => {
            const Route53Mock = mockClient(Route53Client);
            Route53Mock.on(ListHostedZonesCommand).resolves({
                HostedZones: [{
                    CallerReference: "",
                    Name: "aaa.com.",
                    Id: "/hostedzone/test_id_0",
                    Config: {PrivateZone: false}
                }, {
                    CallerReference: "",
                    Name: "bbb.fr.",
                    Id: "/hostedzone/test_id_1",
                    Config: {PrivateZone: false}
                }, {
                    CallerReference: "",
                    Name: "ccc.com.",
                    Id: "/hostedzone/test_id_3",
                    Config: {PrivateZone: false}
                }],
            });

            const plugin = constructPlugin({domainName: "bar.foo.bbb.fr"});
            plugin.initializeVariables();

            const route53Wrapper = new Route53Wrapper();
            const result = await route53Wrapper.getRoute53HostedZoneId(plugin.domains[0]);

            expect(result).to.equal("test_id_1");
        });

        it("With matching root and sub hosted zone", async () => {
            const Route53Mock = mockClient(Route53Client);
            Route53Mock.on(ListHostedZonesCommand).resolves({
                HostedZones: [{
                    CallerReference: "",
                    Name: "a.aaa.com.",
                    Id: "/hostedzone/test_id_0",
                    Config: {PrivateZone: false}
                }, {
                    CallerReference: "",
                    Name: "aaa.com.",
                    Id: "/hostedzone/test_id_1",
                    Config: {PrivateZone: false}
                }],
            });

            const plugin = constructPlugin({domainName: "test.a.aaa.com"});
            plugin.initializeVariables();

            const route53Wrapper = new Route53Wrapper();
            const result = await route53Wrapper.getRoute53HostedZoneId(plugin.domains[0]);

            expect(result).to.equal("test_id_0");
        });

        it("Sub domain name - natural order", async () => {
            const Route53Mock = mockClient(Route53Client);
            Route53Mock.on(ListHostedZonesCommand).resolves({
                HostedZones: [{
                    CallerReference: "",
                    Name: "aaa.com.",
                    Id: "/hostedzone/test_id_0",
                    Config: {PrivateZone: false}
                }, {
                    CallerReference: "",
                    Name: "bbb.fr.",
                    Id: "/hostedzone/test_id_1",
                    Config: {PrivateZone: false}
                }, {
                    CallerReference: "",
                    Name: "foo.bbb.fr.",
                    Id: "/hostedzone/test_id_3",
                    Config: {PrivateZone: false}
                }, {
                    CallerReference: "",
                    Name: "ccc.com.",
                    Id: "/hostedzone/test_id_4",
                    Config: {PrivateZone: false}
                },],
            });

            const plugin = constructPlugin({domainName: "bar.foo.bbb.fr"});
            plugin.initializeVariables();

            const route53Wrapper = new Route53Wrapper();
            const result = await route53Wrapper.getRoute53HostedZoneId(plugin.domains[0]);

            expect(result).to.equal("test_id_3");
        });

        it("Sub domain name - reverse order", async () => {
            const Route53Mock = mockClient(Route53Client);
            Route53Mock.on(ListHostedZonesCommand).resolves({
                HostedZones: [{
                    CallerReference: "",
                    Name: "foo.bbb.fr.",
                    Id: "/hostedzone/test_id_3",
                    Config: {PrivateZone: false}
                }, {
                    CallerReference: "",
                    Name: "bbb.fr.",
                    Id: "/hostedzone/test_id_1",
                    Config: {PrivateZone: false}
                }, {
                    CallerReference: "",
                    Name: "ccc.com.",
                    Id: "/hostedzone/test_id_4",
                    Config: {PrivateZone: false}
                }, {
                    CallerReference: "",
                    Name: "aaa.com.",
                    Id: "/hostedzone/test_id_0",
                    Config: {PrivateZone: false}
                },
                ],
            });

            const plugin = constructPlugin({domainName: "bar.foo.bbb.fr"});
            plugin.initializeVariables();

            const route53Wrapper = new Route53Wrapper();
            const result = await route53Wrapper.getRoute53HostedZoneId(plugin.domains[0]);

            expect(result).to.equal("test_id_3");
        });

        it("Sub domain name - random order", async () => {
            const Route53Mock = mockClient(Route53Client);
            Route53Mock.on(ListHostedZonesCommand).resolves({
                HostedZones: [{
                    CallerReference: "",
                    Name: "bbb.fr.",
                    Id: "/hostedzone/test_id_1",
                    Config: {PrivateZone: false}
                }, {
                    CallerReference: "",
                    Name: "aaa.com.",
                    Id: "/hostedzone/test_id_0",
                    Config: {PrivateZone: false}
                }, {
                    CallerReference: "",
                    Name: "foo.bbb.fr.",
                    Id: "/hostedzone/test_id_3",
                    Config: {PrivateZone: false}
                },
                ],
            });

            const plugin = constructPlugin({domainName: "bar.foo.bbb.fr"});
            plugin.initializeVariables();

            const route53Wrapper = new Route53Wrapper();
            const result = await route53Wrapper.getRoute53HostedZoneId(plugin.domains[0]);

            expect(result).to.equal("test_id_3");
        });

        it("Private zone domain name", async () => {
            const Route53Mock = mockClient(Route53Client);
            Route53Mock.on(ListHostedZonesCommand).resolves({
                HostedZones: [
                    {
                        CallerReference: "",
                        Name: "aaa.com.",
                        Id: "/hostedzone/test_id_1",
                        Config: {PrivateZone: false}
                    }, {
                        CallerReference: "",
                        Name: "aaa.com.",
                        Id: "/hostedzone/test_id_0",
                        Config: {PrivateZone: true}
                    },
                ],
            });

            const plugin = constructPlugin({domainName: "aaa.com", hostedZonePrivate: true});
            plugin.initializeVariables();

            const domain = plugin.domains[0];
            const route53Wrapper = new Route53Wrapper();
            const result = await route53Wrapper.getRoute53HostedZoneId(domain, domain.hostedZonePrivate);

            expect(result).to.equal("test_id_0");
        });

        it("Undefined hostedZonePrivate should still allow private domains", async () => {
            const Route53Mock = mockClient(Route53Client);
            Route53Mock.on(ListHostedZonesCommand).resolves({
                HostedZones: [{
                    CallerReference: "",
                    Config: {PrivateZone: true},
                    Id: "/hostedzone/test_id_0",
                    Name: "aaa.com.",
                }],
            });

            const plugin = constructPlugin({domainName: "aaa.com"});
            plugin.initializeVariables();

            const route53Wrapper = new Route53Wrapper();
            const result = await route53Wrapper.getRoute53HostedZoneId(plugin.domains[0]);

            expect(result).to.equal("test_id_0");
        });

        afterEach(() => {
            consoleOutput = [];
        });
    });

    describe("Error Catching", () => {
        it("If a certificate cannot be found when a name is given", async () => {
            const ACMCMock = mockClient(ACMClient);
            ACMCMock.on(ListCertificatesCommand).resolves(certTestData);

            const options = {
                certificateName: "does_not_exist",
                domainName: "",
            };
            const plugin = constructPlugin(options);
            plugin.initializeVariables();
            const domain = plugin.domains[0];
            const acm = new ACMWrapper(domain.endpointType);

            return acm.getCertArn(domain).then(() => {
                throw new Error("Test has failed. getCertArn did not catch errors.");
            }).catch((err) => {
                const expectedErrorMessage = "Could not find an in-date certificate for 'does_not_exist'.";
                expect(err.message).to.equal(expectedErrorMessage);
            });
        });

        it("Fail getHostedZone", async () => {
            const Route53Mock = mockClient(Route53Client);
            Route53Mock.on(ListHostedZonesCommand).resolves({
                HostedZones: [{
                    CallerReference: "",
                    Config: {PrivateZone: false},
                    Id: "test_host_id",
                    Name: "no_hosted_zone",
                }],
            });

            const plugin = constructPlugin({domainName: "test_domain"});
            plugin.initializeVariables();

            const route53Wrapper = new Route53Wrapper();

            return route53Wrapper.getRoute53HostedZoneId(plugin.domains[0]).then(() => {
                throw new Error("Test has failed, getHostedZone did not catch errors.");
            }).catch((err) => {
                const expectedErrorMessage = "Could not find hosted zone 'test_domain'";
                expect(err.message).to.equal(expectedErrorMessage);
            });
        });

        it("Domain summary failed", async () => {
            const ApiGatewayV2Mock = mockClient(ApiGatewayV2Client);
            ApiGatewayV2Mock.on(GetDomainNameCommandV2).resolves({
                DomainName: "test_domain", DomainNameConfigurations: [{HostedZoneId: "test_id"}]
            });

            const plugin = constructPlugin({domainName: "test_domain"});
            plugin.initializeVariables();
            plugin.initAWSResources();

            return plugin.domainSummaries().then(() => {
                // check if distribution domain name is printed
            }).catch((err) => {
                const expectedErrorMessage = `Unable to fetch information about 'test_domain'`;
                expect(err.message).to.contains(expectedErrorMessage);
            });
        });

        it("Should log if SLS_DEBUG is set", async () => {
            const plugin = constructPlugin({domainName: "test_domain"});
            plugin.initializeVariables();

            // set sls debug to true
            process.env.SLS_DEBUG = "True";
            Logging.logError("test message");
            expect(consoleOutput[0]).to.contain("test message");
        });

        it('should fail when the mutual TLS certificate is not stored in S3', async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(GetDomainNameCommandV1).resolves({
                domainName: "test_domain",
                regionalHostedZoneId: "test_id"
            });

            const S3Mock = mockClient(S3Client);
            S3Mock.on(HeadObjectCommand).rejects({Code: "404", "$metadata": {httpStatusCode: 404}});

            const plugin = constructPlugin({
                domainName: "test_domain",
                endpointType: "regional",
                tlsTruststoreUri: 's3://test_bucket/test_key'
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            try {
                await plugin.createDomains();
            } catch (e) {
                expect(e.message).to.contain('Could not head S3 object');
            }
        });

        afterEach(() => {
            consoleOutput = [];
            process.env.SLS_DEBUG = "";
        });
    });

    describe("Summary Printing", () => {
        it("Prints Summary", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(GetDomainNameCommandV1).resolves({
                domainName: "test_distributed_domain_name"
            });
            const plugin = constructPlugin({domainName: "test_domain"});
            plugin.initializeVariables();
            plugin.initAWSResources();

            await plugin.domainSummaries();
            expect(consoleOutput[0]).to.contain("Distribution Domain Name");
            expect(consoleOutput[1]).to.contain("test_domain");
            expect(consoleOutput[2]).to.contain("test_distributed_domain_name");

            APIGatewayMock.commandCalls(GetDomainNameCommandV1);
        });

        afterEach(() => {
            consoleOutput = [];
        });
    });

    describe("Enable/disable functionality", () => {
        it("Should enable the plugin by default", () => {
            const plugin = constructPlugin({});

            plugin.initializeVariables();
            plugin.initAWSResources();

            expect(plugin.domains).length.to.be.greaterThan(0);
            for (const domain of plugin.domains) {
                expect(domain.enabled).to.equal(true);
            }
        });

        it("Should enable the plugin when passing a true parameter with type boolean", () => {
            const plugin = constructPlugin({enabled: true});

            plugin.initializeVariables();
            plugin.initAWSResources();

            expect(plugin.domains).length.to.be.greaterThan(0);
            for (const domain of plugin.domains) {
                expect(domain.enabled).to.equal(true);
            }
        });

        it("Should enable the plugin when passing a true parameter with type string", () => {
            const plugin = constructPlugin({enabled: "true"});

            plugin.initializeVariables();
            plugin.initAWSResources();

            expect(plugin.domains).length.to.be.greaterThan(0);
            for (const domain of plugin.domains) {
                expect(domain.enabled).to.equal(true);
            }
        });

        it("Should disable the plugin when passing a false parameter with type boolean", () => {
            const plugin = constructPlugin({enabled: false});

            plugin.initializeVariables();

            expect(plugin.domains.length).to.equal(0);
        });

        it("Should disable the plugin when passing a false parameter with type string", () => {
            const plugin = constructPlugin({enabled: "false"});

            plugin.initializeVariables();

            expect(plugin.domains.length).to.equal(0);
        });

        it("createDomain should do nothing when domain manager is disabled", async () => {
            const plugin = constructPlugin({enabled: false});

            await plugin.hookWrapper(plugin.createDomains);

            expect(plugin.domains.length).to.equal(0);
        });

        it("deleteDomain should do nothing when domain manager is disabled", async () => {
            const plugin = constructPlugin({enabled: false});

            await plugin.hookWrapper(plugin.deleteDomains);

            expect(plugin.domains.length).to.equal(0);
        });

        it("setUpBasePathMapping should do nothing when domain manager is disabled", async () => {
            const plugin = constructPlugin({enabled: false});

            await plugin.hookWrapper(plugin.setupBasePathMappings);

            expect(plugin.domains.length).to.equal(0);
        });

        it("removeBasePathMapping should do nothing when domain manager is disabled", async () => {
            const plugin = constructPlugin({enabled: false});

            await plugin.hookWrapper(plugin.removeBasePathMappings);

            expect(plugin.domains.length).to.equal(0);
        });

        it("domainSummary should do nothing when domain manager is disabled", async () => {
            const plugin = constructPlugin({enabled: false});

            await plugin.hookWrapper(plugin.domainSummaries);

            expect(plugin.domains.length).to.equal(0);
        });

        it("Should throw an Error when passing a parameter that is not boolean", async () => {
            const plugin = constructPlugin({enabled: "11"});

            let errored = false;
            try {
                await plugin.hookWrapper(null);
            } catch (err) {
                errored = true;
                expect(err.message).to.equal(`${Globals.pluginName}: Ambiguous boolean config: \"11\"`);
            }
            expect(errored).to.equal(true);
        });

        it("Should throw an Error when passing a parameter that cannot be converted to boolean", async () => {
            const plugin = constructPlugin({enabled: "yes"});

            let errored = false;
            try {
                await plugin.hookWrapper(null);
            } catch (err) {
                errored = true;
                expect(err.message).to.equal(`${Globals.pluginName}: Ambiguous boolean config: \"yes\"`);
            }
            expect(errored).to.equal(true);
        });

        it("Should throw an Error when mutual TLS is enabled for edge APIs", async () => {
            const plugin = constructPlugin({endpointType: "edge", tlsTruststoreUri: "s3://bucket-name/key-name"});

            let errored = false;
            try {
                await plugin.hookWrapper(null);
            } catch (err) {
                errored = true;
                expect(err.message).to.equal(`EDGE APIs do not support mutual TLS, remove tlsTruststoreUri or change to a regional API.`);
            }
            expect(errored).to.equal(true);
        });

        it("Should throw an Error when mutual TLS uri is not an S3 uri", async () => {
            const plugin = constructPlugin({endpointType: "regional", tlsTruststoreUri: "http://example.com"});

            let errored = false;
            try {
                await plugin.hookWrapper(null);
            } catch (err) {
                errored = true;
                expect(err.message).to.equal(`http://example.com is not a valid s3 uri, try something like s3://bucket-name/key-name.`);
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
                plugin.validateConfigExists();
            } catch (err) {
                errored = true;
                expect(err.message).to.equal(`${Globals.pluginName}: Plugin configuration is missing.`);
            }
            expect(errored).to.equal(true);
        });

        it("Should thrown an Error when Serverless custom configuration object is missing for multiple domains", () => {
            const plugin = constructPlugin({}, null, true);
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
            const plugin = constructPlugin({});
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
    });

    describe("autoDomain deploy", () => {
        it("Should be disabled by default", () => {
            const plugin = constructPlugin({domainName: "test_domain"});
            plugin.initializeVariables();
            expect(plugin.serverless.service.custom.customDomain.autoDomain).to.equal(undefined);
        });

        it("createOrGetDomainForCfOutputs should call createDomain when autoDomain is true", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(GetDomainNameCommandV1).resolves({
                domainName: "test_domain",
                regionalHostedZoneId: "test_id"
            });
            const plugin = constructPlugin({
                autoDomain: true,
                basePath: "test_basepath",
                createRoute53Record: false,
                domainName: "test_domain",
                restApiId: "test_rest_api_id",
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            await plugin.createOrGetDomainForCfOutputs();

            expect(plugin.serverless.service.custom.customDomain.autoDomain).to.equal(true);

            APIGatewayMock.commandCalls(GetDomainNameCommandV1);
        });

        it("createOrGetDomainForCfOutputs should not call createDomain when autoDomain is not true", async () => {
            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(GetDomainNameCommandV1).resolves({
                domainName: "test_domain",
                regionalHostedZoneId: "test_id"
            });

            const ApiGatewayV2Mock = mockClient(ApiGatewayV2Client);
            ApiGatewayV2Mock.on(GetDomainNameCommandV2).resolves({
                DomainName: "test_domain", DomainNameConfigurations: [{HostedZoneId: "test_id"}]
            });

            const plugin = constructPlugin({
                autoDomain: false,
                basePath: "test_basepath",
                createRoute53Record: false,
                domainName: "test_domain",
                restApiId: "test_rest_api_id",
            });
            plugin.initializeVariables();
            plugin.initAWSResources();


            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            // by default apiType is Edge and the getApiGateway should return ApiGateway V1
            const spy1 = chai.spy.on(plugin.apiGatewayV1Wrapper.apiGateway, "createDomainName");

            // updating domain config to get ApiGateway V2
            dc.apiType = Globals.endpointTypes.regional;
            dc.securityPolicy = Globals.tlsVersions.tls_1_2;
            const spy2 = chai.spy.on(plugin.apiGatewayV2Wrapper.apiGateway, "createDomainName");

            await plugin.createOrGetDomainForCfOutputs();

            expect(plugin.serverless.service.custom.customDomain.autoDomain).to.equal(false);
            expect(spy1).to.have.not.been.called();
            expect(spy2).to.have.not.been.called();
        });

        it("removeBasePathMapping should call deleteDomain when autoDomain is true", async () => {
            const CloudFormationMock = mockClient(CloudFormationClient);
            CloudFormationMock.on(DescribeStackResourceCommand).resolves({
                StackResourceDetail: {
                    LogicalResourceId: "ApiGatewayRestApi",
                    PhysicalResourceId: "test_rest_api_id",
                    ResourceType: "",
                    LastUpdatedTimestamp: null,
                    ResourceStatus: ResourceStatus.CREATE_COMPLETE,
                },
            });

            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(GetBasePathMappingsCommand).resolves({
                items: [{restApiId: "test_rest_api_id", basePath: "test", stage: "test"}],
            });
            APIGatewayMock.on(DeleteBasePathMappingCommand).resolves(null);
            APIGatewayMock.on(DeleteDomainNameCommandV1).resolves(null);
            APIGatewayMock.on(GetDomainNameCommandV1).resolves({
                domainName: "test_domain",
                regionalHostedZoneId: "test_id"
            });

            const plugin = constructPlugin({
                autoDomain: true,
                basePath: "test_basepath",
                createRoute53Record: false,
                domainName: "test_domain",
                restApiId: "test_rest_api_id",
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            await plugin.removeBasePathMappings();

            expect(plugin.serverless.service.custom.customDomain.autoDomain).to.equal(true);
            APIGatewayMock.commandCalls(DeleteDomainNameCommandV1);
        });

        it("removeBasePathMapping should not call deleteDomain when autoDomain is not true", async () => {
            const CloudFormationMock = mockClient(CloudFormationClient);
            CloudFormationMock.on(DescribeStackResourceCommand).resolves({
                StackResourceDetail: {
                    LogicalResourceId: "ApiGatewayRestApi",
                    PhysicalResourceId: "test_rest_api_id",
                    ResourceType: "",
                    LastUpdatedTimestamp: null,
                    ResourceStatus: ResourceStatus.CREATE_COMPLETE,
                },
            });

            const ApiGatewayV2Mock = mockClient(ApiGatewayV2Client);
            ApiGatewayV2Mock.on(GetDomainNameCommandV2).resolves({
                DomainName: "test_domain", DomainNameConfigurations: [{HostedZoneId: "test_id"}]
            });
            ApiGatewayV2Mock.on(GetApiMappingsCommand).resolves(null);
            ApiGatewayV2Mock.on(DeleteApiMappingCommand).resolves(null);
            ApiGatewayV2Mock.on(DeleteDomainNameCommandV2).resolves(null);

            const plugin = constructPlugin({
                autoDomain: false,
                basePath: "test_basepath",
                createRoute53Record: false,
                domainName: "test_domain",
                restApiId: "test_rest_api_id",
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            await plugin.removeBasePathMappings();

            expect(plugin.serverless.service.custom.customDomain.autoDomain).to.equal(false);
            ApiGatewayV2Mock.commandCalls(DeleteDomainNameCommandV2);
        });

        it("removeBasePathMapping should not call deleteDomain when preserveExternalPathMappings is true and " +
            "external mappings exist", async () => {
            const CloudFormationMock = mockClient(CloudFormationClient);
            CloudFormationMock.on(DescribeStackResourceCommand).resolves({
                StackResourceDetail: {
                    LogicalResourceId: "ApiGatewayRestApi",
                    PhysicalResourceId: "test_rest_api_id",
                    ResourceType: "",
                    LastUpdatedTimestamp: null,
                    ResourceStatus: ResourceStatus.CREATE_COMPLETE,
                },
            });

            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(GetBasePathMappingsCommand).resolves({
                items: [
                    {restApiId: "test_rest_api_id", basePath: "test", stage: "test"},
                    {restApiId: "test_rest_api_id_2", basePath: "test", stage: "test"},
                ],
            });
            APIGatewayMock.on(DeleteBasePathMappingCommand).resolves(null);
            APIGatewayMock.on(DeleteDomainNameCommandV1).resolves(null);
            APIGatewayMock.on(GetDomainNameCommandV1).resolves({
                domainName: "test_domain",
                regionalHostedZoneId: "test_id"
            });

            const plugin = constructPlugin({
                autoDomain: true,
                basePath: "test_basepath",
                createRoute53Record: false,
                domainName: "test_domain",
                preserveExternalPathMappings: true,
                restApiId: "test_rest_api_id",
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            const apiGateway = plugin.getApiGateway(dc);
            const spy = chai.spy.on(apiGateway.apiGateway, "deleteDomainName");

            await plugin.removeBasePathMappings();

            expect(plugin.serverless.service.custom.customDomain.autoDomain).to.equal(true);
            expect(plugin.serverless.service.custom.customDomain.preserveExternalPathMappings).to.equal(true);
            expect(spy).to.have.not.been.called();
        });

        it("removeBasePathMapping should call deleteDomain when preserveExternalPathMappings is true and " +
            "external mappings don't exist", async () => {
            const CloudFormationMock = mockClient(CloudFormationClient);
            CloudFormationMock.on(DescribeStackResourceCommand).resolves({
                StackResourceDetail: {
                    LogicalResourceId: "ApiGatewayRestApi",
                    PhysicalResourceId: "test_rest_api_id",
                    ResourceType: "",
                    LastUpdatedTimestamp: null,
                    ResourceStatus: ResourceStatus.CREATE_COMPLETE,
                },
            });

            const APIGatewayMock = mockClient(APIGatewayClient);
            APIGatewayMock.on(GetBasePathMappingsCommand).resolves({
                items: [
                    {restApiId: "test_rest_api_id", basePath: "test", stage: "test"},
                ],
            });
            APIGatewayMock.on(GetDomainNameCommandV1).resolves({
                domainName: "test_domain",
                regionalHostedZoneId: "test_id"
            });
            APIGatewayMock.on(DeleteBasePathMappingCommand).resolves(null);
            APIGatewayMock.on(DeleteDomainNameCommandV1).resolves(null);

            const plugin = constructPlugin({
                autoDomain: true,
                basePath: "test_basepath",
                createRoute53Record: false,
                domainName: "test_domain",
                preserveExternalPathMappings: true,
                restApiId: "test_rest_api_id",
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            await plugin.removeBasePathMappings();

            expect(plugin.serverless.service.custom.customDomain.autoDomain).to.equal(true);
            expect(plugin.serverless.service.custom.customDomain.preserveExternalPathMappings).to.equal(true);

            APIGatewayMock.commandCalls(DeleteDomainNameCommandV1);
        });

        afterEach(() => {
            consoleOutput = [];
        });
    });

    describe("Route53 Routing Policies", () => {
        it("Should create a new Alias Record with latency routing", async () => {
            const Route53Mock = mockClient(Route53Client);
            Route53Mock.on(ListHostedZonesCommand).resolves({
                HostedZones: [{
                    CallerReference: "",
                    Config: {PrivateZone: false},
                    Id: "test_host_id",
                    Name: "test_domain",
                }],
            });
            Route53Mock.on(ChangeResourceRecordSetsCommand).resolves(null);

            const plugin = constructPlugin({
                basePath: "test_basepath",
                domainName: "test_domain",
                endpointType: "REGIONAL",
                route53Params: {
                    routingPolicy: 'latency'
                }
            });
            const route53Wrapper = new Route53Wrapper();
            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.domainInfo = new DomainInfo(
                {
                    regionalDomainName: "test_regional_name",
                    regionalHostedZoneId: "test_id",
                },
            );

            await route53Wrapper.changeResourceRecordSet("UPSERT", dc);

            const expectedParams = {
                ChangeBatch: {
                    Changes: [
                        {
                            Action: "UPSERT",
                            ResourceRecordSet: {
                                AliasTarget: {
                                    DNSName: "test_regional_name",
                                    EvaluateTargetHealth: false,
                                    HostedZoneId: "test_id",
                                },
                                Name: "test_domain",
                                Type: "A",
                                Region: "eu-west-1",
                                SetIdentifier: "test_regional_name",
                            },
                        },
                        {
                            Action: "UPSERT",
                            ResourceRecordSet: {
                                AliasTarget: {
                                    DNSName: "test_regional_name",
                                    EvaluateTargetHealth: false,
                                    HostedZoneId: "test_id",
                                },
                                Name: "test_domain",
                                Type: "AAAA",
                                Region: "eu-west-1",
                                SetIdentifier: "test_regional_name",
                            },
                        },
                    ],
                    Comment: `Record created by "${Globals.pluginName}"`
                },
                HostedZoneId: "test_host_id"
            };
            Route53Mock.commandCalls(ChangeResourceRecordSetsCommand, expectedParams);
        });

        it("Should create a new Alias Record with weighted routing", async () => {
            const Route53Mock = mockClient(Route53Client);
            Route53Mock.on(ListHostedZonesCommand).resolves({
                HostedZones: [{
                    CallerReference: "",
                    Config: {PrivateZone: false},
                    Id: "test_host_id",
                    Name: "test_domain",
                }],
            });
            Route53Mock.on(ChangeResourceRecordSetsCommand).resolves(null);

            const plugin = constructPlugin({
                basePath: "test_basepath",
                domainName: "test_domain",
                endpointType: "REGIONAL",
                route53Params: {
                    routingPolicy: 'weighted',
                    weight: 100,
                    healthCheckId: "test_healthcheck",
                }
            });
            const route53Wrapper = new Route53Wrapper();
            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.domainInfo = new DomainInfo(
                {
                    regionalDomainName: "test_regional_name",
                    regionalHostedZoneId: "test_id",
                },
            );

            await route53Wrapper.changeResourceRecordSet("UPSERT", dc);

            const expectedParams = {
                ChangeBatch: {
                    Changes: [
                        {
                            Action: "UPSERT",
                            ResourceRecordSet: {
                                AliasTarget: {
                                    DNSName: "test_regional_name",
                                    EvaluateTargetHealth: false,
                                    HostedZoneId: "test_id",
                                },
                                Name: "test_domain",
                                Type: "A",
                                SetIdentifier: "test_regional_name",
                                Weight: 100,
                                HealthCheckId: "test_healthcheck",
                            },
                        },
                        {
                            Action: "UPSERT",
                            ResourceRecordSet: {
                                AliasTarget: {
                                    DNSName: "test_regional_name",
                                    EvaluateTargetHealth: false,
                                    HostedZoneId: "test_id",
                                },
                                Name: "test_domain",
                                Type: "AAAA",
                                SetIdentifier: "test_regional_name",
                                Weight: 100,
                                HealthCheckId: "test_healthcheck",
                            },
                        },
                    ],
                    Comment: `Record created by "${Globals.pluginName}"`
                },
                HostedZoneId: "test_host_id"
            };
            Route53Mock.commandCalls(ChangeResourceRecordSetsCommand, expectedParams);
        });

        it("Should exclude weight input with latency routing", async () => {
            const Route53Mock = mockClient(Route53Client);
            Route53Mock.on(ListHostedZonesCommand).resolves({
                HostedZones: [{
                    CallerReference: "",
                    Config: {PrivateZone: false},
                    Id: "test_host_id",
                    Name: "test_domain",
                }],
            });
            Route53Mock.on(ChangeResourceRecordSetsCommand).resolves(null);

            const plugin = constructPlugin({
                basePath: "test_basepath",
                domainName: "test_domain",
                endpointType: "REGIONAL",
                route53Params: {
                    routingPolicy: 'latency',
                    weight: 100,
                }
            });
            const route53Wrapper = new Route53Wrapper();
            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.domainInfo = new DomainInfo(
                {
                    regionalDomainName: "test_regional_name",
                    regionalHostedZoneId: "test_id",
                },
            );

            await route53Wrapper.changeResourceRecordSet("UPSERT", dc);

            const expectedParams = {
                ChangeBatch: {
                    Changes: [
                        {
                            Action: "UPSERT",
                            ResourceRecordSet: {
                                AliasTarget: {
                                    DNSName: "test_regional_name",
                                    EvaluateTargetHealth: false,
                                    HostedZoneId: "test_id",
                                },
                                Name: "test_domain",
                                Type: "A",
                                Region: "eu-west-1",
                                SetIdentifier: "test_regional_name",
                            },
                        },
                        {
                            Action: "UPSERT",
                            ResourceRecordSet: {
                                AliasTarget: {
                                    DNSName: "test_regional_name",
                                    EvaluateTargetHealth: false,
                                    HostedZoneId: "test_id",
                                },
                                Name: "test_domain",
                                Type: "AAAA",
                                Region: "eu-west-1",
                                SetIdentifier: "test_regional_name",
                            },
                        },
                    ],
                    Comment: `Record created by "${Globals.pluginName}"`
                },
                HostedZoneId: "test_host_id"
            };
            Route53Mock.commandCalls(ChangeResourceRecordSetsCommand, expectedParams);
        });

        it("Should exclude weight, region, set identifier, and health input with simple routing", async () => {
            const Route53Mock = mockClient(Route53Client);
            Route53Mock.on(ListHostedZonesCommand).resolves({
                HostedZones: [{
                    CallerReference: "",
                    Config: {PrivateZone: false},
                    Id: "test_host_id",
                    Name: "test_domain",
                }],
            });
            Route53Mock.on(ChangeResourceRecordSetsCommand).resolves(null);

            const plugin = constructPlugin({
                basePath: "test_basepath",
                domainName: "test_domain",
                endpointType: "REGIONAL",
                route53Params: {
                    setIdentifier: "test_identifier",
                    weight: 100,
                }
            });
            const route53Wrapper = new Route53Wrapper();
            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.domainInfo = new DomainInfo(
                {
                    regionalDomainName: "test_regional_name",
                    regionalHostedZoneId: "test_id",
                },
            );

            await route53Wrapper.changeResourceRecordSet("UPSERT", dc);

            const expectedParams = {
                ChangeBatch: {
                    Changes: [
                        {
                            Action: "UPSERT",
                            ResourceRecordSet: {
                                AliasTarget: {
                                    DNSName: "test_regional_name",
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
                                    DNSName: "test_regional_name",
                                    EvaluateTargetHealth: false,
                                    HostedZoneId: "test_id",
                                },
                                Name: "test_domain",
                                Type: "AAAA",
                            },
                        },
                    ],
                    Comment: `Record created by "${Globals.pluginName}"`
                },
                HostedZoneId: "test_host_id"
            };
            Route53Mock.commandCalls(ChangeResourceRecordSetsCommand, expectedParams);
        });

        it("Should throw an Error when passing a routing policy that is not supported", async () => {
            const plugin = constructPlugin({route53Params: {routingPolicy: 'test_policy'}});

            let errored = false;
            try {
                await plugin.hookWrapper(null);
            } catch (err) {
                errored = true;
                expect(err.message).to.equal("test_policy is not a supported routing policy, use simple, latency, or weighted.");
            }
            expect(errored).to.equal(true);
        });

        it("Should throw an Error when using latency routing with edge endpoints", async () => {
            const plugin = constructPlugin({
                route53Params: {routingPolicy: "latency"}
            });

            let errored = false;
            try {
                await plugin.hookWrapper(null);
            } catch (err) {
                errored = true;
                expect(err.message).to.equal("latency routing is not intended to be used with edge endpoints. Use a regional endpoint instead.");
            }
            expect(errored).to.equal(true);
        });
    });
});

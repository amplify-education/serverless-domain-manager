import * as aws from "aws-sdk";
import * as AWS from "aws-sdk-mock";
import chai = require("chai");
import spies = require("chai-spies");
import "mocha";
import DomainConfig = require("../../src/domain-config");
import DomainInfo = require("../../src/domain-info");
import Globals from "../../src/globals";
import ServerlessCustomDomain = require("../../src/index");
import {getAWSPagedResults} from "../../src/utils";
import Route53Wrapper = require("../../src/aws/route53-wrapper");
import ACMWrapper = require("../../src/aws/acm-wrapper");

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

const constructPlugin = (customDomainOptions, multiple: boolean = false) => {
    aws.config.update(testCreds);
    aws.config.region = "eu-west-1";

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
        hostedZoneId: customDomainOptions.hostedZoneId,
        hostedZonePrivate: customDomainOptions.hostedZonePrivate,
        route53Profile: customDomainOptions.route53Profile,
        route53Region: customDomainOptions.route53Region,
        route53Params: customDomainOptions.route53Params,
        preserveExternalPathMappings: customDomainOptions.preserveExternalPathMappings,
        securityPolicy: customDomainOptions.securityPolicy,
        setupOnPackaging: customDomainOptions.setupOnPackaging,
        stage: customDomainOptions.stage
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
                getCredentials: () => new aws.Credentials(testCreds),
                getRegion: () => "eu-west-1",
                sdk: {
                    ACM: aws.ACM,
                    APIGateway: aws.APIGateway,
                    ApiGatewayV2: aws.ApiGatewayV2,
                    CloudFormation: aws.CloudFormation,
                    Route53: aws.Route53,
                    SharedIniFileCredentials: aws.SharedIniFileCredentials,
                    config: {
                        httpOptions: {
                            timeout: 5000,
                        },
                        update: (toUpdate: object) => null,
                    },
                },
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
                stage: "test",
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
    const options = {
        stage: "test",
    };
    return new ServerlessCustomDomain(serverless, options);
};

Globals.cliLog = (prefix: string, message: string) => {
    consoleOutput.push(message);
};

describe("Custom Domain Plugin", () => {
    it("Checks aws config", () => {
        const plugin = constructPlugin({});

        plugin.initAWSResources();

        const returnedCreds = plugin.apiGatewayWrapper.apiGateway.config.credentials;
        expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
        expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
    });

    describe("custom route53 profile", () => {
        it("uses the provided profile for route53", () => {
            const route53ProfileConfig = {
                route53Profile: "testroute53profile",
                route53Region: "area-53-zone",
            };
            const plugin = constructPlugin(route53ProfileConfig);

            plugin.initAWSResources();
            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            const route53Wrapper = new Route53Wrapper(dc.route53Profile, dc.route53Region);

            // @ts-ignore
            expect(route53Wrapper.route53.config.credentials.profile).to.equal(route53ProfileConfig.route53Profile);
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
                expect(err.message).to.equal("notSupported is not supported endpointType, use edge or regional.");
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
                expect(err.message).to.equal("'edge' endpointType is not compatible with HTTP APIs");
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
                expect(err.message).to.equal("'edge' endpointType is not compatible with WebSocket APIs");
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
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            dc.apiId = "test_rest_api_id";

            const spy = chai.spy.on(plugin.apiGatewayWrapper.apiGateway, "createBasePathMapping");

            await plugin.apiGatewayWrapper.createBasePathMapping(dc);

            expect(spy).to.have.been.called.with({
                basePath: "test_basepath",
                domainName: "test_domain",
                restApiId: "test_rest_api_id",
                stage: "test",
            });
        });

        it("Creates basepath mapping for regional tls 1.0 REST api", async () => {
            AWS.mock("APIGateway", "createBasePathMapping", (params, callback) => {
                callback(null, params);
            });
            const plugin = constructPlugin({
                basePath: "test_basepath",
                domainName: "test_domain",
                endpointType: "regional",
                securityPolicy: "tls_1_0",
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            dc.apiId = "test_rest_api_id";

            const spy = chai.spy.on(plugin.apiGatewayWrapper.apiGateway, "createBasePathMapping");

            await plugin.apiGatewayWrapper.createBasePathMapping(dc);

            expect(spy).to.have.been.called.with({
                basePath: "test_basepath",
                domainName: "test_domain",
                restApiId: "test_rest_api_id",
                stage: "test",
            });
        });

        it("Creates basepath mapping for regional tls 1.2 REST api", async () => {
            AWS.mock("ApiGatewayV2", "createApiMapping", (params, callback) => {
                callback(null, params);
            });
            const plugin = constructPlugin({
                basePath: "test_basepath",
                domainName: "test_domain",
                endpointType: "regional",
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            dc.apiId = "test_rest_api_id";

            const spy = chai.spy.on(plugin.apiGatewayWrapper.apiGatewayV2, "createApiMapping");

            await plugin.apiGatewayWrapper.createBasePathMapping(dc);

            expect(spy).to.have.been.called.with({
                ApiId: "test_rest_api_id",
                ApiMappingKey: "test_basepath",
                DomainName: "test_domain",
                Stage: "test",
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
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.apiId = "test_rest_api_id";

            const spy = chai.spy.on(plugin.apiGatewayWrapper.apiGatewayV2, "createApiMapping");

            await plugin.apiGatewayWrapper.createBasePathMapping(dc);
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
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.apiMapping = {ApiMappingKey: "old_basepath"};

            const spy = chai.spy.on(plugin.apiGatewayWrapper.apiGateway, "updateBasePathMapping");

            await plugin.apiGatewayWrapper.updateBasePathMapping(dc);
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
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            dc.apiId = "test_api_id";
            dc.apiMapping = {ApiMappingId: "test_mapping_id"};
            dc.domainInfo = new DomainInfo({
                DomainNameConfigurations: [{
                    ApiGatewayDomainName: "fake_dist_name",
                    HostedZoneId: "fake_zone_id",
                    SecurityPolicy: "TLS_1_2",
                }],
            });

            const spy = chai.spy.on(plugin.apiGatewayWrapper.apiGatewayV2, "updateApiMapping");

            await plugin.apiGatewayWrapper.updateBasePathMapping(dc);
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
                // @ts-ignore
                callback(null, {
                    StackResourceDetail: {
                        LogicalResourceId: "ApiGatewayRestApi",
                        PhysicalResourceId: "test_rest_api_id",
                    },
                });
            });
            AWS.mock("ApiGatewayV2", "getApiMappings", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    Items: [
                        {ApiId: "test_rest_api_id", MappingKey: "test", ApiMappingId: "test_mapping_id", Stage: "test"},
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
            plugin.initAWSResources();

            plugin.domains[0].apiMapping = {ApiMappingId: "test_mapping_id"};

            const spy = chai.spy.on(plugin.apiGatewayWrapper.apiGatewayV2, "deleteApiMapping");

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
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.apiId = "test_rest_api_id";

            const spy = chai.spy.on(plugin.apiGatewayWrapper.apiGateway, "createBasePathMapping");

            await plugin.apiGatewayWrapper.createBasePathMapping(dc);
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
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.apiId = "test_rest_api_id";

            const spy = chai.spy.on(plugin.apiGatewayWrapper.apiGateway, "createBasePathMapping");

            await plugin.apiGatewayWrapper.createBasePathMapping(dc);
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
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.apiId = "test_rest_api_id";

            const spy = chai.spy.on(plugin.apiGatewayWrapper.apiGateway, "createBasePathMapping");

            await plugin.apiGatewayWrapper.createBasePathMapping(dc);
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
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.apiId = "test_rest_api_id";

            const spy = chai.spy.on(plugin.apiGatewayWrapper.apiGateway, "createBasePathMapping");

            await plugin.apiGatewayWrapper.createBasePathMapping(dc);
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
            plugin.initializeVariables();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            const acm = new ACMWrapper(dc.endpointType);
            const result = await acm.getCertArn(dc);

            expect(result).to.equal("test_given_arn");
        });

        it("Get a given certificate name", async () => {
            AWS.mock("ACM", "listCertificates", certTestData);

            const plugin = constructPlugin({certificateName: "cert_name"});
            plugin.initializeVariables();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            const acm = new ACMWrapper(dc.endpointType);
            const result = await acm.getCertArn(dc);

            expect(result).to.equal("test_given_cert_name");
        });

        it("Create a domain name", async () => {
            AWS.mock("APIGateway", "createDomainName", (params, callback) => {
                callback(null, {distributionDomainName: "foo", securityPolicy: "TLS_1_2"});
            });

            const plugin = constructPlugin({domainName: "test_domain"});
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.certificateArn = "fake_cert";

            await plugin.apiGatewayWrapper.createCustomDomain(dc);

            expect(dc.domainInfo.domainName).to.equal("foo");
            expect(dc.domainInfo.securityPolicy).to.equal("TLS_1_2");
        });

        it("Create an HTTP domain name", async () => {
            AWS.mock("ApiGatewayV2", "createDomainName", (params, callback) => {
                callback(null, {DomainName: "foo", DomainNameConfigurations: [{SecurityPolicy: "TLS_1_2"}]});
            });

            const plugin = constructPlugin({domainName: "test_domain", apiType: "http", endpointType: "regional"});
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.certificateArn = "fake_cert";

            await plugin.apiGatewayWrapper.createCustomDomain(dc);

            expect(dc.domainInfo.domainName).to.equal("foo");
            expect(dc.domainInfo.securityPolicy).to.equal("TLS_1_2");
        });

        it("Create a domain name with specific TLS version", async () => {
            AWS.mock("APIGateway", "createDomainName", (params, callback) => {
                callback(null, {distributionDomainName: "foo", securityPolicy: "TLS_1_2"});
            });

            const plugin = constructPlugin({domainName: "test_domain", securityPolicy: "tls_1_2"});
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.certificateArn = "fake_cert";

            await plugin.apiGatewayWrapper.createCustomDomain(dc);

            expect(dc.domainInfo.domainName).to.equal("foo");
            expect(dc.domainInfo.securityPolicy).to.equal("TLS_1_2");
        });

        it("Create a domain name with tags", async () => {
            AWS.mock("APIGateway", "createDomainName", (params, callback) => {
                callback(null, {distributionDomainName: "foo", securityPolicy: "TLS_1_2"});
            });

            const plugin = constructPlugin({domainName: "test_domain"});
            plugin.initializeVariables();
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            dc.certificateArn = "fake_cert";

            const spy = chai.spy.on(plugin.apiGatewayWrapper.apiGateway, "createDomainName");
            await plugin.apiGatewayWrapper.createCustomDomain(dc);
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
            expect(spy).to.have.been.called.with(expectedParams);
        });

        it("Create new A and AAAA Alias Records", async () => {
            AWS.mock("Route53", "listHostedZones", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    HostedZones: [{
                        Config: {PrivateZone: false},
                        Id: "test_host_id",
                        Name: "test_domain",
                    }],
                });
            });

            AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
                // @ts-ignore
                callback(null, params);
            });

            const plugin = constructPlugin({basePath: "test_basepath", domainName: "test_domain"});
            const route53Wrapper = new Route53Wrapper();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            dc.domainInfo = new DomainInfo(
                {
                    distributionDomainName: "test_distribution_name",
                    distributionHostedZoneId: "test_id",
                },
            );

            const spy = chai.spy.on(route53Wrapper.route53, "changeResourceRecordSets");

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
            expect(spy).to.have.been.called.with(expectedParams);
        });

        it("Create new A Alias Record Only", async () => {
            AWS.mock("Route53", "listHostedZones", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    HostedZones: [{
                        Name: "test_domain",
                        Id: "test_host_id",
                        Config: {PrivateZone: false}
                    }]
                });
            });

            AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
                // @ts-ignore
                callback(null, params);
            });

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

            const spy = chai.spy.on(route53Wrapper.route53, "changeResourceRecordSets");

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
            expect(spy).to.have.been.called.with(expectedParams);
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

        afterEach(() => {
            AWS.restore();
            consoleOutput = [];
        });
    });

    describe("Gets existing basepath mappings correctly", () => {
        it("Returns current api mapping", async () => {
            AWS.mock("ApiGatewayV2", "getApiMappings", (params, callback) => {
                callback(null, {
                    Items: [
                        {ApiId: "test_rest_api_id", ApiMappingKey: "api", ApiMappingId: "fake_id", Stage: "test"},
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
            plugin.initAWSResources();

            const result = await plugin.apiGatewayWrapper.getApiMappings(dc);
            expect(result[0]).to.eql({
                ApiId: "test_rest_api_id",
                ApiMappingId: "fake_id",
                ApiMappingKey: "api",
                Stage: "test",
            });
        });

        afterEach(() => {
            AWS.restore();
            consoleOutput = [];
        });
    });

    describe("Gets Rest API id correctly", () => {
        it("Fetches REST API id correctly when no ApiGateway specified", async () => {
            AWS.mock("CloudFormation", "describeStacks", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    Stacks: [
                        {
                            StackName: "custom-stage-name-NestedStackOne-U89W84TQIHJK",
                            RootId: "arn:aws:cloudformation:us-east-1:000000000000:stack/custom-stage-name/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                        },
                        {
                            StackName: "custom-stage-name-NestedStackTwo-U89W84TQIHJK",
                            RootId: "arn:aws:cloudformation:us-east-1:000000000000:stack/custom-stage-name/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                        },
                        {
                            StackName: "outside-stack-NestedStackZERO-U89W84TQIHJK",
                            RootId: "arn:aws:cloudformation:us-east-1:000000000000:stack/outside-stack/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                        },
                    ],
                });
            });
            AWS.mock("CloudFormation", "describeStackResource", (params, callback) => {
                if (params.StackName === "custom-stage-name") {
                    throw new Error("error");
                }
                // @ts-ignore
                callback(null, {
                    StackResourceDetail: {
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
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            const spy = chai.spy.on(plugin.cloudFormationWrapper.cloudFormation, "describeStackResource");

            const result = await plugin.getApiId(dc);

            expect(result).to.equal("test_rest_api_id");
            expect(spy).to.have.been.called.exactly(2);
            expect(spy).to.have.been.called.with({
                LogicalResourceId: "ApiGatewayRestApi",
                StackName: "custom-stage-name-NestedStackOne-U89W84TQIHJK",
            });
        });

        it("Gets HTTP API id correctly when no ApiGateway specified", async () => {
            AWS.mock("CloudFormation", "describeStacks", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    Stacks: [
                        {
                            StackName: "custom-stage-name-NestedStackOne-U89W84TQIHJK",
                            RootId: "arn:aws:cloudformation:us-east-1:000000000000:stack/custom-stage-name/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                        },
                        {
                            StackName: "custom-stage-name-NestedStackTwo-U89W84TQIHJK",
                            RootId: "arn:aws:cloudformation:us-east-1:000000000000:stack/custom-stage-name/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                        },
                        {
                            StackName: "outside-stack-NestedStackZERO-U89W84TQIHJK",
                            RootId: "arn:aws:cloudformation:us-east-1:000000000000:stack/outside-stack/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                        },
                    ],
                });
            });
            AWS.mock("CloudFormation", "describeStackResource", (params, callback) => {
                if (params.StackName === "custom-stage-name") {
                    throw new Error("error");
                }
                // @ts-ignore
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
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            const spy = chai.spy.on(plugin.cloudFormationWrapper.cloudFormation, "describeStackResource");

            const result = await plugin.getApiId(dc);
            expect(result).to.equal("test_http_api_id");
            expect(spy).to.have.been.called.exactly(2);
            expect(spy).to.have.been.called.with({
                LogicalResourceId: "HttpApi",
                StackName: "custom-stage-name-NestedStackOne-U89W84TQIHJK",
            });
        });

        it("Gets Websocket API id correctly when no ApiGateway specified", async () => {
            AWS.mock("CloudFormation", "describeStacks", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    Stacks: [
                        {
                            StackName: "custom-stage-name-NestedStackOne-U89W84TQIHJK",
                            RootId: "arn:aws:cloudformation:us-east-1:000000000000:stack/custom-stage-name/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                        },
                        {
                            StackName: "custom-stage-name-NestedStackTwo-U89W84TQIHJK",
                            RootId: "arn:aws:cloudformation:us-east-1:000000000000:stack/custom-stage-name/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                        },
                        {
                            StackName: "custom-stage-name"
                        },
                    ],
                });
            });
            AWS.mock("CloudFormation", "describeStackResource", (params, callback) => {
                const skipNames = ["custom-stage-name", "custom-stage-name-NestedStackOne-U89W84TQIHJK"];
                if (skipNames.indexOf(params.StackName) !== -1) {
                    throw new Error("error");
                }
                // @ts-ignore
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
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            const spy = chai.spy.on(plugin.cloudFormationWrapper.cloudFormation, "describeStackResource");

            const result = await plugin.getApiId(dc);
            expect(result).to.equal("test_ws_api_id");
            expect(spy).to.have.been.called.exactly(3);
            expect(spy).to.have.been.called.with({
                LogicalResourceId: "WebsocketsApi",
                StackName: "custom-stage-name-NestedStackTwo-U89W84TQIHJK",
            });
        });

        it("serverless.yml defines explicitly the apiGateway", async () => {
            AWS.mock("CloudFormation", "describeStackResource", (params, callback) => {
                // @ts-ignore
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
            plugin.initAWSResources();
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
                callback(null, {distributionDomainName: "test_domain"});
            });

            const plugin = constructPlugin({
                basePath: "test_basepath",
                domainName: "test_domain",
            });

            for (const domain of plugin.domains) {
                domain.domainInfo = await plugin.apiGatewayWrapper.getCustomDomainInfo(domain);
                expect(domain.domainInfo.domainName).to.equal("test_domain");
            }
        });

        it("Delete A Alias Record", async () => {
            AWS.mock("Route53", "listHostedZones", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    HostedZones: [{
                        Config: {PrivateZone: false},
                        Id: "test_host_id",
                        Name: "test_domain",
                    }],
                });
            });

            AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
                // @ts-ignore
                callback(null, params);
            });

            const plugin = constructPlugin({
                basePath: "test_basepath",
                domainName: "test_domain",
            });
            const route53Wrapper = new Route53Wrapper();
            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);
            const spy = chai.spy.on(route53Wrapper.route53, "changeResourceRecordSets");

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
            plugin.initAWSResources();

            const dc: DomainConfig = new DomainConfig(plugin.serverless.service.custom.customDomain);

            const spy = chai.spy.on(plugin.apiGatewayWrapper.apiGatewayV2, "deleteDomainName");

            await plugin.apiGatewayWrapper.deleteCustomDomain(dc);
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
                    DomainName: "test_domain",
                    DomainNameConfigurations: [{ApiGatewayDomainName: "fake_dist_name"}],
                });
            });
            AWS.mock("ApiGatewayV2", "getApiMappings", (params, callback) => {
                callback(null, {Items: []});
            });
            AWS.mock("APIGateway", "createBasePathMapping", (params, callback) => {
                callback(null, params);
            });
            AWS.mock("CloudFormation", "describeStacks", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    Stacks: [
                        {
                            StackName: "custom-stage-name-NestedStackOne-U89W84TQIHJK",
                            RootId: "arn:aws:cloudformation:us-east-1:000000000000:stack/custom-stage-name/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                        },
                        {
                            StackName: "custom-stage-name-NestedStackTwo-U89W84TQIHJK",
                            RootId: "arn:aws:cloudformation:us-east-1:000000000000:stack/custom-stage-name/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                        },
                        {
                            StackName: "outside-stack-NestedStackZERO-U89W84TQIHJK",
                            RootId: "arn:aws:cloudformation:us-east-1:000000000000:stack/outside-stack/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                        },
                    ],
                });
            });
            AWS.mock("CloudFormation", "describeStackResource", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    StackResourceDetail:
                        {
                            LogicalResourceId: "ApiGatewayRestApi",
                            PhysicalResourceId: "test_rest_api_id",
                        },
                });
            });
            const plugin = constructPlugin({domainName: "test_domain"});
            plugin.initializeVariables();
            plugin.initAWSResources();

            const spy = chai.spy.on(plugin.apiGatewayWrapper, "createBasePathMapping");

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
                // @ts-ignore
                callback(null, {HostedZones: [{Name: "test_domain", Id: "test_id", Config: {PrivateZone: false}}]});
            });
            AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
                // @ts-ignore
                callback(null, params);
            });

            const plugin = constructPlugin({domainName: "test_domain"});
            plugin.initializeVariables();
            plugin.initAWSResources();

            await plugin.deleteDomains();
            expect(consoleOutput[0]).to.equal(`Custom domain ${plugin.domains[0].givenDomainName} was deleted.`);
        });

        it("createDomain if one does not exist before", async () => {
            AWS.mock("ACM", "listCertificates", certTestData);
            AWS.mock("ApiGatewayV2", "getDomainName", (params, callback) => {
                // @ts-ignore
                callback({code: "NotFoundException"}, {});
            });
            AWS.mock("APIGateway", "createDomainName", (params, callback) => {
                callback(null, {distributionDomainName: "foo", regionalHostedZoneId: "test_id"});
            });
            AWS.mock("Route53", "listHostedZones", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    HostedZones: [{Name: "test_domain", Id: "test_id", Config: {PrivateZone: false}}],
                });
            });
            AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
                // @ts-ignore
                callback(null, params);
            });

            const plugin = constructPlugin({domainName: "test_domain"});
            plugin.initializeVariables();
            plugin.initializeVariables();
            plugin.initAWSResources();

            await plugin.createDomains();
            expect(consoleOutput[0]).to.contains("test_domain does not exist")
            expect(consoleOutput[1]).to.contains(
                `Custom domain ${plugin.domains[0].givenDomainName} was created.`
            );
        });

        it("Does not create domain if one existed before", async () => {
            AWS.mock("ACM", "listCertificates", certTestData);
            AWS.mock("ApiGatewayV2", "getDomainName", (params, callback) => {
                callback(null, {DomainName: "test_domain", DomainNameConfigurations: [{HostedZoneId: "test_id"}]});
            });
            AWS.mock("APIGateway", "createDomainName", (params, callback) => {
                callback(null, {distributionDomainName: "foo", regionalHostedZoneId: "test_id"});
            });
            AWS.mock("Route53", "listHostedZones", (params, callback) => {
                // @ts-ignore
                callback(null, {HostedZones: [{Name: "test_domain", Id: "test_id", Config: {PrivateZone: false}}]});
            });
            AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
                // @ts-ignore
                callback(null, params);
            });

            const plugin = constructPlugin({domainName: "test_domain"});
            plugin.initializeVariables();
            plugin.initAWSResources();
            plugin.initializeVariables();
            await plugin.createDomains();
            expect(consoleOutput[0]).to.equal(`Custom domain test_domain already exists.`);
            expect(consoleOutput[1]).to.contains(`Custom domain test_domain was created.`);
        });

        afterEach(() => {
            AWS.restore();
            consoleOutput = [];
        });
    });

    describe("Select Hosted Zone", () => {
        it("Natural order", async () => {
            AWS.mock("Route53", "listHostedZones", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    HostedZones: [
                        {Name: "aaa.com.", Id: "/hostedzone/test_id_0", Config: {PrivateZone: false}},
                        {Name: "bbb.aaa.com.", Id: "/hostedzone/test_id_1", Config: {PrivateZone: false}},
                        {Name: "ccc.bbb.aaa.com.", Id: "/hostedzone/test_id_2", Config: {PrivateZone: false}},
                        {Name: "ddd.ccc.bbb.aaa.com.", Id: "/hostedzone/test_id_3", Config: {PrivateZone: false}},
                    ],
                });
            });

            const plugin = constructPlugin({domainName: "ccc.bbb.aaa.com"});
            plugin.initializeVariables();

            const route53Wrapper = new Route53Wrapper();
            const result = await route53Wrapper.getRoute53HostedZoneId(plugin.domains[0]);

            expect(result).to.equal("test_id_2");
        });

        it("Reverse order", async () => {
            AWS.mock("Route53", "listHostedZones", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    HostedZones: [
                        {Name: "ddd.ccc.bbb.aaa.com.", Id: "/hostedzone/test_id_0", Config: {PrivateZone: false}},
                        {Name: "ccc.bbb.aaa.com.", Id: "/hostedzone/test_id_1", Config: {PrivateZone: false}},
                        {Name: "bbb.aaa.com.", Id: "/hostedzone/test_id_2", Config: {PrivateZone: false}},
                        {Name: "aaa.com.", Id: "/hostedzone/test_id_3", Config: {PrivateZone: false}},
                    ],
                });
            });

            const plugin = constructPlugin({domainName: "test.ccc.bbb.aaa.com"});
            plugin.initializeVariables();

            const route53Wrapper = new Route53Wrapper();
            const result = await route53Wrapper.getRoute53HostedZoneId(plugin.domains[0]);

            expect(result).to.equal("test_id_1");
        });

        it("Random order", async () => {
            AWS.mock("Route53", "listHostedZones", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    HostedZones: [
                        {Name: "bbb.aaa.com.", Id: "/hostedzone/test_id_0", Config: {PrivateZone: false}},
                        {Name: "ddd.ccc.bbb.aaa.com.", Id: "/hostedzone/test_id_1", Config: {PrivateZone: false}},
                        {Name: "ccc.bbb.aaa.com.", Id: "/hostedzone/test_id_2", Config: {PrivateZone: false}},
                        {Name: "aaa.com.", Id: "/hostedzone/test_id_3", Config: {PrivateZone: false}},
                    ],
                });
            });

            const plugin = constructPlugin({domainName: "test.ccc.bbb.aaa.com"});
            plugin.initializeVariables();

            const route53Wrapper = new Route53Wrapper();
            const result = await route53Wrapper.getRoute53HostedZoneId(plugin.domains[0]);

            expect(result).to.equal("test_id_2");
        });

        it("Sub domain name - only root hosted zones", async () => {
            AWS.mock("Route53", "listHostedZones", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    HostedZones: [
                        {Name: "aaa.com.", Id: "/hostedzone/test_id_0", Config: {PrivateZone: false}},
                        {Name: "bbb.fr.", Id: "/hostedzone/test_id_1", Config: {PrivateZone: false}},
                        {Name: "ccc.com.", Id: "/hostedzone/test_id_3", Config: {PrivateZone: false}},
                    ],
                });
            });

            const plugin = constructPlugin({domainName: "bar.foo.bbb.fr"});
            plugin.initializeVariables();

            const route53Wrapper = new Route53Wrapper();
            const result = await route53Wrapper.getRoute53HostedZoneId(plugin.domains[0]);

            expect(result).to.equal("test_id_1");
        });

        it("With matching root and sub hosted zone", async () => {
            AWS.mock("Route53", "listHostedZones", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    HostedZones: [
                        {Name: "a.aaa.com.", Id: "/hostedzone/test_id_0", Config: {PrivateZone: false}},
                        {Name: "aaa.com.", Id: "/hostedzone/test_id_1", Config: {PrivateZone: false}},
                    ],
                });
            });

            const plugin = constructPlugin({domainName: "test.a.aaa.com"});
            plugin.initializeVariables();

            const route53Wrapper = new Route53Wrapper();
            const result = await route53Wrapper.getRoute53HostedZoneId(plugin.domains[0]);

            expect(result).to.equal("test_id_0");
        });

        it("Sub domain name - natural order", async () => {
            AWS.mock("Route53", "listHostedZones", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    HostedZones: [
                        {Name: "aaa.com.", Id: "/hostedzone/test_id_0", Config: {PrivateZone: false}},
                        {Name: "bbb.fr.", Id: "/hostedzone/test_id_1", Config: {PrivateZone: false}},
                        {Name: "foo.bbb.fr.", Id: "/hostedzone/test_id_3", Config: {PrivateZone: false}},
                        {Name: "ccc.com.", Id: "/hostedzone/test_id_4", Config: {PrivateZone: false}},
                    ],
                });
            });

            const plugin = constructPlugin({domainName: "bar.foo.bbb.fr"});
            plugin.initializeVariables();

            const route53Wrapper = new Route53Wrapper();
            const result = await route53Wrapper.getRoute53HostedZoneId(plugin.domains[0]);

            expect(result).to.equal("test_id_3");
        });

        it("Sub domain name - reverse order", async () => {
            AWS.mock("Route53", "listHostedZones", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    HostedZones: [
                        {Name: "foo.bbb.fr.", Id: "/hostedzone/test_id_3", Config: {PrivateZone: false}},
                        {Name: "bbb.fr.", Id: "/hostedzone/test_id_1", Config: {PrivateZone: false}},
                        {Name: "ccc.com.", Id: "/hostedzone/test_id_4", Config: {PrivateZone: false}},
                        {Name: "aaa.com.", Id: "/hostedzone/test_id_0", Config: {PrivateZone: false}},
                    ],
                });
            });

            const plugin = constructPlugin({domainName: "bar.foo.bbb.fr"});
            plugin.initializeVariables();

            const route53Wrapper = new Route53Wrapper();
            const result = await route53Wrapper.getRoute53HostedZoneId(plugin.domains[0]);

            expect(result).to.equal("test_id_3");
        });

        it("Sub domain name - random order", async () => {
            AWS.mock("Route53", "listHostedZones", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    HostedZones: [
                        {Name: "bbb.fr.", Id: "/hostedzone/test_id_1", Config: {PrivateZone: false}},
                        {Name: "aaa.com.", Id: "/hostedzone/test_id_0", Config: {PrivateZone: false}},
                        {Name: "foo.bbb.fr.", Id: "/hostedzone/test_id_3", Config: {PrivateZone: false}},
                    ],
                });
            });

            const plugin = constructPlugin({domainName: "bar.foo.bbb.fr"});
            plugin.initializeVariables();

            const route53Wrapper = new Route53Wrapper();
            const result = await route53Wrapper.getRoute53HostedZoneId(plugin.domains[0]);

            expect(result).to.equal("test_id_3");
        });

        it("Private zone domain name", async () => {
            AWS.mock("Route53", "listHostedZones", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    HostedZones: [
                        {Name: "aaa.com.", Id: "/hostedzone/test_id_1", Config: {PrivateZone: false}},
                        {Name: "aaa.com.", Id: "/hostedzone/test_id_0", Config: {PrivateZone: true}}],
                });
            });

            const plugin = constructPlugin({domainName: "aaa.com", hostedZonePrivate: true});
            plugin.initializeVariables();

            const route53Wrapper = new Route53Wrapper();
            const result = await route53Wrapper.getRoute53HostedZoneId(plugin.domains[0]);

            expect(result).to.equal("test_id_0");
        });

        it("Undefined hostedZonePrivate should still allow private domains", async () => {
            AWS.mock("Route53", "listHostedZones", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    HostedZones: [
                        {Name: "aaa.com.", Id: "/hostedzone/test_id_0", Config: {PrivateZone: true}},
                    ],
                });
            });

            const plugin = constructPlugin({domainName: "aaa.com"});
            plugin.initializeVariables();

            const route53Wrapper = new Route53Wrapper();
            const result = await route53Wrapper.getRoute53HostedZoneId(plugin.domains[0]);

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
            plugin.initializeVariables();
            const domain = plugin.domains[0];
            const acm = new ACMWrapper(domain.endpointType);

            return acm.getCertArn(domain).then(() => {
                throw new Error("Test has failed. getCertArn did not catch errors.");
            }).catch((err) => {
                const expectedErrorMessage = "Could not find the certificate does_not_exist.";
                expect(err.message).to.equal(expectedErrorMessage);
            });
        });

        it("Fail getHostedZone", async () => {
            AWS.mock("Route53", "listHostedZones", (params, callback) => {
                // @ts-ignore
                callback(null, {HostedZones: [{Name: "no_hosted_zone", Id: "test_id"}]});
            });

            const plugin = constructPlugin({domainName: "test_domain"});
            plugin.initializeVariables();

            const route53Wrapper = new Route53Wrapper();

            return route53Wrapper.getRoute53HostedZoneId(plugin.domains[0]).then(() => {
                throw new Error("Test has failed, getHostedZone did not catch errors.");
            }).catch((err) => {
                const expectedErrorMessage = "Could not find hosted zone \"test_domain\"";
                expect(err.message).to.equal(expectedErrorMessage);
            });
        });

        it("Domain summary failed", async () => {
            AWS.mock("ApiGatewayV2", "getDomainName", (params, callback) => {
                callback(null, null);
            });
            const plugin = constructPlugin({domainName: "test_domain"});
            plugin.initializeVariables();
            plugin.initAWSResources();

            return plugin.domainSummaries().then(() => {
                // check if distribution domain name is printed
            }).catch((err) => {
                const expectedErrorMessage = `Unable to fetch information about test_domain`;
                expect(err.message).to.contains(expectedErrorMessage);
            });
        });

        it("Should log if SLS_DEBUG is set", async () => {
            const plugin = constructPlugin({domainName: "test_domain"});
            plugin.initializeVariables();

            // set sls debug to true
            process.env.SLS_DEBUG = "True";
            Globals.logError("test message");
            expect(consoleOutput[0]).to.contain("test message");
        });

        it("Should not log if SLS_DEBUG is not set", async () => {
            const plugin = constructPlugin({domainName: "test_domain"});
            plugin.initializeVariables();

            Globals.logError("test message");
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
                // @ts-ignore
                callback(null, {domainName: params, distributionDomainName: "test_distributed_domain_name"});
            });
            const plugin = constructPlugin({domainName: "test_domain"});
            plugin.initializeVariables();
            plugin.initAWSResources();

            await plugin.domainSummaries();
            expect(consoleOutput[0]).to.contain("Distribution Domain Name");
            expect(consoleOutput[1]).to.contain("test_domain");
            expect(consoleOutput[2]).to.contain("test_distributed_domain_name");
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
            plugin.initAWSResources();

            const returnedCreds = plugin.apiGatewayWrapper.apiGateway.config.credentials;
            expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
            expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
            expect(plugin.domains).length.to.be.greaterThan(0);
            for (const domain of plugin.domains) {
                expect(domain.enabled).to.equal(true);
            }
        });

        it("Should enable the plugin when passing a true parameter with type boolean", () => {
            const plugin = constructPlugin({enabled: true});

            plugin.initializeVariables();
            plugin.initAWSResources();

            const returnedCreds = plugin.apiGatewayWrapper.apiGateway.config.credentials;
            expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
            expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
            expect(plugin.domains).length.to.be.greaterThan(0);
            for (const domain of plugin.domains) {
                expect(domain.enabled).to.equal(true);
            }
        });

        it("Should enable the plugin when passing a true parameter with type string", () => {
            const plugin = constructPlugin({enabled: "true"});

            plugin.initializeVariables();
            plugin.initAWSResources();

            const returnedCreds = plugin.apiGatewayWrapper.apiGateway.config.credentials;
            expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
            expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
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
            const plugin = constructPlugin({enabled: 0});

            let errored = false;
            try {
                await plugin.hookWrapper(null);
            } catch (err) {
                errored = true;
                expect(err.message).to.equal(`${Globals.pluginName}: Ambiguous boolean config: \"0\"`);
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

        afterEach(() => {
            consoleOutput = [];
        });
    });

    describe("Hook Configuration", () => {
        it("Should configure setUpBasePathMapping hook to after:deploy:deploy by default", async () => {
            const plugin = constructPlugin({});
            expect(plugin.hooks).to.have.property("after:deploy:deploy");
        });

        it("Should configure setUpBasePathMapping hook to after:deploy:deploy when passing a false parameter", async () => {
            const plugin = constructPlugin({setupOnPackaging: false});
            expect(plugin.hooks).to.have.property("after:deploy:deploy");
        });

        it("Should configure setUpBasePathMapping hook to after:package:finalize when passing a true parameter",
            async () => {
                const plugin = constructPlugin({setupOnPackaging: true});
                expect(plugin.hooks).to.have.property("after:package:finalize");
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
            const plugin = constructPlugin({}, true);
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

    describe("AWS paged results", () => {
        it("Should combine paged results into a list", async () => {
            let callCount = 0;
            const responses = [{
                Items: ["a", "b"],
                NextToken: "1",
            },
                {
                    Items: ["c", "d"],
                    NextToken: "2",
                },
                {
                    Items: ["e"],
                },
                {
                    Items: ["f"],
                    // this call should never happen since its after the last request that included a token
                }];
            AWS.mock("ApiGatewayV2", "getApiMappings", (params, callback) => {
                // @ts-ignore
                callback(null, responses[callCount++]);
            });

            const plugin = constructPlugin({});
            const results = await getAWSPagedResults(
                new aws.ApiGatewayV2(),
                "getApiMappings",
                "Items",
                "NextToken",
                "NextToken",
                {DomainName: "example.com"},
            );
            expect(results).to.deep.equal(["a", "b", "c", "d", "e"]);
            AWS.restore();
        });
    });

    describe("autoDomain deploy", () => {
        it("Should be disabled by default", () => {
            const plugin = constructPlugin({domainName: "test_domain"});
            plugin.initializeVariables();
            expect(plugin.serverless.service.custom.customDomain.autoDomain).to.equal(undefined);
        });

        it("createOrGetDomainForCfOutputs should call createDomain when autoDomain is true", async () => {
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
            plugin.initAWSResources();

            plugin.domains[0].apiMapping = {ApiMappingId: "test_mapping_id"};

            const spy = chai.spy.on(plugin.apiGatewayWrapper.apiGatewayV2, "getDomainName");

            await plugin.createOrGetDomainForCfOutputs();

            expect(plugin.serverless.service.custom.customDomain.autoDomain).to.equal(true);
            expect(spy).to.have.been.called();
        });

        it("createOrGetDomainForCfOutputs should not call createDomain when autoDomain is not true", async () => {
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
            plugin.initAWSResources();

            plugin.domains[0].apiMapping = {ApiMappingId: "test_mapping_id"};

            const spy1 = chai.spy.on(plugin.apiGatewayWrapper.apiGateway, "createDomainName");
            const spy2 = chai.spy.on(plugin.apiGatewayWrapper.apiGatewayV2, "createDomainName");

            await plugin.createOrGetDomainForCfOutputs();

            expect(plugin.serverless.service.custom.customDomain.autoDomain).to.equal(false);
            expect(spy1).to.have.not.been.called();
            expect(spy2).to.have.not.been.called();
        });

        it("removeBasePathMapping should call deleteDomain when autoDomain is true", async () => {
            AWS.mock("CloudFormation", "describeStackResource", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    StackResourceDetail:
                        {
                            LogicalResourceId: "ApiGatewayRestApi",
                            PhysicalResourceId: "test_rest_api_id",
                        },
                });
            });
            AWS.mock("ApiGatewayV2", "getApiMappings", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    Items: [
                        {ApiId: "test_rest_api_id", MappingKey: "test", ApiMappingId: "test_mapping_id", Stage: "test"},
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
            plugin.initAWSResources();

            plugin.domains[0].apiMapping = {ApiMappingId: "test_mapping_id"};

            const spy = chai.spy.on(plugin.apiGatewayWrapper.apiGatewayV2, "deleteDomainName");

            await plugin.removeBasePathMappings();

            expect(plugin.serverless.service.custom.customDomain.autoDomain).to.equal(true);
            expect(spy).to.have.been.called.with({DomainName: "test_domain"});
        });

        it("removeBasePathMapping should not call deleteDomain when autoDomain is not true", async () => {
            AWS.mock("CloudFormation", "describeStackResource", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    StackResourceDetail:
                        {
                            LogicalResourceId: "ApiGatewayRestApi",
                            PhysicalResourceId: "test_rest_api_id",
                        },
                });
            });
            AWS.mock("ApiGatewayV2", "getApiMappings", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    Items: [
                        {ApiId: "test_rest_api_id", MappingKey: "test", ApiMappingId: "test_mapping_id", Stage: "test"},
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
            plugin.initAWSResources();

            plugin.domains[0].apiMapping = {ApiMappingId: "test_mapping_id"};

            const spy = chai.spy.on(plugin.apiGatewayWrapper.apiGatewayV2, "deleteDomainName");

            await plugin.removeBasePathMappings();

            expect(plugin.serverless.service.custom.customDomain.autoDomain).to.equal(false);
            expect(spy).to.have.not.been.called();
        });

        it("removeBasePathMapping should not call deleteDomain when preserveExternalPathMappings is true and " +
            "external mappings exist", async () => {
            AWS.mock("CloudFormation", "describeStackResource", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    StackResourceDetail:
                        {
                            LogicalResourceId: "ApiGatewayRestApi",
                            PhysicalResourceId: "test_rest_api_id",
                        },
                });
            });
            AWS.mock("ApiGatewayV2", "getApiMappings", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    Items: [
                        {ApiId: "test_rest_api_id", MappingKey: "test", ApiMappingId: "test_mapping_id", Stage: "test"},
                        {
                            ApiId: "test_rest_api_id_2",
                            ApiMappingId: "test_mapping_id",
                            MappingKey: "test",
                            Stage: "test",
                        },
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
                preserveExternalPathMappings: true,
                restApiId: "test_rest_api_id",
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            plugin.domains[0].apiMapping = {ApiMappingId: "test_mapping_id"};

            const spy = chai.spy.on(plugin.apiGatewayWrapper.apiGatewayV2, "deleteDomainName");

            await plugin.removeBasePathMappings();

            expect(plugin.serverless.service.custom.customDomain.autoDomain).to.equal(true);
            expect(plugin.serverless.service.custom.customDomain.preserveExternalPathMappings).to.equal(true);
            expect(spy).to.have.not.been.called();
        });

        it("removeBasePathMapping should call deleteDomain when preserveExternalPathMappings is true and " +
            "external mappings don't exist", async () => {
            AWS.mock("CloudFormation", "describeStackResource", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    StackResourceDetail:
                        {
                            LogicalResourceId: "ApiGatewayRestApi",
                            PhysicalResourceId: "test_rest_api_id",
                        },
                });
            });
            AWS.mock("ApiGatewayV2", "getApiMappings", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    Items: [
                        {ApiId: "test_rest_api_id", MappingKey: "test", ApiMappingId: "test_mapping_id", Stage: "test"},
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
                preserveExternalPathMappings: true,
                restApiId: "test_rest_api_id",
            });
            plugin.initializeVariables();
            plugin.initAWSResources();

            plugin.domains[0].apiMapping = {ApiMappingId: "test_mapping_id"};

            const spy = chai.spy.on(plugin.apiGatewayWrapper.apiGatewayV2, "deleteDomainName");

            await plugin.removeBasePathMappings();

            expect(plugin.serverless.service.custom.customDomain.autoDomain).to.equal(true);
            expect(plugin.serverless.service.custom.customDomain.preserveExternalPathMappings).to.equal(true);
            expect(spy).to.have.been.called();
        });

        afterEach(() => {
            AWS.restore();
            consoleOutput = [];
        });
    });

    describe("Route53 Routing Policies", () => {
        it("Should create a new Alias Record with latency routing", async () => {
            AWS.mock("Route53", "listHostedZones", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    HostedZones: [{
                        Config: {PrivateZone: false},
                        Id: "test_host_id",
                        Name: "test_domain",
                    }],
                });
            });

            AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
                // @ts-ignore
                callback(null, params);
            });

            const plugin = constructPlugin({
                basePath: "test_basepath",
                domainName: "test_domain",
                endpointType: "regional",
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

            const spy = chai.spy.on(route53Wrapper.route53, "changeResourceRecordSets");

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
            expect(spy).to.have.been.called.with(expectedParams);
        });

        it("Should create a new Alias Record with weighted routing", async () => {
            AWS.mock("Route53", "listHostedZones", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    HostedZones: [{
                        Config: {PrivateZone: false},
                        Id: "test_host_id",
                        Name: "test_domain",
                    }],
                });
            });

            AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
                // @ts-ignore
                callback(null, params);
            });

            const plugin = constructPlugin({
                basePath: "test_basepath",
                domainName: "test_domain",
                endpointType: "regional",
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

            const spy = chai.spy.on(route53Wrapper.route53, "changeResourceRecordSets");

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
            expect(spy).to.have.been.called.with(expectedParams);
        });

        it("Should exclude weight input with latency routing", async () => {
            AWS.mock("Route53", "listHostedZones", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    HostedZones: [{
                        Config: {PrivateZone: false},
                        Id: "test_host_id",
                        Name: "test_domain",
                    }],
                });
            });

            AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
                // @ts-ignore
                callback(null, params);
            });

            const plugin = constructPlugin({
                basePath: "test_basepath",
                domainName: "test_domain",
                endpointType: "regional",
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

            const spy = chai.spy.on(route53Wrapper.route53, "changeResourceRecordSets");

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
            expect(spy).to.have.been.called.with(expectedParams);
        });

        it("Should exclude weight, region, set identifier, and health input with simple routing", async () => {
            AWS.mock("Route53", "listHostedZones", (params, callback) => {
                // @ts-ignore
                callback(null, {
                    HostedZones: [{
                        Config: {PrivateZone: false},
                        Id: "test_host_id",
                        Name: "test_domain",
                    }],
                });
            });

            AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
                // @ts-ignore
                callback(null, params);
            });

            const plugin = constructPlugin({
                basePath: "test_basepath",
                domainName: "test_domain",
                endpointType: "regional",
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

            const spy = chai.spy.on(route53Wrapper.route53, "changeResourceRecordSets");

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
            expect(spy).to.have.been.called.with(expectedParams);
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

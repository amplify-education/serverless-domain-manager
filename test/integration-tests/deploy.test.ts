import chai = require("chai");
import "mocha";
import itParam = require("mocha-param");

import utilities = require("./test-utilities");
import {TestDomain, UrlPrefix} from "./base";// tslint:disable-line

const expect = chai.expect;
const CONFIGS_FOLDER = "deploy";
const TIMEOUT_MINUTES = 10 * 60 * 1000; // 10 minutes in milliseconds

const testCases = [
    {
        testBasePath: "(none)",
        testDescription: "Creates domain as part of deploy",
        testDomain: `${UrlPrefix}-auto-domain.${TestDomain}`,
        testEndpoint: "EDGE",
        testFolder: `${CONFIGS_FOLDER}/auto-domain`,
        testStage: "test",
    },
    {
        testBasePath: "(none)",
        testDescription: "Enabled with default values",
        testDomain: `${UrlPrefix}-enabled-default.${TestDomain}`,
        testEndpoint: "EDGE",
        testFolder: `${CONFIGS_FOLDER}/enabled-default`,
        testStage: "test",
    },
    {
        createApiGateway: true,
        restApiName: "rest-api-custom",
        testBasePath: "(none)",
        testDescription: "Enabled with custom api gateway",
        testDomain: `${UrlPrefix}-enabled-custom-apigateway.${TestDomain}`,
        testEndpoint: "EDGE",
        testFolder: `${CONFIGS_FOLDER}/enabled-custom-apigateway`,
        testStage: "test",
    },
    {
        testBasePath: "api",
        testDescription: "Enabled with custom basepath",
        testDomain: `${UrlPrefix}-enabled-basepath.${TestDomain}`,
        testEndpoint: "EDGE",
        testFolder: `${CONFIGS_FOLDER}/enabled-basepath`,
        testStage: "test",
    },
    {
        testBasePath: "(none)",
        testDescription: "Enabled with custom stage and empty basepath",
        testDomain: `${UrlPrefix}-enabled-stage-basepath.${TestDomain}`,
        testEndpoint: "EDGE",
        testFolder: `${CONFIGS_FOLDER}/enabled-stage-basepath`,
        testStage: "test",
    },
    {
        testBasePath: "api",
        testDescription: "Enabled with regional endpoint, custom basePath",
        testDomain: `${UrlPrefix}-enabled-regional-basepath.${TestDomain}`,
        testEndpoint: "REGIONAL",
        testFolder: `${CONFIGS_FOLDER}/enabled-regional-basepath`,
        testStage: "test",
    },
    {
        testBasePath: "(none)",
        testDescription: "Enabled with regional endpoint, custom stage, empty basepath",
        testDomain: `${UrlPrefix}-enabled-regional-stage-basepath.${TestDomain}`,
        testEndpoint: "REGIONAL",
        testFolder: `${CONFIGS_FOLDER}/enabled-regional-stage-basepath`,
        testStage: "test",
    },
    {
        testBasePath: "(none)",
        testDescription: "Create Web socket API and domain name",
        testDomain: `${UrlPrefix}-web-socket.${TestDomain}`,
        testEndpoint: "REGIONAL",
        testFolder: `${CONFIGS_FOLDER}/web-socket`,
        testStage: "test",
    },
    {
        testBasePath: "(none)",
        testDescription: "Create HTTP API and domain name",
        testDomain: `${UrlPrefix}-http-api.${TestDomain}`,
        testEndpoint: "REGIONAL",
        testFolder: `${CONFIGS_FOLDER}/http-api`,
        testStage: "$default",
    },
    {
        testBasePath: "(none)",
        testDescription: "Deploy regional domain with TLS 1.0",
        testDomain: `${UrlPrefix}-regional-tls-1-0.${TestDomain}`,
        testEndpoint: "REGIONAL",
        testFolder: `${CONFIGS_FOLDER}/regional-tls-1-0`,
        testStage: "test",
    },
    {
        testBasePath: "api",
        testDescription: "Deploy with nested CloudFormation stack",
        testDomain: `${UrlPrefix}-basepath-nested-stack.${TestDomain}`,
        testEndpoint: "EDGE",
        testFolder: `${CONFIGS_FOLDER}/basepath-nested-stack`,
        testStage: "test",
    },
    {
        testBasePath: "(none)",
        testDescription: "Deploy with latency routing",
        testDomain: `${UrlPrefix}-route-53-latency-routing.${TestDomain}`,
        testEndpoint: "REGIONAL",
        testFolder: `${CONFIGS_FOLDER}/route-53-latency-routing`,
        testStage: "test",
    },
    {
        testBasePath: "(none)",
        testDescription: "Deploy with weighted routing",
        testDomain: `${UrlPrefix}-route-53-weighted-routing.${TestDomain}`,
        testEndpoint: "REGIONAL",
        testFolder: `${CONFIGS_FOLDER}/route-53-weighted-routing`,
        testStage: "test",
    },
];

describe("Integration Tests", function() {
    this.timeout(TIMEOUT_MINUTES);

    describe("Configuration Tests", () => {
        // @ts-ignore
        itParam("${value.testDescription}", testCases, async (value) => {
            let restApiInfo;
            if (value.createApiGateway) {
                restApiInfo = await utilities.setupApiGatewayResources(value.restApiName);
            }
            try {
                await utilities.createResources(value.testFolder, value.testDomain);
                const stage = await utilities.getStage(value.testDomain);
                expect(stage).to.equal(value.testStage);

                const basePath = await utilities.getBasePath(value.testDomain);
                expect(basePath).to.equal(value.testBasePath);

                const endpoint = await utilities.getEndpointType(value.testDomain);
                expect(endpoint).to.equal(value.testEndpoint);
            } finally {
                await utilities.destroyResources(value.testDomain);
                if (value.createApiGateway) {
                    await utilities.deleteApiGatewayResources(restApiInfo.restApiId);
                }
            }
        });
    });
});

import "mocha";
import chai = require("chai");
import itParam = require("mocha-param");
import utilities = require("../test-utilities");
import APIGatewayWrap from "../apigateway";
import { TEST_DOMAIN, PLUGIN_IDENTIFIER, RANDOM_STRING } from "../base";

const expect = chai.expect;
const CONFIGS_FOLDER = "deploy";
const TIMEOUT_MINUTES = 10 * 60 * 1000; // 10 minutes in milliseconds
// the us-west-2 is set in each test config
const apiGatewayClient = new APIGatewayWrap("us-west-2");

const testCases = [
  {
    testBasePath: "(none)",
    testDescription: "Creates domain as part of deploy",
    testDomain: `${PLUGIN_IDENTIFIER}-auto-domain-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "EDGE",
    testFolder: `${CONFIGS_FOLDER}/auto-domain`,
    testStage: "test",
    isPrivate: false
  },
  {
    testBasePath: "(none)",
    testDescription: "Enabled with default values",
    testDomain: `${PLUGIN_IDENTIFIER}-default-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "EDGE",
    testFolder: `${CONFIGS_FOLDER}/default`,
    testStage: "test",
    isPrivate: false
  },
  {
    restApiName: "rest-api-custom",
    testBasePath: "(none)",
    testDescription: "Enabled with custom api gateway",
    testDomain: `${PLUGIN_IDENTIFIER}-custom-apigateway-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "EDGE",
    testFolder: `${CONFIGS_FOLDER}/custom-apigateway`,
    testStage: "test",
    isPrivate: false
  },
  {
    testBasePath: "api",
    testDescription: "Enabled with custom basepath",
    testDomain: `${PLUGIN_IDENTIFIER}-basepath-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "EDGE",
    testFolder: `${CONFIGS_FOLDER}/basepath`,
    testStage: "test",
    isPrivate: false
  },
  {
    testBasePath: "(none)",
    testDescription: "Enabled with custom stage and empty basepath",
    testDomain: `${PLUGIN_IDENTIFIER}-stage-basepath-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "EDGE",
    testFolder: `${CONFIGS_FOLDER}/stage-basepath`,
    testStage: "test",
    isPrivate: false
  },
  {
    testBasePath: "api",
    testDescription: "Enabled with regional endpoint, custom basePath",
    testDomain: `${PLUGIN_IDENTIFIER}-regional-basepath-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "REGIONAL",
    testFolder: `${CONFIGS_FOLDER}/regional-basepath`,
    testStage: "test",
    isPrivate: false
  },
  {
    testBasePath: "(none)",
    testDescription: "Enabled with regional endpoint, custom stage, empty basepath",
    testDomain: `${PLUGIN_IDENTIFIER}-regional-stage-basepath-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "REGIONAL",
    testFolder: `${CONFIGS_FOLDER}/regional-stage-basepath`,
    testStage: "test",
    isPrivate: false
  },
  {
    testBasePath: "(none)",
    testDescription: "Create Web socket API and domain name",
    testDomain: `${PLUGIN_IDENTIFIER}-web-socket-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "REGIONAL",
    testFolder: `${CONFIGS_FOLDER}/web-socket`,
    testStage: "test",
    isPrivate: false
  },
  {
    testBasePath: "(none)",
    testDescription: "Create HTTP API and domain name",
    testDomain: `${PLUGIN_IDENTIFIER}-http-api-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "REGIONAL",
    testFolder: `${CONFIGS_FOLDER}/http-api`,
    testStage: "$default",
    isPrivate: false
  },
  {
    testBasePath: "(none)",
    testDescription: "Deploy regional domain with TLS 1.0",
    testDomain: `${PLUGIN_IDENTIFIER}-regional-tls-1-0-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "REGIONAL",
    testFolder: `${CONFIGS_FOLDER}/regional-tls-1-0`,
    testStage: "test",
    isPrivate: false
  },
  {
    testBasePath: "api",
    testDescription: "Deploy with nested CloudFormation stack",
    testDomain: `${PLUGIN_IDENTIFIER}-basepath-nested-stack-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "EDGE",
    testFolder: `${CONFIGS_FOLDER}/basepath-nested-stack`,
    testStage: "test",
    isPrivate: false
  },
  {
    testBasePath: "(none)",
    testDescription: "Deploy with latency routing",
    testDomain: `${PLUGIN_IDENTIFIER}-route-53-latency-routing-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "REGIONAL",
    testFolder: `${CONFIGS_FOLDER}/route-53-latency-routing`,
    testStage: "test",
    isPrivate: false
  },
  {
    testBasePath: "(none)",
    testDescription: "Deploy with weighted routing",
    testDomain: `${PLUGIN_IDENTIFIER}-route-53-weighted-routing-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "REGIONAL",
    testFolder: `${CONFIGS_FOLDER}/route-53-weighted-routing`,
    testStage: "test",
    isPrivate: false
  },
  {
    testBasePath: "(none)",
    testDescription: "Deploy with split horizon dns",
    testDomain: `${PLUGIN_IDENTIFIER}-split-horizon-dns-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "REGIONAL",
    testFolder: `${CONFIGS_FOLDER}/split-horizon-dns`,
    testStage: "test",
    isPrivate: false
  },
  {
    testBasePath: "api",
    testDescription: "Deploy with private endpoint",
    testDomain: `${PLUGIN_IDENTIFIER}-private-domain-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "PRIVATE",
    testFolder: `${CONFIGS_FOLDER}/private-domain`,
    testStage: "test",
    isPrivate: true
  }
];

describe("Integration Tests", function () {
  this.timeout(TIMEOUT_MINUTES);

  describe("Configuration Tests", () => {
    // @ts-expect-error mocha-param types don't resolve with heterogeneous test case objects
    itParam("${value.testDescription}", testCases, async (value) => {
      let restApiInfo;
      if (value.restApiName) {
        restApiInfo = await apiGatewayClient.setupApiGatewayResources(value.restApiName);

        process.env.REST_API_ID = restApiInfo.restApiId;
        process.env.RESOURCE_ID = restApiInfo.resourceId;
      }
      try {
        await utilities.createResources(value.testFolder, value.testDomain);

        // Use different methods for private domains since they require domainNameId
        let stage: string;
        let basePath: string;
        if (value.isPrivate) {
          stage = await apiGatewayClient.getStageForPrivateDomain(value.testDomain);
          basePath = await apiGatewayClient.getBasePathForPrivateDomain(value.testDomain);
        } else {
          stage = await apiGatewayClient.getStage(value.testDomain);
          basePath = await apiGatewayClient.getBasePath(value.testDomain);
        }
        expect(stage).to.equal(value.testStage);
        expect(basePath).to.equal(value.testBasePath);

        const endpoint = await apiGatewayClient.getEndpointType(value.testDomain, value.isPrivate);
        expect(endpoint).to.equal(value.testEndpoint);
      } finally {
        await utilities.destroyResources(value.testDomain);
        if (value.restApiName) {
          await apiGatewayClient.deleteApiGatewayResources(restApiInfo.restApiId);

          delete process.env.REST_API_ID;
          delete process.env.RESOURCE_ID;
        }
      }
    });
  });
});

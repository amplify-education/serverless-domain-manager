import "mocha";
import chai = require("chai");
import itParam = require("mocha-param");
import shell = require("shelljs");
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
    testBasePath: "api",
    testDescription: "Deploy with nested CloudFormation stack",
    testDomain: `${PLUGIN_IDENTIFIER}-basepath-nested-stack-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "EDGE",
    testFolder: `${CONFIGS_FOLDER}/basepath-nested-stack`,
    testStage: "test"
  }
];

describe("Integration Tests", function () {
  this.timeout(TIMEOUT_MINUTES);

  describe("Configuration Tests", () => {
    // @ts-ignore
    // eslint-disable-next-line no-template-curly-in-string
    itParam("${value.testDescription}", testCases, async (value) => {
      let restApiInfo;
      if (value.restApiName) {
        restApiInfo = await apiGatewayClient.setupApiGatewayResources(value.restApiName);

        shell.env.REST_API_ID = restApiInfo.restApiId;
        shell.env.RESOURCE_ID = restApiInfo.resourceId;
      }
      try {
        await utilities.createResources(value.testFolder, value.testDomain);
        const stage = await apiGatewayClient.getStage(value.testDomain);
        expect(stage).to.equal(value.testStage);

        const basePath = await apiGatewayClient.getBasePath(value.testDomain);
        expect(basePath).to.equal(value.testBasePath);

        const endpoint = await apiGatewayClient.getEndpointType(value.testDomain);
        expect(endpoint).to.equal(value.testEndpoint);
      } finally {
        await utilities.destroyResources(value.testDomain);
        if (value.restApiName) {
          await apiGatewayClient.deleteApiGatewayResources(restApiInfo.restApiId);

          delete shell.env.REST_API_ID;
          delete shell.env.RESOURCE_ID;
        }
      }
    });
  });
});

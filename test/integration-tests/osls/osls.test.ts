import "mocha";
import chai = require("chai");
import utilities = require("../test-utilities");
import APIGatewayWrap from "../apigateway";
import { PLUGIN_IDENTIFIER, RANDOM_STRING, TEST_DOMAIN } from "../base";

const expect = chai.expect;
const CONFIGS_FOLDER = "osls";
const TIMEOUT_MINUTES = 15 * 60 * 1000; // 15 minutes in milliseconds
// the us-west-2 is set in the test config
const apiGatewayClient = new APIGatewayWrap("us-west-2");

describe("Integration Tests - osls", function () {
  this.timeout(TIMEOUT_MINUTES);

  // Runs create_domain + deploy through the osls (Open Serverless) CLI rather
  // than the serverless CLI. osls v4 removed the bundled AWS SDK v2 module, so
  // this confirms the plugin resolves credentials/endpoints via getAwsSdkV3Config()
  // and never trips the AWS_SDK_V2_SURFACE_REMOVED removal stubs.
  it("Deploys and creates a domain under the osls framework", async () => {
    const testName = "default";
    const configFolder = `${CONFIGS_FOLDER}/${testName}`;
    const testDomain = `${PLUGIN_IDENTIFIER}-osls-${RANDOM_STRING}.${TEST_DOMAIN}`;
    try {
      await utilities.createResources(configFolder, testDomain, "osls");

      const stage = await apiGatewayClient.getStage(testDomain);
      const basePath = await apiGatewayClient.getBasePath(testDomain);
      const endpoint = await apiGatewayClient.getEndpointType(testDomain, false);

      expect(stage).to.equal("test");
      expect(basePath).to.equal("(none)");
      expect(endpoint).to.equal("EDGE");
    } finally {
      await utilities.destroyResources(testDomain);
    }
  });
});

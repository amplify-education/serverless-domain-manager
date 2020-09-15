import chai = require("chai");
import "mocha";
import itParam = require("mocha-param");
import randomstring = require("randomstring");
import utilities = require("./test-utilities");

const expect = chai.expect;

const TEST_DOMAIN = process.env.TEST_DOMAIN;

if (!TEST_DOMAIN) {
  throw new Error("TEST_DOMAIN environment variable not set");
}

const FIFTEEN_MINUTES = 15 * 60 * 1000; // 15 minutes in milliseconds
const RANDOM_STRING = randomstring.generate({
  capitalization: "lowercase",
  charset: "alphanumeric",
  length: 5,
});
const TEMP_DIR = `~/tmp/domain-manager-test-${RANDOM_STRING}`;

const testCases = [
  {
    testBasePath: "(none)",
    testDescription: "Creates domain as part of deploy",
    testDomain: `auto-domain-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "EDGE",
    testFolder: "auto-domain",
    testStage: "test",
  },
  {
    testBasePath: "(none)",
    testDescription: "Enabled with default values",
    testDomain: `enabled-default-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "EDGE",
    testFolder: "enabled-default",
    testStage: "dev",
  },
  {
    createApiGateway: true,
    testBasePath: "(none)",
    testDescription: "Enabled with custom api gateway",
    testDomain: `enabled-custom-apigateway-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "EDGE",
    testFolder: "enabled-custom-apigateway",
    testStage: "dev",
  },
  {
    testBasePath: "api",
    testDescription: "Enabled with custom basepath",
    testDomain: `enabled-basepath-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "EDGE",
    testFolder: "enabled-basepath",
    testStage: "dev",
  },
  {
    testBasePath: "(none)",
    testDescription: "Enabled with custom stage and empty basepath",
    testDomain: `enabled-stage-basepath-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "EDGE",
    testFolder: "enabled-stage-basepath",
    testStage: "test",
  },
  {
    testBasePath: "api",
    testDescription: "Enabled with regional endpoint, custom basePath",
    testDomain: `enabled-regional-basepath-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "REGIONAL",
    testFolder: "enabled-regional-basepath",
    testStage: "dev",
  },
  {
    testBasePath: "(none)",
    testDescription: "Enabled with regional endpoint, custom stage, empty basepath",
    testDomain: `enabled-regional-stage-basepath-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "REGIONAL",
    testFolder: "enabled-regional-stage-basepath",
    testStage: "test",
  },
  {
    testBasePath: "(none)",
    testDescription: "Create Web socket API and domain name",
    testDomain: `web-socket-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "REGIONAL",
    testFolder: "web-socket",
    testStage: "dev",
  },
  {
    testBasePath: "(none)",
    testDescription: "Create HTTP API and domain name",
    testDomain: `http-api-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "REGIONAL",
    testFolder: "http-api",
    testStage: "$default",
  },
  {
    testBasePath: "(none)",
    testDescription: "Deploy regional domain with TLS 1.0",
    testDomain: `regional-tls-1-0-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testEndpoint: "REGIONAL",
    testFolder: "regional-tls-1-0",
    testStage: "dev",
  },
];

describe("Integration Tests", function() {
  this.timeout(FIFTEEN_MINUTES);
/*  it("APIGateway with export and import resources", async () => {
      const testExportFolder = "apigateway-with-export";
      const testImportFolder = "apigateway-with-import";
      const testURL = `apigateway-with-export-${RANDOM_STRING}.${TEST_DOMAIN}`;

      try {
        await utilities.createTempDir(TEMP_DIR, testExportFolder);
        await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);

        await utilities.createTempDir(TEMP_DIR, testImportFolder);
        await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
      } finally {
        // recreating config for removing last created config ( testImportFolder )
        await utilities.createTempDir(TEMP_DIR, testImportFolder);
        await utilities.slsRemove(TEMP_DIR, RANDOM_STRING);

        // recreating config for sls removing ( testExportFolder )
        await utilities.createTempDir(TEMP_DIR, testExportFolder);
        await utilities.slsRemove(TEMP_DIR, RANDOM_STRING);
      }
    });*/

  describe("Configuration Tests", () => {
    itParam("${value.testDescription}", testCases, async (value) => {
      let restApiInfo;
      if (value.createApiGateway) {
        restApiInfo = await utilities.setupApiGatewayResources(RANDOM_STRING);
      }
      try {
        await utilities.createResources(value.testFolder, value.testDomain, RANDOM_STRING);
        const stage = await utilities.getStage(value.testDomain);
        expect(stage).to.equal(value.testStage);

        const basePath = await utilities.getBasePath(value.testDomain);
        expect(basePath).to.equal(value.testBasePath);

        const endpoint = await utilities.getEndpointType(value.testDomain);
        expect(endpoint).to.equal(value.testEndpoint);
      } finally {
        await utilities.destroyResources(value.testDomain, RANDOM_STRING);
        if (value.createApiGateway) {
          await utilities.deleteApiGatewayResources(restApiInfo.restApiId);
        }
      }
    });
  });

  describe("Basepath mapping issue tests", () => {
    it("Creates a empty basepath mapping", async () => {
      const testName = "null-basepath-mapping";
      const testURL = `${testName}-${RANDOM_STRING}.${TEST_DOMAIN}`;
      // Perform sequence of commands to replicate basepath mapping issue
      try {
        await utilities.createTempDir(TEMP_DIR, testName);
        await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
        await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
        await utilities.slsDeleteDomain(TEMP_DIR, RANDOM_STRING);
        await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
        await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);

        const basePath = await utilities.getBasePath(testURL);
        expect(basePath).to.equal("(none)");
      } finally {
        await utilities.destroyResources(testURL, RANDOM_STRING);
      }
  });

    it("Delete domain then recreate", async () => {
      const testName = "basepath-mapping";
      const testURL = `${testName}-${RANDOM_STRING}.${TEST_DOMAIN}`;
      // Perform sequence of commands to replicate basepath mapping issue
      try {
        await utilities.createTempDir(TEMP_DIR, testName);
        await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
        await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
        await utilities.slsDeleteDomain(TEMP_DIR, RANDOM_STRING);
        await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
        await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);

        const basePath = await utilities.getBasePath(testURL);
        expect(basePath).to.equal("api");
      } finally {
        await utilities.destroyResources(testURL, RANDOM_STRING);
      }
    });

    it("Delete domain then remove", async () => {
      const testName = "null-basepath-mapping";
      const testURL = `${testName}-${RANDOM_STRING}.${TEST_DOMAIN}`;
      // Perform sequence of commands to replicate basepath mapping issue
      try {
        await utilities.createTempDir(TEMP_DIR, testName);
        await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
        await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
        await utilities.slsDeleteDomain(TEMP_DIR, RANDOM_STRING);
        await utilities.slsRemove(TEMP_DIR, RANDOM_STRING);
        await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
        await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);

        const basePath = await utilities.getBasePath(testURL);
        expect(basePath).to.equal("(none)");
      } finally {
        await utilities.destroyResources(testURL, RANDOM_STRING);
      }
    });
  });

  describe("Idempotency tests", () => {
    it("Creates a domain multiple times without failure", async () => {
      const testName = "create-domain-idempotent";
      const testURL = `${testName}-${RANDOM_STRING}.${TEST_DOMAIN}`;
      try {
        await utilities.createTempDir(TEMP_DIR, testName);
        await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
        await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
        await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
        await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
      } finally {
        await utilities.destroyResources(testURL, RANDOM_STRING);
      }
    });

    it("Deploys multiple times without failure", async () => {
      const testName = "deploy-idempotent";
      const testURL = `${testName}-${RANDOM_STRING}.${TEST_DOMAIN}`;
      try {
        await utilities.createTempDir(TEMP_DIR, testName);
        await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
        await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
        await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
        await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
      } finally {
        await utilities.destroyResources(testURL, RANDOM_STRING);
      }
    });
  });
});

"use strict";

const chai = require("chai");
const itParam = require("mocha-param");
const utilities = require("./test-utilities");
const randomstring = require("randomstring");

const expect = chai.expect;

const TEST_DOMAIN = process.env.TEST_DOMAIN;
if(!TEST_DOMAIN) {
  throw new Error("TEST_DOMAIN environment variable not set")
}

const FIFTEEN_MINUTES = 15 * 60 * 1000; // 15 minutes in milliseconds
const RANDOM_STRING = randomstring.generate({
  length: 5,
  charset: "alphanumeric",
  capitalization: "lowercase",
});
const TEMP_DIR = `~/tmp/domain-manager-test-${RANDOM_STRING}`;

const testCases = [
  {
    testDescription: "Enabled with default values",
    testFolder: "enabled-default",
    testDomain: `enabled-default-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testStage: "dev",
    testBasePath: "(none)",
    testEndpoint: "EDGE",
    testURL: `https://enabled-default-${RANDOM_STRING}.${TEST_DOMAIN}/hello-world`,
  },
  {
    testDescription: "Enabled with custom api gateway",
    testFolder: "enabled-custom-apigateway",
    testDomain: `enabled-custom-apigateway-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testStage: "dev",
    testBasePath: "(none)",
    testEndpoint: "EDGE",
    testURL: `https://enabled-custom-apigateway-${RANDOM_STRING}.${TEST_DOMAIN}`,
    createApiGateway: true,
  },
  {
    testDescription: "Enabled with custom basepath",
    testFolder: "enabled-basepath",
    testDomain: `enabled-basepath-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testStage: "dev",
    testBasePath: "api",
    testEndpoint: "EDGE",
    testURL: `https://enabled-basepath-${RANDOM_STRING}.${TEST_DOMAIN}/api/hello-world`,
  },
  {
    testDescription: "Enabled with custom stage and empty basepath",
    testFolder: "enabled-stage-basepath",
    testDomain: `enabled-stage-basepath-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testStage: "test",
    testBasePath: "(none)",
    testEndpoint: "EDGE",
    testURL: `https://enabled-stage-basepath-${RANDOM_STRING}.${TEST_DOMAIN}/hello-world`,
  },
  {
    testDescription: "Enabled with regional endpoint, custom basePath",
    testFolder: "enabled-regional-basepath",
    testDomain: `enabled-regional-basepath-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testStage: "dev",
    testBasePath: "api",
    testEndpoint: "REGIONAL",
    testURL: `https://enabled-regional-basepath-${RANDOM_STRING}.${TEST_DOMAIN}/api/hello-world`,
  },
  {
    testDescription: "Enabled with regional endpoint, custom stage, empty basepath",
    testFolder: "enabled-regional-stage-basepath",
    testDomain: `enabled-regional-stage-basepath-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testStage: "test",
    testBasePath: "(none)",
    testEndpoint: "REGIONAL",
    testURL: `https://enabled-regional-stage-basepath-${RANDOM_STRING}.${TEST_DOMAIN}/hello-world`,
  },
  {
    testDescription: "Enabled with regional endpoint and empty basepath",
    testFolder: "enabled-regional-empty-basepath",
    testDomain: `enabled-regional-empty-basepath-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testStage: "dev",
    testBasePath: "(none)",
    testEndpoint: "REGIONAL",
    testURL: `https://enabled-regional-empty-basepath-${RANDOM_STRING}.${TEST_DOMAIN}/hello-world`,
  },
];

describe("Integration Tests", function () { // eslint-disable-line func-names
  this.timeout(FIFTEEN_MINUTES);

  itParam("${value.testDescription}", testCases, async (value) => { // eslint-disable-line no-template-curly-in-string
    let restApiInfo;
    if (value.createApiGateway) {
      restApiInfo = await utilities.setupApiGatewayResources(RANDOM_STRING);
    }
    try {
      await utilities.createResources(value.testFolder, value.testDomain, RANDOM_STRING, true);
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

  it("Creates a empty basepath mapping", async () => {
    const testName = "null-basepath-mapping";
    const testURL = `${testName}-${RANDOM_STRING}.${TEST_DOMAIN}`;
    // Perform sequence of commands to replicate basepath mapping issue
    // Sleep for half a min between commands in order to avoid rate limiting.
    try {
      await utilities.createTempDir(TEMP_DIR, testName);
      await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(30);
      await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(30);
      await utilities.slsDeleteDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(30);
      await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(30);
      await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);

      const basePath = await utilities.getBasePath(testURL);
      expect(basePath).to.equal("(none)");
    } finally {
      await utilities.destroyResources(testURL, RANDOM_STRING);
    }
  });

  it("Creates a basepath mapping", async () => {
    const testName = "basepath-mapping";
    const testURL = `${testName}-${RANDOM_STRING}.${TEST_DOMAIN}`;
    // Perform sequence of commands to replicate basepath mapping issue
    // Sleep for half a min between commands in order to avoid rate limiting.
    try {
      await utilities.createTempDir(TEMP_DIR, testName);
      await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(30);
      await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(30);
      await utilities.slsDeleteDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(30);
      await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(30);
      await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);

      const basePath = await utilities.getBasePath(testURL);
      expect(basePath).to.equal("api");
    } finally {
      await utilities.destroyResources(testURL, RANDOM_STRING);
    }
  });

  it("Creates a basepath mapping", async () => {
    const testName = "null-basepath-mapping";
    const testURL = `${testName}-${RANDOM_STRING}.${TEST_DOMAIN}`;
    // Perform sequence of commands to replicate basepath mapping issue
    // Sleep for half a min between commands in order to avoid rate limiting.
    try {
      await utilities.createTempDir(TEMP_DIR, testName);
      await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(30);
      await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(30);
      await utilities.slsDeleteDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(30);
      await utilities.slsRemove(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(30);
      await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(30);
      await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);

      const basePath = await utilities.getBasePath(testURL);
      expect(basePath).to.equal("(none)");
    } finally {
      await utilities.destroyResources(testURL, RANDOM_STRING);
    }
  });

  it("Creates a domain multiple times without failure", async () => {
    const testName = "create-domain-idempotent";
    const testURL = `${testName}-${RANDOM_STRING}.${TEST_DOMAIN}`;
    try {
      await utilities.createTempDir(TEMP_DIR, testName);
      await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(30);
      await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(30);
      await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(30);
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
      await utilities.sleep(30);
      await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(30);
      await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(30);
      await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
    } finally {
      await utilities.destroyResources(testURL, RANDOM_STRING);
    }
  });
});

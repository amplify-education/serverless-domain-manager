"use strict";

const chai = require("chai");
const itParam = require("mocha-param");
const utilities = require("./test-utilities");
const randomstring = require("randomstring");

const expect = chai.expect;

const TEST_DOMAIN = process.env.TEST_DOMAIN;
const SIX_HOURS = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
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
  this.timeout(SIX_HOURS); // 6 hours to allow for dns to propogate

  describe("Domain Manager Is Enabled", function () { // eslint-disable-line func-names
    this.timeout(SIX_HOURS);

    itParam("${value.testDescription}", testCases, async (value) => { // eslint-disable-line no-template-curly-in-string
      let restApiInfo;
      if (value.createApiGateway) {
        restApiInfo = await utilities.setupApiGatewayResources(RANDOM_STRING);
      }
      const created = await utilities.createResources(value.testFolder,
          value.testDomain, RANDOM_STRING, true);
      if (!created) {
        throw new utilities.CreationError("Resources failed to create.");
      } else {
        const stage = await utilities.getStage(value.testDomain);
        expect(stage).to.equal(value.testStage);

        const basePath = await utilities.getBasePath(value.testDomain);
        expect(basePath).to.equal(value.testBasePath);

        const endpoint = await utilities.getEndpointType(value.testDomain);
        expect(endpoint).to.equal(value.testEndpoint);

        const status = await utilities.curlUrl(value.testURL);
        expect(status).to.equal(200);
      }
      await utilities.destroyResources(value.testDomain, RANDOM_STRING);
      if (value.createApiGateway) {
        await utilities.deleteApiGatewayResources(restApiInfo.restApiId);
      }
    });
  });

  describe("Domain Manager Is Not Enabled", function () { // eslint-disable-line func-names
    this.timeout(5 * 60 * 1000); // 5 minutes in milliseconds
    const testName = "disabled";
    const testURL = `${testName}-${RANDOM_STRING}.${TEST_DOMAIN}`;

    before(async () => {
      const created = await utilities.createResources(testName, testURL, RANDOM_STRING, false);
      if (!created) {
        throw new utilities.CreationError("Resources failed to create.");
      }
    });

    it("Does not create a domain", async () => {
      const data = await utilities.curlUrl(`https://${testURL}/hello-world`);
      expect(data).to.equal(null);
    });

    after(async () => {
      await utilities.destroyResources(testURL, RANDOM_STRING);
    });
  });

  describe("Basepath Mapping Is Empty", function () { // eslint-disable-line func-names
    this.timeout(15 * 60 * 1000); // 15 minutes in milliseconds
    const testName = "null-basepath-mapping";
    const testURL = `${testName}-${RANDOM_STRING}.${TEST_DOMAIN}`;

    before(async () => {
      // Perform sequence of commands to replicate basepath mapping issue
      // Sleep for a min b/w commands in order to avoid rate limiting.
      await utilities.createTempDir(TEMP_DIR, testName);
      await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(60);
      await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(60);
      await utilities.slsDeleteDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(60);
      await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(60);
      await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
    });

    it("Creates a basepath mapping", async () => {
      const basePath = await utilities.getBasePath(testURL);
      expect(basePath).to.equal("(none)");
    });

    after(async () => {
      await utilities.destroyResources(testURL, RANDOM_STRING);
    });
  });

  describe("Basepath Mapping Is Set", function () { // eslint-disable-line func-names
    this.timeout(15 * 60 * 1000); // 15 minutes in milliseconds
    const testName = "basepath-mapping";
    const testURL = `${testName}-${RANDOM_STRING}.${TEST_DOMAIN}`;

    before(async () => {
      // Perform sequence of commands to replicate basepath mapping issue
      // Sleep for a min b/w commands in order to avoid rate limiting.
      await utilities.createTempDir(TEMP_DIR, testName);
      await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(60);
      await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(60);
      await utilities.slsDeleteDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(60);
      await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(60);
      await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
    });

    it("Creates a basepath mapping", async () => {
      const basePath = await utilities.getBasePath(testURL);
      expect(basePath).to.equal("api");
    });

    after(async () => {
      await utilities.destroyResources(testURL, RANDOM_STRING);
    });
  });


  describe("Basepath Mapping Is Empty And Fix Works", function () { // eslint-disable-line func-names
    this.timeout(15 * 60 * 1000); // 15 minutes in milliseconds
    const testName = "null-basepath-mapping";
    const testURL = `${testName}-${RANDOM_STRING}.${TEST_DOMAIN}`;

    before(async () => {
      // Perform sequence of commands to replicate basepath mapping issue
      // Sleep for a min b/w commands in order to avoid rate limiting.
      await utilities.createTempDir(TEMP_DIR, testName);
      await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(60);
      await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(60);
      await utilities.slsDeleteDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(60);
      await utilities.slsRemove(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(60);
      await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(60);
      await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
    });

    it("Creates a basepath mapping", async () => {
      const basePath = await utilities.getBasePath(testURL);
      expect(basePath).to.equal("(none)");
    });

    after(async () => {
      await utilities.destroyResources(testURL, RANDOM_STRING);
    });
  });

  describe("Create domain is idempotent", function () { // eslint-disable-line func-names
    this.timeout(15 * 60 * 1000); // 15 minutes in milliseconds
    const testName = "create-domain-idempotent";
    const testURL = `${testName}-${RANDOM_STRING}.${TEST_DOMAIN}`;

    it("Creates a domain multiple times without failure", async () => {
      let createDomain = true;
      let deploySuccess;
      await utilities.createTempDir(TEMP_DIR, testName);
      createDomain = createDomain && await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(60);
      createDomain = createDomain && await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(60);
      createDomain = createDomain && await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(60);
      deploySuccess = await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
      expect(createDomain).to.equal(true);
      expect(deploySuccess).to.equal(true);
    });

    after(async () => {
      await utilities.destroyResources(testURL, RANDOM_STRING);
    });
  });

  describe("Deploy is idempotent", function () { // eslint-disable-line func-names
    this.timeout(15 * 60 * 1000); // 15 minutes in milliseconds
    const testName = "deploy-idempotent";
    const testURL = `${testName}-${RANDOM_STRING}.${TEST_DOMAIN}`;

    it("Deploys multiple times without failure", async () => {
      let createDomain;
      let deploySuccess = true;
      await utilities.createTempDir(TEMP_DIR, testName);
      createDomain = await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(60);
      deploySuccess = deploySuccess && await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(60);
      deploySuccess = deploySuccess && await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(60);
      deploySuccess = deploySuccess && await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
      expect(createDomain).to.equal(true);
      expect(deploySuccess).to.equal(true);
    });

    after(async () => {
      await utilities.destroyResources(testURL, RANDOM_STRING);
    });
  });

  describe("Migrating from 2.x.x to 3.x.x works", function () { // eslint-disable-line func-names
    this.timeout(15 * 60 * 1000); // 15 minutes in milliseconds
    const testName = "two-three-migration-default";
    const testURL = `${testName}-${RANDOM_STRING}.${TEST_DOMAIN}`;

    before(async () => {
      await utilities.exec(`rm -rf ${TEMP_DIR}`);
      await utilities.exec(`mkdir -p ${TEMP_DIR} && cp -R test/integration-tests/${testName}/. ${TEMP_DIR}`);
      await utilities.exec(`cd ${TEMP_DIR}/ && npm install serverless-domain-manager@2.6.13`);
    });

    it("Creates a basepath mapping", async () => {
      await utilities.exec(`cd ${TEMP_DIR} && sls create_domain --RANDOM_STRING ${RANDOM_STRING}`);
      await utilities.sleep(60);
      await utilities.exec(`cd ${TEMP_DIR} && sls deploy --RANDOM_STRING ${RANDOM_STRING}`);
      await utilities.sleep(60);
      await utilities.exec(`cp -R . ${TEMP_DIR}/node_modules/serverless-domain-manager`);
      await utilities.exec(`cd ${TEMP_DIR} && sls deploy --RANDOM_STRING ${RANDOM_STRING}`);

      const basePath = await utilities.getBasePath(testURL);
      expect(basePath).to.equal("(none)");
    });

    after(async () => {
      await utilities.exec(`cd ${TEMP_DIR} && sls remove --RANDOM_STRING ${RANDOM_STRING}`);
      await utilities.sleep(60);
      await utilities.exec(`cd ${TEMP_DIR} && sls delete_domain --RANDOM_STRING ${RANDOM_STRING}`);
      await utilities.sleep(60);
      await utilities.exec(`rm -rf ${TEMP_DIR}`);
    });
  });
});

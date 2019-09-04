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
    testDomainRest: `enabled-default-rest-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testDomainWebsocket: `enabled-default-websocket-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testStage: "dev",
    testBasePath: "(none)",
    testEndpoint: "EDGE",
    testURLRest: `https://enabled-default-rest-${RANDOM_STRING}.${TEST_DOMAIN}/hello-world`,
    testURLWebsocket: `https://enabled-default-websocket-${RANDOM_STRING}.${TEST_DOMAIN}/hello-world`,
  },
  {
    testDescription: "Enabled with custom api gateway",
    testFolder: "enabled-custom-apigateway",
    testDomainRest: `enabled-custom-apigateway-rest-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testDomainWebsocket: `enabled-custom-apigateway-webscket-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testStage: "dev",
    testBasePath: "(none)",
    testEndpoint: "EDGE",
    testURLRest: `https://enabled-custom-apigateway-rest-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testURLWebsocket: `https://enabled-custom-apigateway-websocket-${RANDOM_STRING}.${TEST_DOMAIN}`,
    createApiGateway: true,
  },
  {
    testDescription: "Enabled with custom basepath",
    testFolder: "enabled-basepath",
    testDomainRest: `enabled-basepath-rest-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testDomainWebsocket: `enabled-basepath-websocket-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testStage: "dev",
    testBasePath: "api",
    testEndpoint: "EDGE",
    testURLRest: `https://enabled-basepath-rest-${RANDOM_STRING}.${TEST_DOMAIN}/api/hello-world`,
    testURLWebsocket: `https://enabled-basepath-websocket-${RANDOM_STRING}.${TEST_DOMAIN}/api/hello-world`,
  },
  {
    testDescription: "Enabled with custom stage and empty basepath",
    testFolder: "enabled-stage-basepath",
    testDomainRest: `enabled-stage-basepath-rest-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testDomainWebsocket: `enabled-stage-basepath-websocket-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testStage: "test",
    testBasePath: "(none)",
    testEndpoint: "EDGE",
    testURLRest: `https://enabled-stage-basepath-rest-${RANDOM_STRING}.${TEST_DOMAIN}/hello-world`,
    testURLWebsocket: `https://enabled-stage-basepath-websocket-${RANDOM_STRING}.${TEST_DOMAIN}/hello-world`,
  },
  {
    testDescription: "Enabled with regional endpoint, custom basePath",
    testFolder: "enabled-regional-basepath",
    testDomainRest: `enabled-regional-basepath-rest-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testDomainWebsocket: `enabled-regional-basepath-websocket-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testStage: "dev",
    testBasePath: "api",
    testEndpoint: "REGIONAL",
    testURLRest: `https://enabled-regional-basepath-rest-${RANDOM_STRING}.${TEST_DOMAIN}/api/hello-world`,
    testURLWebsocket: `https://enabled-regional-basepath-websocket-${RANDOM_STRING}.${TEST_DOMAIN}/api/hello-world`,
  },
  {
    testDescription: "Enabled with regional endpoint, custom stage, empty basepath",
    testFolder: "enabled-regional-stage-basepath",
    testDomainRest: `enabled-regional-stage-basepath-rest-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testDomainWebsocket: `enabled-regional-stage-basepath-websocket-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testStage: "test",
    testBasePath: "(none)",
    testEndpoint: "REGIONAL",
    testURLRest: `https://enabled-regional-stage-basepath-rest-${RANDOM_STRING}.${TEST_DOMAIN}/hello-world`,
    testURLWebsocket: `https://enabled-regional-stage-basepath-websocket-${RANDOM_STRING}.${TEST_DOMAIN}/hello-world`,
  },
  {
    testDescription: "Enabled with regional endpoint and empty basepath",
    testFolder: "enabled-regional-empty-basepath",
    testDomainRest: `enabled-regional-empty-basepath-rest-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testDomainWebsocket: `enabled-regional-empty-basepath-websocket-${RANDOM_STRING}.${TEST_DOMAIN}`,
    testStage: "dev",
    testBasePath: "(none)",
    testEndpoint: "REGIONAL",
    testURLRest: `https://enabled-regional-empty-basepath-rest-${RANDOM_STRING}.${TEST_DOMAIN}/hello-world`,
    testURLWebsocket: `https://enabled-regional-empty-basepath-websocket-${RANDOM_STRING}.${TEST_DOMAIN}/hello-world`,
  },
];


describe("Integration Tests", function () { // eslint-disable-line func-names
  this.timeout(SIX_HOURS); // 6 hours to allow for dns to propogate

  describe("Domain Manager Is Enabled", function () { // eslint-disable-line func-names
    this.timeout(SIX_HOURS);

    itParam("${value.testDescription}", testCases, async (value) => { // eslint-disable-line no-template-curly-in-string
      const urls = new Map()
      urls.set("REST", value.testURLRest)
      urls.set("WEBSOCKET", value.testURLWebsocket)

      let restApiInfo;
      if (value.createApiGateway) {
        restApiInfo = await utilities.setupApiGatewayResources(RANDOM_STRING);
      }
      const created = await utilities.createResources(value.testFolder,
          urls, RANDOM_STRING, true);
      if (!created) {
        throw new utilities.CreationError("Resources failed to create.");
      } else {
        const [stageRest, stageWebsocket] = await utilities.getStage(urls);
        expect(stageRest).to.equal(value.testStage);
        expect(stageWebsocket).to.equal(value.testStage);

        const [basePathRest, basePathWebsocket] = await utilities.getBasePath(urls);
        expect(basePathRest).to.equal(value.testBasePath);
        expect(basePathWebsocket).to.equal(value.testBasePath);

        const [endpointRest, endpointWebsocket] = await utilities.getEndpointType(urls);
        expect(endpointRest).to.equal(value.testEndpoint);
        expect(endpointWebsocket).to.equal(value.testEndpoint);

        const [statusRest, statusWebsocket] = await utilities.curlUrl(urls);
        expect(statusRest).to.equal(200);
        expect(statusWebsocket).to.equal(200);

      }
      await utilities.destroyResources(urls, RANDOM_STRING);
      if (value.createApiGateway) {
        await utilities.deleteApiGatewayResources(restApiInfo.restApiId);
      }
    });
  });

  describe("Domain Manager Is Not Enabled", function () { // eslint-disable-line func-names
    this.timeout(5 * 60 * 1000); // 5 minutes in milliseconds
    const testName = "disabled";

    const urls = new Map()
    urls.set("REST", `${testName}-rest-${RANDOM_STRING}.${TEST_DOMAIN}`)
    urls.set("WEBSOCKET", `${testName}-websocket-${RANDOM_STRING}.${TEST_DOMAIN}`)

    before(async () => {
      const created = await utilities.createResources(testName, urls, RANDOM_STRING, false);
      if (!created) {
        throw new utilities.CreationError("Resources failed to create.");
      }
    });

    it("Does not create a domain", async () => {
      urls.set("REST", `${testName}-rest-${RANDOM_STRING}.${TEST_DOMAIN}/hello-world`)
      urls.set("WEBSOCKET", `${testName}-websocket-${RANDOM_STRING}.${TEST_DOMAIN}/hello-world`)

      const [dataRest, dataWebsocket] = await utilities.curlUrl(urls);

      expect(dataRest).to.equal(null);
      expect(dataWebsocket).to.equal(null);
    });

    after(async () => {
      await utilities.destroyResources(urls, RANDOM_STRING);
    });
  });

  describe("Basepath Mapping Is Empty", function () { // eslint-disable-line func-names
    this.timeout(15 * 60 * 1000); // 15 minutes in milliseconds
    const testName = "null-basepath-mapping";
    const urls = new Map()
    urls.set("REST", `${testName}-rest-${RANDOM_STRING}.${TEST_DOMAIN}`)
    urls.set("WEBSOCKET", `${testName}-websocket-${RANDOM_STRING}.${TEST_DOMAIN}`)

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
      const [basePathRest, basePathWebsocket] = await utilities.getBasePath(urls);
      expect(basePathRest).to.equal("(none)");
      expect(basePathWebsocket).to.equal("(none)");
    });

    after(async () => {
      await utilities.destroyResources(urls, RANDOM_STRING);
    });
  });

  describe("Basepath Mapping Is Set", function () { // eslint-disable-line func-names
    this.timeout(15 * 60 * 1000); // 15 minutes in milliseconds
    const testName = "basepath-mapping";
    const urls = new Map()
    urls.set("REST", `${testName}-rest-${RANDOM_STRING}.${TEST_DOMAIN}`)
    urls.set("WEBSOCKET", `${testName}-websocket-${RANDOM_STRING}.${TEST_DOMAIN}`)

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
      const [basePathRest, basePathWebsocket] = await utilities.getBasePath(urls);
      expect(basePathRest).to.equal("api");
      expect(basePathWebsocket).to.equal("api");
    });

    after(async () => {
      await utilities.destroyResources(urls, RANDOM_STRING);
    });
  });


  describe("Basepath Mapping Is Empty And Fix Works", function () { // eslint-disable-line func-names
    this.timeout(15 * 60 * 1000); // 15 minutes in milliseconds
    const testName = "null-basepath-mapping";
    const urls = new Map()
    urls.set("REST", `${testName}-rest-${RANDOM_STRING}.${TEST_DOMAIN}`)
    urls.set("WEBSOCKET", `${testName}-websocket-${RANDOM_STRING}.${TEST_DOMAIN}`)

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
      const [basePathRest, basePathWebsocket] = await utilities.getBasePath(urls);
      expect(basePathRest).to.equal("(none)");
      expect(basePathWebsocket).to.equal("(none)");
    });

    after(async () => {
      await utilities.destroyResources(urls, RANDOM_STRING);
    });
  });

  describe("Create domain is idempotent", function () { // eslint-disable-line func-names
    this.timeout(15 * 60 * 1000); // 15 minutes in milliseconds
    const testName = "create-domain-idempotent";
    const urls = new Map()
    urls.set("REST", `${testName}-rest-${RANDOM_STRING}.${TEST_DOMAIN}`)
    urls.set("WEBSOCKET", `${testName}-websocket-${RANDOM_STRING}.${TEST_DOMAIN}`)

    it("Creates a domain multiple times without failure", async () => {
      let createDomainSuccess = true;
      let deploySuccess;
      await utilities.createTempDir(TEMP_DIR, testName);
      createDomainSuccess = createDomainSuccess && await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(60);
      createDomainSuccess = createDomainSuccess && await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(60);
      createDomainSuccess = createDomainSuccess && await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(60);
      deploySuccess = await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
      expect(createDomainSuccess).to.equal(true);
      expect(deploySuccess).to.equal(true);
    });

    after(async () => {
      await utilities.destroyResources(urls, RANDOM_STRING);
    });
  });

  describe("Deploy is idempotent", function () { // eslint-disable-line func-names
    this.timeout(15 * 60 * 1000); // 15 minutes in milliseconds
    const testName = "deploy-idempotent";
    const urls = new Map()
    urls.set("REST", `${testName}-rest-${RANDOM_STRING}.${TEST_DOMAIN}`)
    urls.set("WEBSOCKET", `${testName}-websocket-${RANDOM_STRING}.${TEST_DOMAIN}`)

    it("Deploys multiple times without failure", async () => {
      let createDomainSuccess;
      let deploySuccess = true;
      await utilities.createTempDir(TEMP_DIR, testName);
      createDomainSuccess = await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(60);
      deploySuccess = deploySuccess && await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(60);
      deploySuccess = deploySuccess && await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
      await utilities.sleep(60);
      deploySuccess = deploySuccess && await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
      expect(createDomainSuccess).to.equal(true);
      expect(deploySuccess).to.equal(true);
    });

    after(async () => {
      await utilities.destroyResources(urls, RANDOM_STRING);
    });
  });

  describe("Migrating from 2.x.x to 3.x.x works", function () { // eslint-disable-line func-names
    this.timeout(15 * 60 * 1000); // 15 minutes in milliseconds
    const testName = "two-three-migration-default";
    const urls = new Map()
    urls.set("REST", `${testName}-rest-${RANDOM_STRING}.${TEST_DOMAIN}`)
    urls.set("WEBSOCKET", `${testName}-websocket-${RANDOM_STRING}.${TEST_DOMAIN}`)

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

      const [basePathRest, basePathWebsocket] = await utilities.getBasePath(urls);
      expect(basePathRest).to.equal("(none)");
      expect(basePathWebsocket).to.equal("(none)");
    });

    after(async () => {
      await utilities.exec(`cd ${TEMP_DIR} && sls remove --RANDOM_STRING ${RANDOM_STRING}`);
      await utilities.sleep(60);
      await utilities.exec(`cd ${TEMP_DIR} && sls delete_domain --RANDOM_STRING ${RANDOM_STRING}`);
      await utilities.sleep(60);
      await utilities.exec(`rm -rf ${TEMP_DIR}`);
    });
  });

  describe("Migrating from 2.x.x to 3.x.x works given basepath", function () { // eslint-disable-line func-names
    this.timeout(15 * 60 * 1000); // 15 minutes in milliseconds
    const testName = "two-three-migration-basepath";
    const urls = new Map()
    urls.set("REST", `${testName}-rest-${RANDOM_STRING}.${TEST_DOMAIN}`)
    urls.set("WEBSOCKET", `${testName}-websocket-${RANDOM_STRING}.${TEST_DOMAIN}`)

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

      const [basePathRest, basePathWebsocket] = await utilities.getBasePath(urls);
      expect(basePathRest).to.equal("api");
      expect(basePathWebsocket).to.equal("api");
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

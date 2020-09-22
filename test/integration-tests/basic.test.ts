import chai = require("chai");
import "mocha";
import utilities = require("./test-utilities");
import {getRandomString, TEST_DOMAIN} from "./base"; // tslint:disable-line

const expect = chai.expect;
const CONFIGS_FOLDER = "basic";
const TIMEOUT_MINUTES = 15 * 60 * 1000; // 15 minutes in milliseconds
const RANDOM_STRING = getRandomString();
const TEMP_DIR = `~/tmp/domain-manager-test-${RANDOM_STRING}`;

describe("Integration Tests", function() {
    this.timeout(TIMEOUT_MINUTES);

    it("Creates a empty basepath mapping", async () => {
        const testName = "null-basepath-mapping";
        const configFolder = `${CONFIGS_FOLDER}/${testName}`;
        const testURL = `${testName}-${RANDOM_STRING}.${TEST_DOMAIN}`;
        // Perform sequence of commands to replicate basepath mapping issue
        try {
            await utilities.createTempDir(TEMP_DIR, configFolder);
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
        const configFolder = `${CONFIGS_FOLDER}/${testName}`;
        const testURL = `${testName}-${RANDOM_STRING}.${TEST_DOMAIN}`;
        // Perform sequence of commands to replicate basepath mapping issue
        try {
            await utilities.createTempDir(TEMP_DIR, configFolder);
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
        const configFolder = `${CONFIGS_FOLDER}/${testName}`;
        const testURL = `${testName}-${RANDOM_STRING}.${TEST_DOMAIN}`;
        // Perform sequence of commands to replicate basepath mapping issue
        try {
            await utilities.createTempDir(TEMP_DIR, configFolder);
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

    it("API Gateway with export and import", async () => {
        const testExportName = "apigateway-with-export";
        const configExportFolder = `${CONFIGS_FOLDER}/${testExportName}`;
        const configImportFolder = `${CONFIGS_FOLDER}/apigateway-with-import`;
        const testURL = `${testExportName}-${RANDOM_STRING}.${TEST_DOMAIN}`;
        // Perform sequence of commands to replicate basepath mapping issue
        try {
            await utilities.createTempDir(TEMP_DIR, configExportFolder);
            await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);

            await utilities.createTempDir(TEMP_DIR, configImportFolder);
            await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);

            const basePath = await utilities.getBasePath(testURL);
            expect(basePath).to.equal("hello-world");
        } finally {
            // should destroy the last created config folder ( import config )
            await utilities.destroyResources(testURL, RANDOM_STRING);
            // recreate config for removing export config
            await utilities.createTempDir(TEMP_DIR, configExportFolder);
            await utilities.destroyResources(testURL, RANDOM_STRING);
        }
    });

    it("Creates a domain multiple times without failure", async () => {
        const testName = "create-domain-idempotent";
        const configFolder = `${CONFIGS_FOLDER}/${testName}`;
        const testURL = `${testName}-${RANDOM_STRING}.${TEST_DOMAIN}`;
        try {
            await utilities.createTempDir(TEMP_DIR, configFolder);
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
        const configFolder = `${CONFIGS_FOLDER}/${testName}`;
        const testURL = `${testName}-${RANDOM_STRING}.${TEST_DOMAIN}`;
        try {
            await utilities.createTempDir(TEMP_DIR, configFolder);
            await utilities.slsCreateDomain(TEMP_DIR, RANDOM_STRING);
            await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
            await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
            await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
        } finally {
            await utilities.destroyResources(testURL, RANDOM_STRING);
        }
    });

    it("Deploy multi domains", async () => {
        const testName = "http-api-multiple";
        const configFolder = `${CONFIGS_FOLDER}/${testName}`;
        try {
            await utilities.createTempDir(TEMP_DIR, configFolder);
            await utilities.slsDeploy(TEMP_DIR, RANDOM_STRING);
        } finally {
            await utilities.destroyResources(testName, RANDOM_STRING);
        }
    });
});

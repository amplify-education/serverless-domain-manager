import chai = require("chai");
import "mocha";
import utilities = require("./test-utilities");
import {
    PLUGIN_IDENTIFIER,
    RANDOM_STRING,
    TEMP_DIR,
    TEST_DOMAIN,
} from "./base";

const expect = chai.expect;
const CONFIGS_FOLDER = "basic";
const TIMEOUT_MINUTES = 15 * 60 * 1000; // 15 minutes in milliseconds

describe("Integration Tests", function () {
    this.timeout(TIMEOUT_MINUTES);

    it("Creates a empty basepath mapping", async () => {
        const testName = "null-basepath-mapping";
        const configFolder = `${CONFIGS_FOLDER}/${testName}`;
        const testURL = `${PLUGIN_IDENTIFIER}-${testName}-${RANDOM_STRING}.${TEST_DOMAIN}`;
        // Perform sequence of commands to replicate basepath mapping issue
        try {
            await utilities.createTempDir(TEMP_DIR, configFolder);
            await utilities.slsCreateDomain(TEMP_DIR);
            await utilities.slsDeploy(TEMP_DIR);
            await utilities.slsDeleteDomain(TEMP_DIR);
            await utilities.slsCreateDomain(TEMP_DIR);
            await utilities.slsDeploy(TEMP_DIR);

            const basePath = await utilities.getBasePath(testURL);
            expect(basePath).to.equal("(none)");
        } finally {
            await utilities.destroyResources(testName);
        }
    });

    it("Delete domain then recreate", async () => {
        const testName = "basepath-mapping";
        const configFolder = `${CONFIGS_FOLDER}/${testName}`;
        const testURL = `${PLUGIN_IDENTIFIER}-${testName}-${RANDOM_STRING}.${TEST_DOMAIN}`;
        // Perform sequence of commands to replicate basepath mapping issue
        try {
            await utilities.createTempDir(TEMP_DIR, configFolder);
            await utilities.slsCreateDomain(TEMP_DIR);
            await utilities.slsDeploy(TEMP_DIR);
            await utilities.slsDeleteDomain(TEMP_DIR);
            await utilities.slsCreateDomain(TEMP_DIR);
            await utilities.slsDeploy(TEMP_DIR);

            const basePath = await utilities.getBasePath(testURL);
            expect(basePath).to.equal("api");
        } finally {
            await utilities.destroyResources(testName);
        }
    });

    it("Delete domain then remove", async () => {
        const testName = "null-basepath-mapping";
        const configFolder = `${CONFIGS_FOLDER}/${testName}`;
        const testURL = `${PLUGIN_IDENTIFIER}-${testName}-${RANDOM_STRING}.${TEST_DOMAIN}`;
        // Perform sequence of commands to replicate basepath mapping issue
        try {
            await utilities.createTempDir(TEMP_DIR, configFolder);
            await utilities.slsCreateDomain(TEMP_DIR);
            await utilities.slsDeploy(TEMP_DIR);
            await utilities.slsDeleteDomain(TEMP_DIR);
            await utilities.slsRemove(TEMP_DIR);
            await utilities.slsCreateDomain(TEMP_DIR);
            await utilities.slsDeploy(TEMP_DIR);

            const basePath = await utilities.getBasePath(testURL);
            expect(basePath).to.equal("(none)");
        } finally {
            await utilities.destroyResources(testName);
        }
    });

    it("API Gateway with export and import", async () => {
        const testExportName = "apigateway-with-export";
        const testImportName = "apigateway-with-import";
        const configExportFolder = `${CONFIGS_FOLDER}/${testExportName}`;
        const configImportFolder = `${CONFIGS_FOLDER}/${testImportName}`;
        const testExportURL = `${PLUGIN_IDENTIFIER}-${testExportName}-${RANDOM_STRING}.${TEST_DOMAIN}`;
        // Perform sequence of commands to replicate basepath mapping issue
        try {
            await utilities.createTempDir(TEMP_DIR, configExportFolder);
            await utilities.slsDeploy(TEMP_DIR);

            await utilities.createTempDir(TEMP_DIR, configImportFolder);
            await utilities.slsDeploy(TEMP_DIR);

            const basePath = await utilities.getBasePath(testExportURL);
            expect(basePath).to.equal("hello-world");
        } finally {
            // should destroy the last created config folder ( import config )
            await utilities.destroyResources(testImportName);
            // temp dir are empty and we need to update it with export config for the proper cleanup
            await utilities.createTempDir(TEMP_DIR, configExportFolder);
            await utilities.destroyResources(testExportName);
        }
    });

    it("Can use a specified profile for route53", async () => {
        const testName = "route53-profile";
        const configFolder = `${CONFIGS_FOLDER}/${testName}`;
        const testURL = `${PLUGIN_IDENTIFIER}-${testName}-${RANDOM_STRING}.${TEST_DOMAIN}`;
        try {
            await utilities.createTempDir(TEMP_DIR, configFolder);
            await utilities.slsCreateDomain(TEMP_DIR);
            await utilities.slsCreateDomain(TEMP_DIR);
            await utilities.slsCreateDomain(TEMP_DIR);
            await utilities.slsDeploy(TEMP_DIR);
        } finally {
            await utilities.destroyResources(testURL);
        }
    });

    it("Creates a domain multiple times without failure", async () => {
        const testName = "create-domain-idempotent";
        const configFolder = `${CONFIGS_FOLDER}/${testName}`;
        try {
            await utilities.createTempDir(TEMP_DIR, configFolder);
            await utilities.slsCreateDomain(TEMP_DIR);
            await utilities.slsCreateDomain(TEMP_DIR);
            await utilities.slsCreateDomain(TEMP_DIR);
            await utilities.slsDeploy(TEMP_DIR);
        } finally {
            await utilities.destroyResources(testName);
        }
    });

    it("Deploys multiple times without failure", async () => {
        const testName = "deploy-idempotent";
        const configFolder = `${CONFIGS_FOLDER}/${testName}`;
        try {
            await utilities.createTempDir(TEMP_DIR, configFolder);
            await utilities.slsCreateDomain(TEMP_DIR);
            await utilities.slsDeploy(TEMP_DIR);
            await utilities.slsDeploy(TEMP_DIR);
            await utilities.slsDeploy(TEMP_DIR);
        } finally {
            await utilities.destroyResources(testName);
        }
    });

    it("Deploy multi domains", async () => {
        const testName = "http-api-multiple";
        const configFolder = `${CONFIGS_FOLDER}/${testName}`;
        try {
            await utilities.createTempDir(TEMP_DIR, configFolder);
            await utilities.slsDeploy(TEMP_DIR);
        } finally {
            await utilities.destroyResources(testName);
        }
    });

    it("Mutual TLS", async () => {
        const testName = "mutual-tls";
        const configFolder = `${CONFIGS_FOLDER}/${testName}`;
        try {
            await utilities.createTempDir(TEMP_DIR, configFolder);
            await utilities.slsDeploy(TEMP_DIR);
        } finally {
            await utilities.destroyResources(testName);
        }
    });
});

import chai = require("chai");
import "mocha";
import utilities = require("./test-utilities");
import {TempDir, TestDomain, UrlPrefix } from "./base"; // tslint:disable-line

const expect = chai.expect;
const CONFIGS_FOLDER = "basic";
const TIMEOUT_MINUTES = 15 * 60 * 1000; // 15 minutes in milliseconds

describe("Integration Tests", function () {
    this.timeout(TIMEOUT_MINUTES);

    it("Creates a empty basepath mapping", async () => {
        const testName = "null-basepath-mapping";
        const configFolder = `${CONFIGS_FOLDER}/${testName}`;
        const testURL = `${UrlPrefix}-${testName}.${TestDomain}`;
        // Perform sequence of commands to replicate basepath mapping issue
        try {
            await utilities.createTempDir(TempDir, configFolder);
            await utilities.slsCreateDomain(TempDir);
            await utilities.slsDeploy(TempDir);
            await utilities.slsDeleteDomain(TempDir);
            await utilities.slsCreateDomain(TempDir);
            await utilities.slsDeploy(TempDir);

            const basePath = await utilities.getBasePath(testURL);
            expect(basePath).to.equal("(none)");
        } finally {
            await utilities.destroyResources(testName);
        }
    });

    it("Delete domain then recreate", async () => {
        const testName = "basepath-mapping";
        const configFolder = `${CONFIGS_FOLDER}/${testName}`;
        const testURL = `${UrlPrefix}-${testName}.${TestDomain}`;
        // Perform sequence of commands to replicate basepath mapping issue
        try {
            await utilities.createTempDir(TempDir, configFolder);
            await utilities.slsCreateDomain(TempDir);
            await utilities.slsDeploy(TempDir);
            await utilities.slsDeleteDomain(TempDir);
            await utilities.slsCreateDomain(TempDir);
            await utilities.slsDeploy(TempDir);

            const basePath = await utilities.getBasePath(testURL);
            expect(basePath).to.equal("api");
        } finally {
            await utilities.destroyResources(testName);
        }
    });

    it("Delete domain then remove", async () => {
        const testName = "null-basepath-mapping";
        const configFolder = `${CONFIGS_FOLDER}/${testName}`;
        const testURL = `${UrlPrefix}-${testName}.${TestDomain}`;
        // Perform sequence of commands to replicate basepath mapping issue
        try {
            await utilities.createTempDir(TempDir, configFolder);
            await utilities.slsCreateDomain(TempDir);
            await utilities.slsDeploy(TempDir);
            await utilities.slsDeleteDomain(TempDir);
            await utilities.slsRemove(TempDir);
            await utilities.slsCreateDomain(TempDir);
            await utilities.slsDeploy(TempDir);

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
        const testExportURL = `${UrlPrefix}-${testExportName}.${TestDomain}`;
        // Perform sequence of commands to replicate basepath mapping issue
        try {
            await utilities.createTempDir(TempDir, configExportFolder);
            await utilities.slsDeploy(TempDir);

            await utilities.createTempDir(TempDir, configImportFolder);
            await utilities.slsDeploy(TempDir);

            const basePath = await utilities.getBasePath(testExportURL);
            expect(basePath).to.equal("hello-world");
        } finally {
            // should destroy the last created config folder ( import config )
            await utilities.destroyResources(`${testExportName} & ${testImportName}`);
        }
    });

    it("Creates a domain multiple times without failure", async () => {
        const testName = "create-domain-idempotent";
        const configFolder = `${CONFIGS_FOLDER}/${testName}`;
        try {
            await utilities.createTempDir(TempDir, configFolder);
            await utilities.slsCreateDomain(TempDir);
            await utilities.slsCreateDomain(TempDir);
            await utilities.slsCreateDomain(TempDir);
            await utilities.slsDeploy(TempDir);
        } finally {
            await utilities.destroyResources(testName);
        }
    });

    it("Deploys multiple times without failure", async () => {
        const testName = "deploy-idempotent";
        const configFolder = `${CONFIGS_FOLDER}/${testName}`;
        try {
            await utilities.createTempDir(TempDir, configFolder);
            await utilities.slsCreateDomain(TempDir);
            await utilities.slsDeploy(TempDir);
            await utilities.slsDeploy(TempDir);
            await utilities.slsDeploy(TempDir);
        } finally {
            await utilities.destroyResources(testName);
        }
    });

    it("Deploy multi domains", async () => {
        const testName = "http-api-multiple";
        const configFolder = `${CONFIGS_FOLDER}/${testName}`;
        try {
            await utilities.createTempDir(TempDir, configFolder);
            await utilities.slsDeploy(TempDir);
        } finally {
            await utilities.destroyResources(testName);
        }
    });
});

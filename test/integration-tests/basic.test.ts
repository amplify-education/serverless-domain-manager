import chai = require("chai");
import "mocha";
import utilities = require("./test-utilities");
import {
    PLUGIN_IDENTIFIER,
    RANDOM_STRING,
    TEMP_DIR,
    TEST_DOMAIN,
} from "./base"; // tslint:disable-line

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
});

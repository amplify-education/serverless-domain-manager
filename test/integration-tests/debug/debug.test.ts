import "mocha";
import utilities = require("../test-utilities");
import { TEMP_DIR } from "../base";

const CONFIGS_FOLDER = "debug";
const TIMEOUT_MINUTES = 15 * 60 * 1000; // 15 minutes in milliseconds

describe("Integration Tests", function () {
  this.timeout(TIMEOUT_MINUTES);

  it("Creates pr-example", async () => {
    const testName = "pr-example";
    const configFolder = `${CONFIGS_FOLDER}/${testName}`;

    try {
      await utilities.createTempDir(TEMP_DIR, configFolder);
      await utilities.slsCreateDomain(TEMP_DIR, true);
      await utilities.slsDeploy(TEMP_DIR, true);
    } finally {
      await utilities.destroyResources(testName);
    }
  });
});

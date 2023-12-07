import randomstring = require("randomstring");

// this is set in the each sls configs for the cleanup purpose in case of tests failure
const PLUGIN_IDENTIFIER = "sdm";
const RANDOM_STRING = randomstring.generate({
  capitalization: "lowercase",
  charset: "alphanumeric",
  length: 5
});
const TEMP_DIR = `~/tmp/domain-manager-integration-tests/${RANDOM_STRING}`;
const TEST_DOMAIN = process.env.TEST_DOMAIN;

// setting a `RANDOM_STRING` variable to use in each integration test
// by this we are going to run unique test each time
// and handling case for running tests for the same AWS account at the same time by different runs
process.env.PLUGIN_IDENTIFIER = PLUGIN_IDENTIFIER;
process.env.RANDOM_STRING = RANDOM_STRING;

if (!TEST_DOMAIN) {
  throw new Error("TEST_DOMAIN environment variable not set");
}

export {
  PLUGIN_IDENTIFIER,
  RANDOM_STRING,
  TEMP_DIR,
  TEST_DOMAIN
};

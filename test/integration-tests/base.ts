import randomstring = require("randomstring");

const TEST_DOMAIN = process.env.TEST_DOMAIN;

if (!TEST_DOMAIN) {
    throw new Error("TEST_DOMAIN environment variable not set");
}

const RANDOM_STRING = randomstring.generate({
    capitalization: "lowercase",
    charset: "alphanumeric",
    length: 5,
});
const TEMP_DIR = `~/tmp/domain-manager-test-${RANDOM_STRING}`;
const TIMEOUT_MINUTES = 20 * 60 * 1000; // 20 minutes in milliseconds

export {
    TIMEOUT_MINUTES,
    RANDOM_STRING,
    TEMP_DIR,
    TEST_DOMAIN,
};

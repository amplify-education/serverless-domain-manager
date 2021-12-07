import randomstring = require("randomstring");

const TEMP_DIR = `~/tmp/domain-manager-integration-tests`;
const TEST_DOMAIN = process.env.TEST_DOMAIN;

if (!TEST_DOMAIN) {
    throw new Error("TEST_DOMAIN environment variable not set");
}

function getRandomString(): string {
    return randomstring.generate({
        capitalization: "lowercase",
        charset: "alphanumeric",
        length: 5,
    });
}

export {
    getRandomString,
    TEMP_DIR,
    TEST_DOMAIN,
};

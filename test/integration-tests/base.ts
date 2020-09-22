import randomstring = require("randomstring");

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
    TEST_DOMAIN,
};

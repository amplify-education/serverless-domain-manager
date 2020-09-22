const TEST_DOMAIN = process.env.TEST_DOMAIN;

if (!TEST_DOMAIN) {
    throw new Error("TEST_DOMAIN environment variable not set");
}
export {
    TEST_DOMAIN,
};

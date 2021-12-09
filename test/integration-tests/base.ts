const TempDir = `~/tmp/domain-manager-integration-tests`;
const TestDomain = process.env.TEST_DOMAIN;
const UrlPrefix = "sls-dm"; // this is set in the each sls configs

if (!TestDomain) {
    throw new Error("TEST_DOMAIN environment variable not set");
}

export {
    TempDir,
    TestDomain,
    UrlPrefix
};

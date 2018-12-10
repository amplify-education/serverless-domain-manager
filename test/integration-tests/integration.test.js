'use strict';

const chai = require('chai');
const itParam = require('mocha-param');

const utilities = require('./test-utilities');

const expect = chai.expect;

const TEST_DOMAIN = process.env.TEST_DOMAIN;
const SIX_HOURS = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
const testCases = [
  {
    testDescription: 'Enabled with default values',
    testFolder: 'test1',
    testDomain: `test1.${TEST_DOMAIN}`,
    testStage: 'dev',
    testBasePath: '(none)',
    testEndpoint: 'EDGE',
    testURL: `https://test1.${TEST_DOMAIN}/hello-world`,
  },
  {
    testDescription: 'Enabled with custom basepath',
    testFolder: 'test2',
    testDomain: `test2.${TEST_DOMAIN}`,
    testStage: 'dev',
    testBasePath: 'api',
    testEndpoint: 'EDGE',
    testURL: `https://test2.${TEST_DOMAIN}/api/hello-world`,
  },
  {
    testDescription: 'Enabled with custom stage and empty basepath',
    testFolder: 'test3',
    testDomain: `test3.${TEST_DOMAIN}`,
    testStage: 'test',
    testBasePath: '(none)',
    testEndpoint: 'EDGE',
    testURL: `https://test3.${TEST_DOMAIN}/hello-world`,
  },
  {
    testDescription: 'Enabled with regional endpoint, custom basePath',
    testFolder: 'test4',
    testDomain: `test4.${TEST_DOMAIN}`,
    testStage: 'dev',
    testBasePath: 'api',
    testEndpoint: 'REGIONAL',
    testURL: `https://test4.${TEST_DOMAIN}/api/hello-world`,
  },
  {
    testDescription: 'Enabled with regional endpoint, custom stage, empty basepath',
    testFolder: 'test5',
    testDomain: `test5.${TEST_DOMAIN}`,
    testStage: 'test',
    testBasePath: '(none)',
    testEndpoint: 'REGIONAL',
    testURL: `https://test5.${TEST_DOMAIN}/hello-world`,
  },
  {
    testDescription: 'Enabled with regional endpoint and empty basepath',
    testFolder: 'test6',
    testDomain: `test6.${TEST_DOMAIN}`,
    testStage: 'dev',
    testBasePath: '(none)',
    testEndpoint: 'REGIONAL',
    testURL: `https://test6.${TEST_DOMAIN}/hello-world`,
  },
];


describe('Integration Tests', function () { // eslint-disable-line func-names
  this.timeout(SIX_HOURS); // 6 hours to allow for dns to propogate

  before(async () => {
    await utilities.linkPackages();
  });

  describe('Domain Manager Is Enabled', function () { // eslint-disable-line func-names
    this.timeout(SIX_HOURS);

    itParam('${value.testDescription}', testCases, async (value) => { // eslint-disable-line no-template-curly-in-string
      const created = await utilities.createResources(value.testFolder, value.testDomain, true);
      if (created) {
        const stage = await utilities.getStage(value.testDomain);
        expect(stage).to.equal(value.testStage);

        const basePath = await utilities.getBasePath(value.testDomain);
        expect(basePath).to.equal(value.testBasePath);

        const endpoint = await utilities.getEndpointType(value.testDomain);
        expect(endpoint).to.equal(value.testEndpoint);

        const status = await utilities.curlUrl(value.testURL);
        expect(status).to.equal(200);
      }
      await utilities.destroyResources(value.testFolder, value.testDomain);
    });
  });

  describe('Domain Manager Is Not Enabled', function () { // eslint-disable-line func-names
    this.timeout(5 * 60 * 1000); // 5 minutes in milliseconds
    const testName = 'test7';
    const testURL = `${testName}.${TEST_DOMAIN}`;

    before(async () => {
      await utilities.createResources(testName, testURL, false);
    });

    it('Does not create a domain', async () => {
      const data = await utilities.curlUrl(`https://${testURL}/hello-world`);
      expect(data).to.equal(null);
    });

    after(async () => {
      await utilities.destroyResources(testName, testURL);
    });
  });
});


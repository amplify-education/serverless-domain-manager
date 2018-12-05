'use strict';

const chai = require('chai');
const utilities = require('./test-utilities');

const expect = chai.expect;

const TEST_DOMAIN = process.env.TEST_DOMAIN;


describe('Integration Tests', function () {
  this.timeout(21600000); // 6 hours to allow for dns to propogate

  before(async () => {
    await utilities.linkPackages();
  });

  describe('Test 1', function () {
    this.timeout(2700000); // 45 minutes
    const testName = 'test1';
    const testURL = `${testName}.${TEST_DOMAIN}`;

    before(async () => {
      const created = await utilities.createResources(testName, testURL, true);
      if (!created) {
        console.error('\tResources Not Created');
      }
    });

    it('Defaults "stage" to "dev"', async () => {
      const data = await utilities.getStage(testURL);
      expect(data).to.equal('dev');
    });

    it('Basepath was set to "(none)"', async () => {
      const data = await utilities.getBasePath(testURL);
      expect(data).to.equal('(none)');
    });

    it('Makes an edge endpoint', async () => {
      const data = await utilities.getEndpointType(testURL);
      expect(data).to.equal('EDGE');
    });

    it('Creates a domain properly', async () => {
      const data = await utilities.curlUrl(`https://${testURL}/hello-world`);
      expect(data).to.equal(200);
    });

    after(async () => {
      const destroy = await utilities.destroyResources(testName, testURL);
      if (!destroy) {
        console.error('\tResources Not Cleaned Up');
      }
    });
  });

  describe('Test 2', function () {
    this.timeout(2700000); // 45 minutes
    const testName = 'test2';
    const testURL = `${testName}.${TEST_DOMAIN}`;

    before(async () => {
      const created = await utilities.createResources(testName, testURL, true);
      if (!created) {
        console.error('\tResources Not Created');
      }
    });

    it('Defaults "stage" to "dev"', async () => {
      const data = await utilities.getStage(testURL);
      expect(data).to.equal('dev');
    });

    it('Basepath was set to "api"', async () => {
      const data = await utilities.getBasePath(testURL);
      expect(data).to.equal('api');
    });

    it('Makes an edge endpoint', async () => {
      const data = await utilities.getEndpointType(testURL);
      expect(data).to.equal('EDGE');
    });

    it('Creates a domain properly', async () => {
      const data = await utilities.curlUrl(`https://${testURL}/api/hello-world`);
      expect(data).to.equal(200);
    });

    after(async () => {
      const destroy = await utilities.destroyResources(testName, testURL);
      if (!destroy) {
        console.error('\tResources Not Cleaned Up');
      }
    });
  });

  describe('Test 3', function () {
    this.timeout(2700000); // 45 minutes
    const testName = 'test3';
    const testURL = `${testName}.${TEST_DOMAIN}`;

    before(async () => {
      const created = await utilities.createResources(testName, testURL, true);
      if (!created) {
        console.error('\tResources Not Created');
      }
    });

    it('Sets "stage" to "test"', async () => {
      const data = await utilities.getStage(testURL);
      expect(data).to.equal('test');
    });

    it('Basepath was set to "(none)"', async () => {
      const data = await utilities.getBasePath(testURL);
      expect(data).to.equal('(none)');
    });

    it('Makes an edge endpoint', async () => {
      const data = await utilities.getEndpointType(testURL);
      expect(data).to.equal('EDGE');
    });

    it('Creates a domain properly', async () => {
      const data = await utilities.curlUrl(`https://${testURL}/hello-world`);
      expect(data).to.equal(200);
    });

    after(async () => {
      const destroy = await utilities.destroyResources(testName, testURL);
      if (!destroy) {
        console.error('\tResources Not Cleaned Up');
      }
    });
  });

  describe('Test 4', function () {
    this.timeout(2700000); // 45 minutes
    const testName = 'test4';
    const testURL = `${testName}.${TEST_DOMAIN}`;

    before(async () => {
      const created = await utilities.createResources(testName, testURL, true);
      if (!created) {
        console.error('\tResources Not Created');
      }
    });

    it('Defaults "stage" to "dev"', async () => {
      const data = await utilities.getStage(testURL);
      expect(data).to.equal('dev');
    });

    it('Basepath was set to "api"', async () => {
      const data = await utilities.getBasePath(testURL);
      expect(data).to.equal('api');
    });

    it('Makes a regional endpoint', async () => {
      const data = await utilities.getEndpointType(testURL);
      expect(data).to.equal('REGIONAL');
    });

    it('Creates a domain properly', async () => {
      const data = await utilities.curlUrl(`https://${testURL}/api/hello-world`);
      expect(data).to.equal(200);
    });

    after(async () => {
      const destroy = await utilities.destroyResources(testName, testURL);
      if (!destroy) {
        console.error('\tResources Not Cleaned Up');
      }
    });
  });

  describe('Test 5', function () {
    this.timeout(2700000); // 45 minutes
    const testName = 'test5';
    const testURL = `${testName}.${TEST_DOMAIN}`;

    before(async () => {
      const created = await utilities.createResources(testName, testURL, true);
      if (!created) {
        console.error('\tResources Not Created');
      }
    });

    it('Sets "stage" to "test"', async () => {
      const data = await utilities.getStage();
      expect(data).to.equal('test');
    });

    it('Basepath was set to "(none)"', async () => {
      const data = await utilities.getBasePath(testURL);
      expect(data).to.equal('(none)');
    });

    it('Makes a regional endpoint', async () => {
      const data = await utilities.getEndpointType(testURL);
      expect(data).to.equal('REGIONAL');
    });

    it('Creates a domain properly', async () => {
      const data = await utilities.curlUrl(`https://${testURL}/hello-world`);
      expect(data).to.equal(200);
    });

    after(async () => {
      const destroy = await utilities.destroyResources(testName, testURL);
      if (!destroy) {
        console.error('\tResources Not Cleaned Up');
      }
    });
  });

  describe('Test 6', function () {
    this.timeout(2700000); // 45 minutes
    const testName = 'test6';
    const testURL = `${testName}${TEST_DOMAIN}`;

    before(async () => {
      const created = await utilities.createResources(testName, testURL, true);
      if (!created) {
        console.error('\tResources Not Created');
      }
    });

    it('Defaults "stage" to "dev"', async () => {
      const data = await utilities.getStage(testURL);
      expect(data).to.equal('dev');
    });

    it('Basepath was set to "(none)"', async () => {
      const data = await utilities.getBasePath(testURL);
      expect(data).to.equal('(none)');
    });

    it('Makes a regional endpoint', async () => {
      const data = await utilities.getEndpointType(testURL);
      expect(data).to.equal('REGIONAL');
    });

    it('Creates a domain properly', async () => {
      const data = await utilities.curlUrl(`https://${testURL}/hello-world`);
      expect(data).to.equal(200);
    });

    after(async () => {
      const destroy = await utilities.destroyResources(testName, testURL);
      if (!destroy) {
        console.error('\tResources Not Cleaned Up');
      }
    });
  });

  describe('Test 7', function () {
    this.timeout(2700000); // 45 minutes
    const testName = 'test7';
    const testURL = `${testName}.${TEST_DOMAIN}`;

    before(async () => {
      const created = await utilities.createResources(testName, testURL, false);
      if (!created) {
        console.error('\tResources Not Created');
      }
    });

    it('Does not create a domain', async () => {
      const data = await utilities.curlUrl(`https://${testURL}/hello-world`);
      expect(data).to.equal(null);
    });

    after(async () => {
      const destroy = await utilities.destroyResources(testName, testURL);
      if (!destroy) {
        console.error('\tResources Not Cleaned Up');
      }
    });
  });
});


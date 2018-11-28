'use strict';

/* eslint-disable no-console, no-unused-vars, func-names, no-await-in-loop */
const dns = require('dns');
const exec = require('child_process').exec;
const chai = require('chai');
const request = require('request-promise-native');
const aws = require('aws-sdk');

const expect = chai.expect;

const AWS_PROFILE = process.env.AWS_PROFILE;
const TEST_DOMAIN = process.env.TEST_DOMAIN;

function sleep(seconds) {
  return new Promise(resolve => setTimeout(resolve, 1000 * seconds));
}

async function linkPackages() {
  return new Promise((resolve, reject) => { // eslint-disable no-unused-vars
    exec('npm link serverless-domain-manager', (err, stdout, stderr) => {
      if (err || stderr) {
        return resolve(false);
      }
      return resolve(true);
    });
  });
}

async function curlUrl(url) {
  let response = null;
  response = await request.get({
    url,
    resolveWithFullResponse: true,
  })
  .catch((err) => {
    response = null;
  });
  if (response === undefined || response === null) {
    return null;
  }
  return Promise.resolve(response.statusCode);
}

async function getEndpointType(url) {
  let result = null;
  const apigateway = new aws.APIGateway({
    region: 'us-west-2',
    credentials: new aws.SharedIniFileCredentials(
      { profile: AWS_PROFILE },
    ),
  });
  const params = {
    domainName: url,
  };
  try {
    result = await apigateway.getDomainName(params).promise();
    return Promise.resolve(result.endpointConfiguration.types[0]);
  } catch (err) {
    return Promise.resolve(null);
  }
}

async function getStage(url) {
  let result = null;
  const apigateway = new aws.APIGateway({
    region: 'us-west-2',
    credentials: new aws.SharedIniFileCredentials(
      { profile: AWS_PROFILE },
    ),
  });
  const params = {
    domainName: url,
  };
  try {
    result = await apigateway.getBasePathMappings(params).promise();
    return Promise.resolve(result.items[0].stage);
  } catch (err) {
    return Promise.resolve(null);
  }
}

async function getBasePath(url) {
  let result = null;
  const apigateway = new aws.APIGateway({
    region: 'us-west-2',
    credentials: new aws.SharedIniFileCredentials(
      { profile: AWS_PROFILE },
    ),
  });
  const params = {
    domainName: url,
  };
  try {
    result = await apigateway.getBasePathMappings(params).promise();
    return Promise.resolve(result.items[0].basePath);
  } catch (err) {
    return Promise.resolve(null);
  }
}

function deployLambdas(folderName) {
  return new Promise((resolve, reject) => {
    exec(`cd test/${folderName} && sls create_domain && sls deploy`, (err, stdout, stderr) => {
      if (err || stderr) {
        return resolve(false);
      }
      return resolve(true);
    });
  });
}

function dnsLookup(url) {
  return new Promise((resolve, reject) => {
    dns.resolveAny(url, (err, ret) => {
      if (err) {
        return resolve(false);
      }
      return resolve(true);
    });
  });
}

async function verifyDnsPropogation(url, enabled) {
  console.debug('\tWaiting for DNS to Propogate...');
  let numRetries = 0;
  let dnsPropogated = false;
  while (numRetries < 40 && !dnsPropogated && enabled) {
    dnsPropogated = await dnsLookup(url);
    if (dnsPropogated) {
      break;
    }
    numRetries += 1;
    await sleep(60);
  }
  return dnsPropogated;
}

function removeLambdas(folderName) {
  return new Promise((resolve, reject) => {
    exec(`cd test/${folderName} && sls delete_domain && sls remove`, (err, stdout, stderr) => {
      if (err || stderr) {
        return resolve(false);
      }
      return resolve(true);
    });
  });
}

async function createResources(folderName, url, enabled) {
  console.debug(`\tCreating Resources for ${url}`);
  const created = await deployLambdas(folderName);
  let dnsVerified = false;
  if (created) {
    dnsVerified = await verifyDnsPropogation(url, enabled);
  }
  return created && dnsVerified;
}

async function destroyResources(folderName, url) {
  console.debug(`\tCleaning Up Resources for ${url}`);
  const clean = await removeLambdas(folderName);
  return clean;
}


describe('Integration Tests', function () {
  this.timeout(21600000); // 6 hours to allow for dns to propogate

  before(async () => {
    await linkPackages();
  });

  describe('Test 1', function () {
    this.timeout(2700000); // 45 minutes
    const testName = 'test1';
    const testURL = `${testName}.${TEST_DOMAIN}`;

    before(async () => {
      const created = await createResources(testName, testURL, true);
      if (!created) {
        console.error('\tResources Not Created');
      }
    });

    it('Defaults "stage" to "dev"', async () => {
      const data = await getStage(testURL);
      expect(data).to.equal('dev');
    });

    it('Basepath was set to "(none)"', async () => {
      const data = await getBasePath(testURL);
      expect(data).to.equal('(none)');
    });

    it('Makes an edge endpoint', async () => {
      const data = await getEndpointType(testURL);
      expect(data).to.equal('EDGE');
    });

    it('Creates a domain properly', async () => {
      const data = await curlUrl(`https://${testURL}/hello-world`);
      expect(data).to.equal(200);
    });

    after(async () => {
      const destroy = await destroyResources(testName, testURL);
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
      const created = await createResources(testName, testURL, true);
      if (!created) {
        console.error('\tResources Not Created');
      }
    });

    it('Defaults "stage" to "dev"', async () => {
      const data = await getStage(testURL);
      expect(data).to.equal('dev');
    });

    it('Basepath was set to "api"', async () => {
      const data = await getBasePath(testURL);
      expect(data).to.equal('api');
    });

    it('Makes an edge endpoint', async () => {
      const data = await getEndpointType(testURL);
      expect(data).to.equal('EDGE');
    });

    it('Creates a domain properly', async () => {
      const data = await curlUrl(`https://${testURL}/api/hello-world`);
      expect(data).to.equal(200);
    });

    after(async () => {
      const destroy = await destroyResources(testName, testURL);
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
      const created = await createResources(testName, testURL, true);
      if (!created) {
        console.error('\tResources Not Created');
      }
    });

    it('Sets "stage" to "test"', async () => {
      const data = await getStage(testURL);
      expect(data).to.equal('test');
    });

    it('Basepath was set to "(none)"', async () => {
      const data = await getBasePath(testURL);
      expect(data).to.equal('(none)');
    });

    it('Makes an edge endpoint', async () => {
      const data = await getEndpointType(testURL);
      expect(data).to.equal('EDGE');
    });

    it('Creates a domain properly', async () => {
      const data = await curlUrl(`https://${testURL}/hello-world`);
      expect(data).to.equal(200);
    });

    after(async () => {
      const destroy = await destroyResources(testName, testURL);
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
      const created = await createResources(testName, testURL, true);
      if (!created) {
        console.error('\tResources Not Created');
      }
    });

    it('Defaults "stage" to "dev"', async () => {
      const data = await getStage(testURL);
      expect(data).to.equal('dev');
    });

    it('Basepath was set to "api"', async () => {
      const data = await getBasePath(testURL);
      expect(data).to.equal('api');
    });

    it('Makes a regional endpoint', async () => {
      const data = await getEndpointType(testURL);
      expect(data).to.equal('REGIONAL');
    });

    it('Creates a domain properly', async () => {
      const data = await curlUrl(`https://${testURL}/api/hello-world`);
      expect(data).to.equal(200);
    });

    after(async () => {
      const destroy = await destroyResources(testName, testURL);
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
      const created = await createResources(testName, testURL, true);
      if (!created) {
        console.error('\tResources Not Created');
      }
    });

    it('Sets "stage" to "test"', async () => {
      const data = await getStage();
      expect(data).to.equal('test');
    });

    it('Basepath was set to "(none)"', async () => {
      const data = await getBasePath(testURL);
      expect(data).to.equal('(none)');
    });

    it('Makes a regional endpoint', async () => {
      const data = await getEndpointType(testURL);
      expect(data).to.equal('REGIONAL');
    });

    it('Creates a domain properly', async () => {
      const data = await curlUrl(`https://${testURL}/hello-world`);
      expect(data).to.equal(200);
    });

    after(async () => {
      const destroy = await destroyResources(testName, testURL);
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
      const created = await createResources(testName, testURL, true);
      if (!created) {
        console.error('\tResources Not Created');
      }
    });

    it('Defaults "stage" to "dev"', async () => {
      const data = await getStage(testURL);
      expect(data).to.equal('dev');
    });

    it('Basepath was set to "(none)"', async () => {
      const data = await getBasePath(testURL);
      expect(data).to.equal('(none)');
    });

    it('Makes a regional endpoint', async () => {
      const data = await getEndpointType(testURL);
      expect(data).to.equal('REGIONAL');
    });

    it('Creates a domain properly', async () => {
      const data = await curlUrl(`https://${testURL}/hello-world`);
      expect(data).to.equal(200);
    });

    after(async () => {
      const destroy = await destroyResources(testName, testURL);
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
      const created = await createResources(testName, testURL, false);
      if (!created) {
        console.error('\tResources Not Created');
      }
    });

    it('Does not create a domain', async () => {
      const data = await curlUrl(`https://${testURL}/hello-world`);
      expect(data).to.equal(null);
    });

    after(async () => {
      const destroy = await destroyResources(testName, testURL);
      if (!destroy) {
        console.error('\tResources Not Cleaned Up');
      }
    });
  });
});


'use strict';

/* eslint-disable no-console, no-unused-vars, func-names, no-await-in-loop */

const request = require('request-promise-native');
const aws = require('aws-sdk');
const dns = require('dns');
const exec = require('child_process').exec;

const AWS_PROFILE = process.env.AWS_PROFILE;


const apiGateway = new aws.APIGateway({
  region: 'us-west-2',
  credentials: new aws.SharedIniFileCredentials(
    { profile: AWS_PROFILE },
  ),
});

/**
 * Stops event thread execution for given number of seconds.
 * @param seconds
 * @returns {Promise<any>} Resolves after given number of seconds.
 */
function sleep(seconds) {
  return new Promise(resolve => setTimeout(resolve, 1000 * seconds));
}

/**
 * Links current serverless-domain-manager to global node_modules in order to run tests.
 * @returns {Promise<boolean>} Resolves true if successfully linked, else false.
 */
async function linkPackages() {
  return new Promise((resolve, reject) => {
    exec('npm link serverless-domain-manager', (err, stdout, stderr) => {
      if (err || stderr) {
        return resolve(false);
      }
      return resolve(true);
    });
  });
}

/**
 * Curls the given URL to see if it exists
 * @param url
 * @returns {Promise<Number|null>} Resolves to status code if exists, else null.
 */
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

/**
 * Gets endpoint type of given URL from AWS
 * @param url
 * @returns {Promise<String|null>} Resolves to String if endpoint exists, else null.
 */
async function getEndpointType(url) {
  const params = {
    domainName: url,
  };
  try {
    const result = await apiGateway.getDomainName(params).promise();
    return result.endpointConfiguration.types[0];
  } catch (err) {
    return null;
  }
}

/**
 * Gets stage of given URL from AWS
 * @param url
 * @returns {Promise<String|null>} Resolves to String if stage exists, else null.
 */
async function getStage(url) {
  const params = {
    domainName: url,
  };
  try {
    const result = await apiGateway.getBasePathMappings(params).promise();
    return result.items[0].stage;
  } catch (err) {
    return null;
  }
}

/**
 * Gets basePath of given URL from AWS
 * @param url
 * @returns {Promise<String|null>} Resolves to String if basePath exists, else null.
 */
async function getBasePath(url) {
  const params = {
    domainName: url,
  };
  try {
    const result = await apiGateway.getBasePathMappings(params).promise();
    return result.items[0].basePath;
  } catch (err) {
    return null;
  }
}

/**
 * Creates the lambda function and associated domain name in given folder
 * @param folderName
 * @returns {Promise<boolean>} Resolves true if lambda deployed, else false.
 */
function deployLambdas(folderName) {
  return new Promise((resolve, reject) => {
    exec(`cd 'test/integration-tests/${folderName}' && sls create_domain && sls deploy`, (err, stdout, stderr) => {
      if (err || stderr) {
        return resolve(false);
      }
      return resolve(true);
    });
  });
}

/**
 * Looks up DNS records for the given url
 * @param url
 * @returns {Promise<boolean>} Resolves true if DNS records exist, else false.
 */
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

/**
 * Periodically calls dnsLookup until records found or 40 minutes elapse.
 * @param url
 * @param enabled
 * @returns {Promise<boolean>} Resolves true if records found, else false.
 */
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

/**
 * Removes the lambda function and associated domain name from given folder
 * @param folderName
 * @returns {Promise<boolean>} Resolves to true if lambda removed, else false.
 */
function removeLambdas(folderName) {
  return new Promise((resolve, reject) => {
    exec(`cd 'test/integration-tests/${folderName}' && sls delete_domain && sls remove`, (err, stdout, stderr) => {
    if (err || stderr) {
      return resolve(false);
    }
      return resolve(true);
    });
  });
}

/**
 * Wraps creation of testing resources.
 * @param folderName
 * @param url
 * @param enabled
 * @returns {Promise<boolean>} Resolves true if resources created, else false.
 */
async function createResources(folderName, url, enabled) {
  console.debug(`\tCreating Resources for ${url}`);
  const created = await deployLambdas(folderName);
  let dnsVerified = false;
  if (created) {
    dnsVerified = await verifyDnsPropogation(url, enabled);
  }
  if (created && dnsVerified) {
    console.debug('\tResources Created');
  }
  else {
    console.debug('\tResources Failed to Create');
  }
  return created && dnsVerified;
}

/**
 * Wraps deletion of testing resources.
 * @param folderName
 * @param url
 * @returns {Promise<boolean>} Resolves true if resources destroyed, else false.
 */
async function destroyResources(folderName, url) {
  console.debug(`\tCleaning Up Resources for ${url}`);
  const removed = await removeLambdas(folderName);
  if (removed) {
    console.debug('\tResources Cleaned Up');
  }
  else {
    console.debug('\tFailed to Clean Up Resources');
  }
  return removed;
}

module.exports = {
  curlUrl,
  createResources,
  destroyResources,
  verifyDnsPropogation,
  dnsLookup,
  deployLambdas,
  getEndpointType,
  getBasePath,
  getStage,
  linkPackages,
  sleep,
};
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


function sleep(seconds) {
  return new Promise(resolve => setTimeout(resolve, 1000 * seconds));
}


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
  const params = {
    domainName: url,
  };
  try {
    let result = await apiGateway.getDomainName(params).promise();
    return Promise.resolve(result.endpointConfiguration.types[0]);
  } catch (err) {
    return Promise.resolve(null);
  }
}

async function getStage(url) {
  const params = {
    domainName: url,
  };
  try {
    let result = await apiGateway.getBasePathMappings(params).promise();
    return Promise.resolve(result.items[0].stage);
  } catch (err) {
    return Promise.resolve(null);
  }
}

async function getBasePath(url) {
  const params = {
    domainName: url,
  };
  try {
    let result = await apiGateway.getBasePathMappings(params).promise();
    return Promise.resolve(result.items[0].basePath);
  } catch (err) {
    return Promise.resolve(null);
  }
}

function deployLambdas(folderName) {
  return new Promise((resolve, reject) => {
    exec(`cd test/integration-tests/${folderName} && sls create_domain && sls deploy`, (err, stdout, stderr) => {
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
    exec(`cd test/integration-tests/${folderName} && sls delete_domain && sls remove`, (err, stdout, stderr) => {
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
  if (created && dnsVerified) {
    console.debug('\tResources Created');
  }
  else {
    console.debug('\tResources Failed to Create');
  }
  return created && dnsVerified;
}

async function destroyResources(folderName, url) {
  console.debug(`\tCleaning Up Resources for ${url}`);
  const removed = await removeLambdas(folderName);
  if (removed) {
    console.debug('\tResources Cleaned Up');
  }
  else {
    console.debug('\tFailed to Clean Up Resources');
  }
}

module.exports = {
  curlUrl: curlUrl,
  createResources: createResources,
  destroyResources: destroyResources,
  verifyDnsPropogation: verifyDnsPropogation,
  dnsLookup: dnsLookup,
  deployLambdas: deployLambdas,
  getEndpointType: getEndpointType,
  getBasePath: getBasePath,
  getStage: getStage,
  linkPackages: linkPackages,
  sleep: sleep
}
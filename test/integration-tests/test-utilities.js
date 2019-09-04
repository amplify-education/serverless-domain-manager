"use strict";

const request = require("request-promise-native");
const aws = require("aws-sdk");
const dns = require("dns");
const shell = require("shelljs");

const AWS_PROFILE = process.env.AWS_PROFILE;
const apigatewayv2 = new aws.ApiGatewayV2({
  region: "us-east-1",
  credentials: new aws.SharedIniFileCredentials(
    { profile: AWS_PROFILE },
  ),
});

const apigateway = new aws.APIGateway({
  region: "us-east-1",
  credentials: new aws.SharedIniFileCredentials(
    { profile: AWS_PROFILE },
  ),
});

class CreationError extends Error {}


/**
 * Stops event thread execution for given number of seconds.
 * @param seconds
 * @returns {Promise<any>} Resolves after given number of seconds.
 */
function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, 1000 * seconds));
}

/**
 * Executes given shell command.
 * @param cmd shell command to execute
 * @returns {Promise<boolean>} Resolves true if successfully executed, else false
 */
async function exec(cmd) {
  return new Promise((resolve) => {
    shell.exec(`${cmd}`, { silent: true }, (err, stdout, stderr) => {
      if (err || stderr) {
        return resolve(false);
      }
      return resolve(true);
    });
  });
}

/**
 * Move item in folderName to created tempDir
 * @param {string} tempDir
 * @param {string} folderName
 */
async function createTempDir(tempDir, folderName) {
  await exec(`rm -rf ${tempDir}`);
  await exec(`mkdir -p ${tempDir} && cp -R test/integration-tests/${folderName}/. ${tempDir}`);
  await exec(`mkdir -p ${tempDir}/node_modules/serverless-domain-manager`);
  await exec(`cp -R . ${tempDir}/node_modules/serverless-domain-manager`);
}

/**
 * Links current serverless-domain-manager to global node_modules in order to run tests.
 * @returns {Promise<boolean>} Resolves true if successfully linked, else false.
 */
async function linkPackages() {
  return new Promise((resolve) => {
    shell.exec("npm link serverless-domain-manager", { silent: true }, (err, stdout, stderr) => {
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
  .catch((err) => { // eslint-disable-line no-unused-vars
    response = null;
  });
  if (response === undefined || response === null) {
    return null;
  }
  return response.statusCode;
}

/**
 * Gets endpoint type of given URLs from AWS
 * @param urls
 * @returns {Promise<String|null>} Resolves to String if endpoint exists, else null.
 */
async function getEndpointType(urls) {
  const results = new Map();

  const iterator = urls.entries();
  let url = iterator.next();
  while (!url.done) {
      try {
          const resp = await apigatewayv2.getDomainName({DomainName: url.value[1]}).promise();
          results.set(url.value[0], resp.DomainNameConfigurations[0].EndpointType);
          url = iterator.next();
      } catch(err) {
          results.set(url.value[0], null);
          url = iterator.next();
      }
  }
  return [...results.values()]
}

/**
 * Gets stage of given URLs from AWS
 * @param urls
 * @returns {Promise<String|null>} Resolves to String if stage exists, else null.
 */
async function getStage(urls) {
  const results = new Map();

  const iterator = urls.entries();
  let url = iterator.next();
  while (!url.done) {
      try {
          const resp = await apigatewayv2.getApiMappings({DomainName: url.value[1]}).promise();
          results.set(url.value[0], resp.Items[0].Stage);
          url = iterator.next();
      } catch(err) {
          results.set(url.value[0], null);
          url = iterator.next();
      }
  }
  return [...results.values()]
}

/**
 * Gets basePath of given URLs from AWS
 * @param urls
 * @returns {Promise<String|null>} Resolves to String if basePath exists, else null.
 */
async function getBasePath(urls) {
  const results = new Map();

  const iterator = urls.entries();
  let url = iterator.next();
  while (!url.done) {
      try {
          const resp = await apigatewayv2.getApiMappings({DomainName: url.value[1]}).promise();
          results.set(url.value[0], resp.Items[0].ApiMappingKey);
          url = iterator.next();
      } catch(err) {
          results.set(url.value[0], null);
          url = iterator.next();
      }
  }
  return [...results.values()]
}

/**
 * Looks up DNS records for the given url
 * @param url
 * @returns {Promise<boolean>} Resolves true if DNS records exist, else false.
 */
function dnsLookup(url) {
  return new Promise((resolve) => {
    dns.lookup(url, (err) => {
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
async function verifyDnsPropogation(urls, enabled) {
  console.debug("\tWaiting for DNS to Propogate..."); // eslint-disable-line no-console
  if (!enabled) {
    return true;
  }
  const results = {
    "REST": null,
    "WEBSOCKET": null
  }
  let numRetries = 0;
  fifo = [...urls]
  while (numRetries < 40 && fifo.length != 0 && enabled) {
    url = fifo.shift()
    dnsPropogated = await dnsLookup(url[1]); // eslint-disable-line no-await-in-loop
    if (dnsPropogated) {
        results[url[0]] = dnsPropogated
    } else {
        fifo.push(url)
    }
    numRetries += 1;
    await sleep(5); // eslint-disable-line no-await-in-loop
  }
  return Object.values(results)
}

/**
 * Make API Gateway calls to create an API Gateway
 * @param {string} randString
 * @return {Object} Contains restApiId and resourceId
 */
async function setupApiGatewayResources(randString) {
  const restApiInfo = await apigateway.createRestApi({ name: `rest-api-${randString}` }).promise();
  const restApiId = restApiInfo.id;
  const resourceInfo = await apigateway.getResources({ restApiId }).promise();
  const resourceId = resourceInfo.items[0].id;
  shell.env.REST_API_ID = restApiId;
  shell.env.RESOURCE_ID = resourceId;
  return { restApiId, resourceId };
}

/**
 * Make API Gateway calls to delete an API Gateway
 * @param {string} restApiId
 * @return {boolean} Returns true if deleted
 */
async function deleteApiGatewayResources(restApiId) {
  return apigateway.deleteRestApi({ restApiId }).promise();
}

/**
 * Runs `sls create_domain` for the given folder
 * @param tempDir
 * @param domainIdentifier Random alphanumeric string to identify specific run of integration tests.
 * @returns {Promise<any>}
 */
function slsCreateDomain(tempDir, domainIdentifier) {
  return new Promise((resolve) => {
    shell.exec(`cd ${tempDir} && sls create_domain --RANDOM_STRING ${domainIdentifier}`, { silent: true }, (err, stdout, stderr) => {
      if (err || stderr) {
        return resolve(false);
      }
      return resolve(true);
    });
  });
}

/**
 * Runs `sls deploy` for the given folder
 * @param tempDir
 * @param domainIdentifier Random alphanumeric string to identify specific run of integration tests.
 * @returns {Promise<any>}
 */
function slsDeploy(tempDir, domainIdentifier) {
  return new Promise((resolve) => {
    shell.exec(`cd ${tempDir} && sls deploy --RANDOM_STRING ${domainIdentifier}`, { silent: true }, (err, stdout, stderr) => {
      if (err || stderr) {
        return resolve(false);
      }
      return resolve(true);
    });
  });
}

/**
 * Runs `sls delete_domain` for the given folder
 * @param tempDir
 * @param domainIdentifier Random alphanumeric string to identify specific run of integration tests.
 * @returns {Promise<any>}
 */
function slsDeleteDomain(tempDir, domainIdentifier) {
  return new Promise((resolve) => {
    shell.exec(`cd ${tempDir} && sls delete_domain --RANDOM_STRING ${domainIdentifier}`, { silent: true }, (err, stdout, stderr) => {
      if (err || stderr) {
        return resolve(false);
      }
      return resolve(true);
    });
  });
}

/**
 * Runs `sls remove` for the given folder
 * @param tempDir
 * @param domainIdentifier Random alphanumeric string to identify specific run of integration tests.
 * @returns {Promise<any>}
 */
function slsRemove(tempDir, domainIdentifier) {
  return new Promise((resolve) => {
    shell.exec(`cd ${tempDir} && sls remove --RANDOM_STRING ${domainIdentifier}`, { silent: true }, (err, stdout, stderr) => {
      if (err || stderr) {
        return resolve(false);
      }
      return resolve(true);
    });
  });
}

/**
 * Runs both `sls create_domain` and `sls deploy`
 * @param tempDir
 * @param domainIdentifier Random alphanumeric string to identify specific run of integration tests.
 * @returns {Promise<*>}
 */
async function deployLambdas(tempDir, domainIdentifier) {
  const created = await slsCreateDomain(tempDir, domainIdentifier);
  const deployed = await slsDeploy(tempDir, domainIdentifier);
  return created && deployed;
}

/**
 * Runs both `sls delete_domain` and `sls remove`
 * @param tempDir temp directory where code is being run from
 * @param domainIdentifier Random alphanumeric string to identify specific run of integration tests.
 * @returns {Promise<*>}
 */
async function removeLambdas(tempDir, domainIdentifier) {
  const removed = await slsRemove(tempDir, domainIdentifier);
  const deleted = await slsDeleteDomain(tempDir, domainIdentifier);
  return deleted && removed;
}

/**
 * Wraps creation of testing resources.
 * @param folderName
 * @param url
 * @param domainIdentifier Random alphanumeric string to identify specific run of integration tests.
 * @param enabled
 * @returns {Promise<boolean>} Resolves true if resources created, else false.
 */
async function createResources(folderName, urls, domainIdentifier, enabled) {
  const resources = [...urls.values()]
  console.debug(`\tCreating Resources for ${resources[0]} & ${resources[1]}`); // eslint-disable-line no-console
  const tempDir = `~/tmp/domain-manager-test-${domainIdentifier}`;
  await createTempDir(tempDir, folderName);
  const created = await deployLambdas(tempDir, domainIdentifier);
  let [dnsVerifiedRest, dnsVerifiedWebsocket] = [false, false]
  if (created) {
    console.log("verify dns")
    [dnsVerifiedRest, dnsVerifiedWebsocket] = await verifyDnsPropogation(urls, enabled);
  }
  if (created && dnsVerifiedRest && dnsVerifiedWebsocket) {
    console.debug("\tResources Created"); // eslint-disable-line no-console
  } else {
    console.debug("\tResources Failed to Create"); // eslint-disable-line no-console
  }
  return created && dnsVerifiedRest && dnsVerifiedWebsocket;
}

/**
 * Wraps deletion of testing resources.
 * @param url
 * @param domainIdentifier Random alphanumeric string to identify specific run of integration tests.
 * @returns {Promise<boolean>} Resolves true if resources destroyed, else false.
 */
async function destroyResources(urls, domainIdentifier) {
  const resources = [...urls.values()]
  console.debug(`\tCleaning Up Resources for ${resources[0]} & ${resources[1]}`); // eslint-disable-line no-console
  const tempDir = `~/tmp/domain-manager-test-${domainIdentifier}`;
  const removed = await removeLambdas(tempDir, domainIdentifier);
  await exec(`rm -rf ${tempDir}`);
  if (removed) {
    console.debug("\tResources Cleaned Up"); // eslint-disable-line no-console
  } else {
    console.debug("\tFailed to Clean Up Resources"); // eslint-disable-line no-console
  }
  return removed;
}

module.exports = {
  curlUrl,
  createResources,
  createTempDir,
  destroyResources,
  exec,
  verifyDnsPropogation,
  dnsLookup,
  slsCreateDomain,
  slsDeploy,
  slsDeleteDomain,
  slsRemove,
  deployLambdas,
  removeLambdas,
  getEndpointType,
  getBasePath,
  getStage,
  linkPackages,
  sleep,
  CreationError,
  setupApiGatewayResources,
  deleteApiGatewayResources,
};

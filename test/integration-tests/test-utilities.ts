"use strict";

import aws = require("aws-sdk");
import shell = require("shelljs");

const AWS_PROFILE = process.env.AWS_PROFILE;
const apiGateway = new aws.APIGateway({
  credentials: new aws.SharedIniFileCredentials(
    { profile: AWS_PROFILE },
  ),
  region: "us-west-2",
});

/**
 * Executes given shell command.
 * @param cmd shell command to execute
 * @returns {Promise<void>} Resolves if successfully executed, else rejects
 */
async function exec(cmd) {
  console.debug(`\tRunning command: ${cmd}`);
  return new Promise((resolve, reject) => {
    shell.exec(cmd, {silent: false}, (err, stdout, stderr) => {
      if (err || stderr) {
        return reject();
      }
      return resolve();
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
  await exec(`mkdir -p ${tempDir}/node_modules/.bin`);
  await exec(`ln -s $(pwd) ${tempDir}/node_modules/`);

  await exec(`ln -s $(pwd)/node_modules/serverless ${tempDir}/node_modules/`);
  // link serverless to the bin directory so we can use $(npm bin) to get the path to serverless
  await exec(`ln -s $(pwd)/node_modules/serverless/bin/serverless.js ${tempDir}/node_modules/.bin/serverless`);
}

/**
 * Gets endpoint type of given URL from AWS
 * @param url
 * @returns {Promise<String>}
 */
async function getEndpointType(url) {
  const result = await apiGateway.getDomainName({
    domainName: url,
  }).promise();

  return result.endpointConfiguration.types[0];
}

/**
 * Gets stage of given URL from AWS
 * @param url
 * @returns {Promise<String>}
 */
async function getStage(url) {
  const result = await apiGateway.getBasePathMappings({
    domainName: url,
  }).promise();

  return result.items[0].stage;
}

/**
 * Gets basePath of given URL from AWS
 * @param url
 * @returns {Promise<String>}
 */
async function getBasePath(url) {
  const result = await apiGateway.getBasePathMappings({
    domainName: url,
  }).promise();

  return result.items[0].basePath;
}

/**
 * Make API Gateway calls to create an API Gateway
 * @param {string} randString
 * @return {Object} Contains restApiId and resourceId
 */
async function setupApiGatewayResources(randString) {
  const restApiInfo = await apiGateway.createRestApi({ name: `rest-api-${randString}` }).promise();
  const restApiId = restApiInfo.id;
  const resourceInfo = await apiGateway.getResources({ restApiId }).promise();
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
  return apiGateway.deleteRestApi({ restApiId }).promise();
}

/**
 * Runs `sls create_domain` for the given folder
 * @param tempDir
 * @param domainIdentifier Random alphanumeric string to identify specific run of integration tests.
 * @returns {Promise<void>}
 */
function slsCreateDomain(tempDir, domainIdentifier) {
  return exec(`cd ${tempDir} && $(npm bin)/serverless create_domain --RANDOM_STRING ${domainIdentifier}`);
}

/**
 * Runs `sls deploy` for the given folder
 * @param tempDir
 * @param domainIdentifier Random alphanumeric string to identify specific run of integration tests.
 * @returns {Promise<void>}
 */
function slsDeploy(tempDir, domainIdentifier) {
  return exec(`cd ${tempDir} && $(npm bin)/serverless deploy --RANDOM_STRING ${domainIdentifier}`);
}

/**
 * Runs `sls delete_domain` for the given folder
 * @param tempDir
 * @param domainIdentifier Random alphanumeric string to identify specific run of integration tests.
 * @returns {Promise<void>}
 */
function slsDeleteDomain(tempDir, domainIdentifier) {
  return exec(`cd ${tempDir} && $(npm bin)/serverless delete_domain --RANDOM_STRING ${domainIdentifier}`);
}

/**
 * Runs `sls remove` for the given folder
 * @param tempDir
 * @param domainIdentifier Random alphanumeric string to identify specific run of integration tests.
 * @returns {Promise<void>}
 */
function slsRemove(tempDir, domainIdentifier) {
  return exec(`cd ${tempDir} && $(npm bin)/serverless remove --RANDOM_STRING ${domainIdentifier}`);
}

/**
 * Runs both `sls create_domain` and `sls deploy`
 * @param tempDir
 * @param domainIdentifier Random alphanumeric string to identify specific run of integration tests.
 * @returns {Promise<void>}
 */
async function deployLambdas(tempDir, domainIdentifier) {
  await slsCreateDomain(tempDir, domainIdentifier);
  await slsDeploy(tempDir, domainIdentifier);
}

/**
 * Runs both `sls delete_domain` and `sls remove`
 * @param tempDir temp directory where code is being run from
 * @param domainIdentifier Random alphanumeric string to identify specific run of integration tests.
 * @returns {Promise<void>}
 */
async function removeLambdas(tempDir, domainIdentifier) {
  await slsRemove(tempDir, domainIdentifier);
  await slsDeleteDomain(tempDir, domainIdentifier);
}

/**
 * Wraps creation of testing resources.
 * @param folderName
 * @param url
 * @param domainIdentifier Random alphanumeric string to identify specific run of integration tests.
 * @param enabled
 * @returns {Promise<void>} Resolves if successfully executed, else rejects
 */
async function createResources(folderName, url, domainIdentifier, enabled) {
  console.debug(`\tCreating Resources for ${url}`);
  const tempDir = `~/tmp/domain-manager-test-${domainIdentifier}`;
  console.debug(`\tUsing tmp directory ${tempDir}`);
  try {
    await createTempDir(tempDir, folderName);
    await deployLambdas(tempDir, domainIdentifier);
    console.debug("\tResources Created");
  } catch (e) {
    console.debug("\tResources Failed to Create");
  }
}

/**
 * Wraps deletion of testing resources.
 * @param url
 * @param domainIdentifier Random alphanumeric string to identify specific run of integration tests.
 * @returns {Promise<void>} Resolves if successfully executed, else rejects
 */
async function destroyResources(url, domainIdentifier) {
  try {
    console.debug(`\tCleaning Up Resources for ${url}`);
    const tempDir = `~/tmp/domain-manager-test-${domainIdentifier}`;
    await removeLambdas(tempDir, domainIdentifier);
    await exec(`rm -rf ${tempDir}`);

    console.debug("\tResources Cleaned Up");
  } catch (e) {
    console.debug("\tFailed to Clean Up Resources");
  }
}

export {
  createResources,
  createTempDir,
  destroyResources,
  exec,
  slsCreateDomain,
  slsDeploy,
  slsDeleteDomain,
  slsRemove,
  getEndpointType,
  getBasePath,
  getStage,
  setupApiGatewayResources,
  deleteApiGatewayResources,
};

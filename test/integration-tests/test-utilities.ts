"use strict";

import aws = require("aws-sdk");
import shell = require("shelljs");
import {TEMP_DIR} from "./base";

const AWS_PROFILE = process.env.AWS_PROFILE;
const apiGateway = new aws.APIGateway({
    credentials: new aws.SharedIniFileCredentials(
        {profile: AWS_PROFILE},
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
        shell.exec(cmd, {silent: false}, (errCode, stdout, stderr) => {
            if (errCode) {
                return reject(stderr);
            }
            return resolve(stdout);
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
 * @param {string} restApiName
 * @return {Object} Contains restApiId and resourceId
 */
async function setupApiGatewayResources(restApiName) {
    const restApiInfo = await apiGateway.createRestApi({name: restApiName}).promise();
    const restApiId = restApiInfo.id;
    const resourceInfo = await apiGateway.getResources({restApiId}).promise();
    const resourceId = resourceInfo.items[0].id;
    shell.env.REST_API_ID = restApiId;
    shell.env.RESOURCE_ID = resourceId;
    return {restApiId, resourceId};
}

/**
 * Make API Gateway calls to delete an API Gateway
 * @param {string} restApiId
 * @return {boolean} Returns true if deleted
 */
async function deleteApiGatewayResources(restApiId) {
    return apiGateway.deleteRestApi({restApiId}).promise();
}

/**
 * Runs `sls create_domain` for the given folder
 * @param tempDir
 * @returns {Promise<void>}
 */
function slsCreateDomain(tempDir) {
    return exec(`cd ${tempDir} && $(npm bin)/serverless create_domain`);
}

/**
 * Runs `sls deploy` for the given folder
 * @param tempDir
 * @returns {Promise<void>}
 */
function slsDeploy(tempDir) {
    return exec(`cd ${tempDir} && $(npm bin)/serverless deploy`);
}

/**
 * Runs `sls delete_domain` for the given folder
 * @param tempDir
 * @returns {Promise<void>}
 */
function slsDeleteDomain(tempDir) {
    return exec(`cd ${tempDir} && $(npm bin)/serverless delete_domain`);
}

/**
 * Runs `sls remove` for the given folder
 * @param tempDir
 * @returns {Promise<void>}
 */
function slsRemove(tempDir) {
    return exec(`cd ${tempDir} && $(npm bin)/serverless remove`);
}

/**
 * Wraps creation of testing resources.
 * @param folderName
 * @param url
 * @returns {Promise<void>} Resolves if successfully executed, else rejects
 */
async function createResources(folderName, url) {
    console.debug(`\tCreating Resources for ${url} \tUsing tmp directory ${TEMP_DIR}`);
    try {
        await createTempDir(TEMP_DIR, folderName);
        await slsCreateDomain(TEMP_DIR);
        await slsDeploy(TEMP_DIR);
        console.debug("\tResources Created");
    } catch (e) {
        console.debug("\tResources Failed to Create");
    }
}

/**
 * Wraps deletion of testing resources.
 * @param url
 * @returns {Promise<void>} Resolves if successfully executed, else rejects
 */
async function destroyResources(url?) {
    try {
        console.log(`\tCleaning Up Resources for ${url}`);
        await slsRemove(TEMP_DIR);
        console.log("\tslsDeleteDomain");
        await slsDeleteDomain(TEMP_DIR);
        console.log("\trm -rf");
        await exec(`rm -rf ${TEMP_DIR}`);
        console.log("\tResources Cleaned Up");
    } catch (e) {
        console.log(`\tFailed to Clean Up Resources: ${e}`);
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

"use strict";

import shell = require("shelljs");
import {TEMP_DIR} from "./base";

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
    // we use npx running the local serverless in case not exists the global serverless will be used
    await exec(`ln -s $(pwd)/node_modules/serverless/bin/serverless.js ${tempDir}/node_modules/.bin/serverless`);
}

/**
 * Runs `sls create_domain` for the given folder
 * @param tempDir
 * @param debug - enable loging
 * @returns {Promise<void>}
 */
function slsCreateDomain(tempDir, debug: boolean = false) {
    return exec(`cd ${tempDir} && npx serverless create_domain --stage test --region us-east-1` + (debug ? " --verbose" : ""));
}

/**
 * Runs `sls deploy` for the given folder
 * @param tempDir
 * @param debug - enable loging
 * @returns {Promise<void>}
 */
function slsDeploy(tempDir, debug: boolean = false) {
    return exec(`cd ${tempDir} && npx serverless deploy` + (debug ? " --verbose" : ""));
}

/**
 * Runs `sls delete_domain` for the given folder
 * @param tempDir
 * @returns {Promise<void>}
 */
function slsDeleteDomain(tempDir) {
    return exec(`cd ${tempDir} && npx serverless delete_domain`);
}

/**
 * Runs `sls remove` for the given folder
 * @param tempDir
 * @returns {Promise<void>}
 */
function slsRemove(tempDir) {
    return exec(`cd ${tempDir} && npx serverless remove`);
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
};

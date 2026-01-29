"use strict";

import { spawn } from "child_process";
import { TEMP_DIR } from "./base";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Executes given shell command (internal test utility, no user input).
 * @param cmd shell command to execute
 * @returns {Promise<string>} Resolves with stdout if successful, rejects with stderr
 */
async function exec (cmd: string): Promise<string> {
  console.debug(`\tRunning command: ${cmd}`);
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    // NOSONAR: shell needed for && and $(pwd); internal test code only
    const child = spawn(cmd, { shell: true, env: { ...process.env } });

    child.stdout.on("data", (data) => {
      stdout += data;
      process.stdout.write(data);
    });

    child.stderr.on("data", (data) => {
      stderr += data;
      process.stderr.write(data);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        console.error(`\n\x1b[31m✖ Command failed with exit code ${code}\x1b[0m`);
        console.error(`\x1b[31m  Command: ${cmd}\x1b[0m`);
        if (stderr) console.error(`\x1b[31m  Error: ${stderr}\x1b[0m`);
        return reject(new Error(stderr || `Exit code ${code}`));
      }
      resolve(stdout);
    });
  });
}

/**
 * Move item in folderName to created tempDir
 * @param {string} tempDir
 * @param {string} folderName
 */
async function createTempDir (tempDir, folderName) {
  await exec(`rm -rf ${tempDir}`);
  await exec(`mkdir -p ${tempDir} && cp -R test/integration-tests/${folderName}/. ${tempDir}`);
  await exec(`mkdir -p ${tempDir}/node_modules/.bin`);
  await exec(`ln -s $(pwd) ${tempDir}/node_modules/`);

  await exec(`ln -s $(pwd)/node_modules/serverless ${tempDir}/node_modules/`);
  await exec(`ln -s $(pwd)/node_modules/serverless-plugin-split-stacks ${tempDir}/node_modules/`);
  // we use npx running the local serverless in case not exists the global serverless will be used
  await exec(`ln -s $(pwd)/node_modules/serverless/bin/serverless.js ${tempDir}/node_modules/.bin/serverless`);
}

/**
 * Runs `sls create_domain` for the given folder
 * @param tempDir
 * @param debug - enable loging
 * @returns {Promise<void>}
 */
function slsCreateDomain (tempDir, debug: boolean = false) {
  return exec(`cd ${tempDir} && npx serverless create_domain` + (debug ? " --verbose" : ""));
}

/**
 * Runs `sls deploy` for the given folder
 * @param tempDir
 * @param debug - enable loging
 * @returns {Promise<void>}
 */
async function slsDeploy (tempDir, debug: boolean = false) {
  // sleep to avoid `to many requests` error as we run a lot of tests one after another
  await sleep(5000);
  return exec(`cd ${tempDir} && npx serverless deploy` + (debug ? " --verbose" : ""));
}

/**
 * Runs `sls delete_domain` for the given folder
 * @param tempDir
 * @param debug
 * @returns {Promise<void>}
 */
function slsDeleteDomain (tempDir, debug: boolean = false) {
  return exec(`cd ${tempDir} && npx serverless delete_domain` + (debug ? " --verbose" : ""));
}

/**
 * Runs `sls remove` for the given folder
 * @param tempDir
 * @param debug
 * @returns {Promise<void>}
 */
function slsRemove (tempDir, debug: boolean = false) {
  return exec(`cd ${tempDir} && npx serverless remove` + (debug ? " --verbose" : ""));
}

/**
 * Wraps creation of testing resources.
 * @param folderName
 * @param url
 * @returns {Promise<void>} Resolves if successfully executed, else rejects
 */
async function createResources (folderName, url) {
  console.debug(`\tCreating Resources for ${url} \tUsing tmp directory ${TEMP_DIR}`);
  try {
    await createTempDir(TEMP_DIR, folderName);
    await slsCreateDomain(TEMP_DIR, true);
    await slsDeploy(TEMP_DIR, true);
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
async function destroyResources (url?) {
  try {
    console.log(`\tCleaning Up Resources for ${url}`);
    await slsRemove(TEMP_DIR, true);
    console.log("\tslsDeleteDomain");
    await slsDeleteDomain(TEMP_DIR, true);
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
  slsRemove
};

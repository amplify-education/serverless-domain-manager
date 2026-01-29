"use strict";

import { spawn } from "child_process";
import { TEMP_DIR } from "./base";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Executes given shell command.
 * This function is only used internally by integration tests with hardcoded commands.
 * No user input is passed to these commands.
 * @param cmd shell command to execute
 * @returns {Promise<string>} Resolves with stdout if successfully executed, else rejects with stderr
 */
async function exec (cmd: string): Promise<string> {
  // Validate that cmd is a non-empty string (defense in depth for internal test code)
  if (typeof cmd !== "string" || cmd.trim().length === 0) {
    throw new Error("Command must be a non-empty string");
  }
  console.debug(`\tRunning command: ${cmd}`);
  return new Promise((resolve, reject) => {
    // NOSONAR: shell is required for command chaining (&&) and subshells $(pwd).
    // This is internal test code with no external user input.
    const child = spawn(cmd, {
      shell: true, // NOSONAR
      stdio: ["inherit", "pipe", "pipe"],
      env: { ...process.env }
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      const str = data.toString();
      stdout += str;
      process.stdout.write(str);
    });

    child.stderr?.on("data", (data) => {
      const str = data.toString();
      stderr += str;
      process.stderr.write(str);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(stderr || `Command failed with exit code ${code}`);
      }
      return resolve(stdout);
    });

    child.on("error", (error) => {
      reject(error.message);
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
    // await slsDeleteDomain(TEMP_DIR, true);
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

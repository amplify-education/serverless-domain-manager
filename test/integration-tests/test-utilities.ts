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

// Frameworks the harness can drive. Both expose a `serverless` CLI entrypoint;
// osls (Open Serverless) is a fork whose bin also resolves to bin/serverless.js.
type Framework = "serverless" | "osls";

/**
 * Make the chosen framework's `serverless` CLI available in the temp dir so the
 * sls* helpers can keep invoking `npx serverless <cmd>` unchanged.
 *
 * serverless is symlinked from the repo's node_modules. osls is intentionally
 * NOT a root dependency (it drifts the shared @aws-sdk/@smithy versions and
 * breaks the build), so it runs on demand via npx behind a `.bin/serverless`
 * shim. osls (Open Serverless) is the framework that removed the bundled AWS
 * SDK v2 module, which is exactly what this test exercises.
 * @param tempDir
 * @param framework which framework to run under (serverless or osls)
 */
async function linkFramework (tempDir: string, framework: Framework) {
  if (framework === "osls") {
    const shim = `${tempDir}/node_modules/.bin/serverless`;
    await exec(`printf '#!/bin/sh\\nexec npx --yes osls@4 "$@"\\n' > ${shim} && chmod +x ${shim}`);
    return;
  }
  await exec(`ln -s $(pwd)/node_modules/${framework} ${tempDir}/node_modules/`);
  await exec(`ln -s $(pwd)/node_modules/${framework}/bin/serverless.js ${tempDir}/node_modules/.bin/serverless`);
}

/**
 * Move item in folderName to created tempDir
 * @param {string} tempDir
 * @param {string} folderName
 * @param {Framework} framework which framework to run under (defaults to serverless)
 */
async function createTempDir (tempDir, folderName, framework: Framework = "serverless") {
  await exec(`rm -rf ${tempDir}`);
  await exec(`mkdir -p ${tempDir} && cp -R test/integration-tests/${folderName}/. ${tempDir}`);
  await exec(`mkdir -p ${tempDir}/node_modules/.bin`);
  await exec(`ln -s $(pwd) ${tempDir}/node_modules/serverless-domain-manager`);

  await linkFramework(tempDir, framework);
  await exec(`ln -s $(pwd)/node_modules/serverless-plugin-split-stacks ${tempDir}/node_modules/`);
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
async function createResources (folderName, url, framework: Framework = "serverless") {
  console.debug(`\tCreating Resources for ${url} \tUsing tmp directory ${TEMP_DIR}`);
  try {
    await createTempDir(TEMP_DIR, folderName, framework);
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

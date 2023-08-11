import { Client, Command } from "@smithy/smithy-client";
import { MetadataBearer } from "@smithy/types";
import Globals from "./globals";

/**
 * Stops event thread execution for given number of seconds.
 * @param seconds
 * @returns {Promise<void>} Resolves after given number of seconds.
 */
async function sleep(seconds: number) {
    return new Promise((resolve) => setTimeout(resolve, 1000 * seconds));
}

/**
 * Determines whether this boolean config is configured to true or false.
 *
 * This method evaluates a customDomain property to see if it's true or false.
 * If the property's value is undefined, the default value is returned.
 * If the property's value is provided, this should be boolean, or a string parseable as boolean,
 * otherwise an exception is thrown.
 * @param {boolean|string} value the config value provided
 * @param {boolean} defaultValue the default value to return, if config value is undefined
 * @returns {boolean} the parsed boolean from the config value, or the default value
 */
function evaluateBoolean(value: any, defaultValue: boolean): boolean {
    if (value === undefined) {
        return defaultValue;
    }

    const s = value.toString().toLowerCase().trim();
    const trueValues = ["true", "1"];
    const falseValues = ["false", "0"];
    if (trueValues.indexOf(s) >= 0) {
        return true;
    }
    if (falseValues.indexOf(s) >= 0) {
        return false;
    }
    throw new Error(`${Globals.pluginName}: Ambiguous boolean config: "${value}"`);
}

/**
 * Iterate through the pages of a AWS SDK response and collect them into a single array
 *
 * @param client - The AWS service instance to use to make the calls
 * @param resultsKey - The key name in the response that contains the items to return
 * @param nextTokenKey - The request key name to append to the request that has the paging token value
 * @param nextRequestTokenKey - The response key name that has the next paging token value
 * @param params - Parameters to send in the request
 */
async function getAWSPagedResults<ClientOutput, ClientInputCommand extends object, ClientOutputCommand extends MetadataBearer>(
  client: Client<any, any, any, any>,
  resultsKey: keyof ClientOutputCommand,
  nextTokenKey: keyof ClientInputCommand,
  nextRequestTokenKey: keyof ClientOutputCommand,
  params: Command<any, any, any>
): Promise<ClientOutput[]> {
  let results = [];
  let response = await client.send(params);
  results = results.concat(response[resultsKey] || results);
  while (
    response.hasOwnProperty(nextRequestTokenKey) &&
    response[nextRequestTokenKey]
  ) {
    params.input[nextTokenKey] = response[nextRequestTokenKey];
    response = await client.send(params);
    results = results.concat(response[resultsKey]);
  }
  return results;
}

export { evaluateBoolean, sleep, getAWSPagedResults };

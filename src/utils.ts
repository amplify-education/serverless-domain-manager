import {Service} from "aws-sdk";
import Globals from "./globals";

const RETRYABLE_ERRORS = ["Throttling", "RequestLimitExceeded", "TooManyRequestsException"];

/**
 * Stops event thread execution for given number of seconds.
 * @param seconds
 * @returns {Promise<void>} Resolves after given number of seconds.
 */
async function sleep(seconds) {
    return new Promise((resolve) => setTimeout(resolve, 1000 * seconds));
}

async function throttledCall(service: Service, funcName: string, params: object): Promise<any> {
    const maxTimePassed = 5 * 60;
    const minWait = 3;
    const stopLoop = false;
    const maxWait = 60;

    let timePassed = 0;
    let previousInterval = 0;

    while (!stopLoop) {
        try {
            return await service[funcName](params).promise();
        } catch (ex) {
            // rethrow the exception if it is not a type of retryable exception
            if (RETRYABLE_ERRORS.indexOf(ex.code) === -1) {
                throw ex;
            }

            // rethrow the exception if we have waited too long
            if (timePassed >= maxTimePassed) {
                throw ex;
            }

            // Sleep using the Decorrelated Jitter algorithm recommended by AWS
            // https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
            let newInterval = Math.random() * Math.min(maxWait, previousInterval * 3);
            newInterval = Math.max(minWait, newInterval);

            await sleep(newInterval);
            previousInterval = newInterval;
            timePassed += previousInterval;
        }
    }
}

/**
 * Iterate through the pages of a AWS SDK response and collect them into a single array
 *
 * @param service - The AWS service instance to use to make the calls
 * @param funcName - The function name in the service to call
 * @param resultsKey - The key name in the response that contains the items to return
 * @param nextTokenKey - The request key name to append to the request that has the paging token value
 * @param nextRequestTokenKey - The response key name that has the next paging token value
 * @param params - Parameters to send in the request
 */
async function getAWSPagedResults(
    service: Service,
    funcName: string,
    resultsKey: string,
    nextTokenKey: string,
    nextRequestTokenKey: string,
    params: object,
): Promise<any[]> {
    let results = [];
    let response = await throttledCall(service, funcName, params);
    results = results.concat(response[resultsKey] || results);
    while (response.hasOwnProperty(nextRequestTokenKey) && response[nextRequestTokenKey]) {
        params[nextTokenKey] = response[nextRequestTokenKey];
        response = await service[funcName](params).promise();
        results = results.concat(response[resultsKey]);
    }
    return results;
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

export {
    evaluateBoolean,
    getAWSPagedResults,
    sleep,
    throttledCall,
};

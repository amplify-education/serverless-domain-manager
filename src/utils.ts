import Globals from "./globals";

/**
 * Stops event thread execution for given number of seconds.
 * @param seconds
 * @returns {Promise<void>} Resolves after given number of seconds.
 */
async function sleep(seconds) {
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

export {
    evaluateBoolean,
    sleep,
};

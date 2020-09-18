import chalk = require("chalk");
import {ServerlessInstance, ServerlessOptions} from "./types";

export default class Globals {

    public static serverless: ServerlessInstance;
    public static options: ServerlessOptions;

    public static endpointTypes = {
        edge: "EDGE",
        regional: "REGIONAL",
    };

    public static apiTypes = {
        http: "HTTP",
        rest: "REST",
        websocket: "WEBSOCKET",
    };

    public static tlsVersions = {
        tls_1_0: "TLS_1_0",
        tls_1_2: "TLS_1_2",
    };

    /**
     * Logs error message
     * @param message: message to be printed
     * @param domain: domain name
     * @param debug: if true then show log only if SLS_DEBUG enabled on else anytime
     */
    public static logError(message: any, domain?: string, debug?: boolean): void {
        debug = debug === undefined ? true : debug;
        const canLog = debug && process.env.SLS_DEBUG || !debug;
        if (canLog) {
            Globals.serverless.cli.log(
                `${chalk.redBright("Error:")} ${domain ? domain + ": " : ""} ${message}`, "Serverless Domain Manager",
            );
        }
    }

    /**
     * Logs info message
     * @param message: message to be printed
     * @param domain: domain name
     * @param debug: if true then show log only if SLS_DEBUG enabled on else anytime
     */
    public static logInfo(message: any, domain?: string, debug?: boolean): void {
        debug = debug === undefined ? true : debug;
        const canLog = debug && process.env.SLS_DEBUG || !debug;
        if (canLog) {
            Globals.serverless.cli.log(
                `${chalk.whiteBright("Info:")} ${domain ? domain + ": " : ""} ${message}`, "Serverless Domain Manager",
            );
        }
    }
}

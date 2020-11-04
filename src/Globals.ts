import chalk = require("chalk");
import DomainConfig = require("./DomainConfig");
import {ServerlessInstance, ServerlessOptions} from "./types";

export default class Globals {

    public static pluginName = "Serverless Domain Manager";

    public static serverless: ServerlessInstance;
    public static options: ServerlessOptions;

    public static defaultRegion = "us-east-1";

    public static endpointTypes = {
        edge: "EDGE",
        regional: "REGIONAL",
    };

    public static apiTypes = {
        http: "HTTP",
        rest: "REST",
        websocket: "WEBSOCKET",
    };

    public static gatewayAPIIdKeys = {
        [Globals.apiTypes.rest]: 'restApiId',
        [Globals.apiTypes.websocket]: 'websocketApiId',
    };

    public static tlsVersions = {
        tls_1_0: "TLS_1_0",
        tls_1_2: "TLS_1_2",
    };

    public static cliLog(prefix: string, message: string): void {
        Globals.serverless.cli.log(`${prefix} ${message}`, Globals.pluginName);
    }

    /**
     * Logs error message
     * @param message: message to be printed
     * @param debug: if true then show log only if SLS_DEBUG enabled on else anytime.
     * By default debug mode on and a message will be printed for SLS_DEBUG enabled.
     * @param domain: domain name
     */
    public static logError(message: any, domain?: string, debug?: boolean): void {
        const canLog = debug && process.env.SLS_DEBUG || !debug;
        if (canLog) {
            const error = chalk.bold.red;
            Globals.cliLog(error("Error:"), `${domain ? domain + ": " : ""} ${message}`);
        }
    }

    /**
     * Logs info message
     * @param message: message to be printed
     * @param debug: if true then show log only if SLS_DEBUG enabled on else anytime.
     * By default debug mode off and a message printed for each call.
     */
    public static logInfo(message: any, debug = false): void {
        const canLog = debug && process.env.SLS_DEBUG || !debug;
        if (canLog) {
            Globals.cliLog(chalk.blue("Info:"), message);
        }
    }

    /**
     * Logs warning message
     * @param message: message to be printed
     * @param debug: if true then show log only if SLS_DEBUG enabled on else anytime.
     * By default debug mode off and a message printed for each call.
     */
    public static logWarning(message: any, debug = false): void {
        const canLog = debug && process.env.SLS_DEBUG || !debug;
        if (canLog) {
            const warning = chalk.keyword("orange");
            Globals.cliLog(warning("WARNING:"), message);
        }
    }

    /**
     * Prints out a summary of all domain manager related info
     */

    public static printDomainSummary(domain: DomainConfig): void {
        Globals.logInfo(chalk.yellow.underline(`\n${Globals.pluginName} Summary`));

        Globals.logInfo(chalk.yellow("Distribution Domain Name"));
        Globals.logInfo(`  Domain Name: ${domain.givenDomainName}`);
        Globals.logInfo(`  Target Domain: ${domain.domainInfo.domainName}`);
        Globals.logInfo(`  Hosted Zone Id: ${domain.domainInfo.hostedZoneId}`);
    }
}

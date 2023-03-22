import Globals from "./globals";
import DomainConfig = require("./models/domain-config");

export default class Logging {
    public static cliLog(prefix: string, message: string): void {
        Globals.serverless.cli.log(`${prefix} ${message}`, Globals.pluginName);
    }

    /**
     * Logs error message
     */
    public static logError(message: string): void {
        if (Globals.v3Utils) {
            Globals.v3Utils.log.error(message);
        } else {
            Logging.cliLog("[Error]", message);
        }
    }

    /**
     * Logs info message
     */
    public static logInfo(message: string): void {
        if (Globals.v3Utils) {
            Globals.v3Utils.log.verbose(message);
        } else {
            Logging.cliLog("[Info]", message);
        }
    }

    /**
     * Logs warning message
     */
    public static logWarning(message: string): void {
        if (Globals.v3Utils) {
            Globals.v3Utils.log.warning(message);
        } else {
            Logging.cliLog("[WARNING]", message);
        }
    }

    /**
     * Prints out a summary of all domain manager related info
     */
    public static printDomainSummary(domains: DomainConfig[]): void {
        const summaryList = [];
        domains.forEach((domain) => {
            if (domain.domainInfo) {
                summaryList.push(`Domain Name: ${domain.givenDomainName}`);
                summaryList.push(`Target Domain: ${domain.domainInfo.domainName}`);
                summaryList.push(`Hosted Zone Id: ${domain.domainInfo.hostedZoneId}`);
            }
        });
        // don't print summary if summaryList is empty
        if (!summaryList.length) {
            return;
        }
        if (Globals.v3Utils) {
            Globals.serverless.addServiceOutputSection(Globals.pluginName, summaryList);
        } else {
            Logging.cliLog("[Summary]", "Distribution Domain Name");
            summaryList.forEach((item) => {
                Logging.cliLog("", `${item}`);
            });
        }
    }
}

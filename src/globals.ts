import DomainConfig = require("./domain-config");
import {ServerlessInstance, ServerlessOptions, ServerlessProgressFactory, ServerlessUtils} from "./types";

export default class Globals {

    public static pluginName = "Serverless Domain Manager";

    public static serverless: ServerlessInstance;
    public static options: ServerlessOptions;
    public static v3Utils: ServerlessUtils;

    public static defaultRegion = "us-east-1";
    public static defaultBasePath = "(none)";
    public static defaultStage = "$default";

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
        [Globals.apiTypes.rest]: "restApiId",
        [Globals.apiTypes.websocket]: "websocketApiId",
    };

    // Cloud Formation Resource Ids
    public static CFResourceIds = {
        [Globals.apiTypes.http]: "HttpApi",
        [Globals.apiTypes.rest]: "ApiGatewayRestApi",
        [Globals.apiTypes.websocket]: "WebsocketsApi",
    };

    public static tlsVersions = {
        tls_1_0: "TLS_1_0",
        tls_1_2: "TLS_1_2",
    };

    public static routingPolicies = {
        simple: "simple",
        latency: "latency",
        weighted: "weighted",
    };

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
            Globals.cliLog("[Error]", message);
        }
    }

    /**
     * Logs info message
     */
    public static logInfo(message: string): void {
        if (Globals.v3Utils) {
            Globals.v3Utils.log.verbose(message);
        } else {
            Globals.cliLog("[Info]", message);
        }
    }

    /**
     * Logs warning message
     */
    public static logWarning(message: string): void {
        if (Globals.v3Utils) {
            Globals.v3Utils.log.warning(message);
        } else {
            Globals.cliLog("[WARNING]", message);
        }
    }

    /**
     * Prints out a summary of all domain manager related info
     */
    public static printDomainSummary(domain: DomainConfig): void {
        if (Globals.v3Utils) {
            Globals.serverless.addServiceOutputSection(Globals.pluginName, [
                `domain name: ${domain.givenDomainName}`,
                `target domain: ${domain.domainInfo.domainName}`,
                `hosted zone id: ${domain.domainInfo.hostedZoneId}`
            ]);
        } else {
            Globals.cliLog("[Summary]", "Distribution Domain Name");
            Globals.cliLog("", `  Domain Name: ${domain.givenDomainName}`);
            Globals.cliLog("", `  Target Domain: ${domain.domainInfo.domainName}`);
            Globals.cliLog("", `  Hosted Zone Id: ${domain.domainInfo.hostedZoneId}`);
        }
    }

}

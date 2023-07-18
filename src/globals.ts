import {ServerlessInstance, ServerlessOptions, ServerlessUtils} from "./types";
import {fromIni} from "@aws-sdk/credential-providers";
import {ConfiguredRetryStrategy} from "@aws-sdk/util-retry";

export default class Globals {

    public static pluginName = "Serverless Domain Manager";

    public static serverless: ServerlessInstance;
    public static options: ServerlessOptions;
    public static v3Utils: ServerlessUtils;

    public static currentRegion: string;
    public static credentials: any;

    public static defaultRegion = "us-east-1";
    public static defaultBasePath = "(none)";
    public static defaultStage = "$default";

    // https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-known-issues.html
    public static reservedBasePaths = ["ping", "sping"];

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

    // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference.html
    public static CFFuncNames = {
        fnImport: "Fn::ImportValue",
        ref: "Ref"
    }

    /*eslint camelcase: ["error", {allow: ["^tls_"]}]*/
    public static tlsVersions = {
        tls_1_0: "TLS_1_0",
        tls_1_2: "TLS_1_2",
        tls_1_3: "TLS_1_3",
    };

    public static routingPolicies = {
        simple: "simple",
        latency: "latency",
        weighted: "weighted",
    };

    public static getBaseStage() {
        return Globals.options.stage || Globals.serverless.service.provider.stage;
    }

    public static getRegion() {
        const slsRegion = Globals.options.region || Globals.serverless.service.provider.region;
        return slsRegion || Globals.currentRegion || Globals.defaultRegion;
    }

    public static async getProfileCreds(profile: string) {
        return await fromIni({profile})();
    }

    public static getRetryStrategy(attempts: number = 3, delay: number = 10000) {
        return new ConfiguredRetryStrategy(
            attempts, // max attempts.
            // This example sets the backoff at 100ms plus 10s per attempt.
            // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/modules/_aws_sdk_util_retry.html#aws-sdkutil-retry
            (attempt: number) => 100 + attempt * delay // backoff function.
        )
    }
}

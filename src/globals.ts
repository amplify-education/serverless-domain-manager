import { ServerlessInstance, ServerlessOptions, ServerlessUtils } from "./types";
import { fromIni } from "@aws-sdk/credential-providers";
import { ConfiguredRetryStrategy } from "@smithy/util-retry";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { ProxyAgent } from "proxy-agent";

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
    private: "PRIVATE"
  };

  public static apiTypes = {
    http: "HTTP",
    rest: "REST",
    websocket: "WEBSOCKET"
  };

  public static gatewayAPIIdKeys = {
    [Globals.apiTypes.rest]: "restApiId",
    [Globals.apiTypes.websocket]: "websocketApiId"
  };

  // Cloud Formation Resource Ids
  public static CFResourceIds = {
    [Globals.apiTypes.http]: "HttpApi",
    [Globals.apiTypes.rest]: "ApiGatewayRestApi",
    [Globals.apiTypes.websocket]: "WebsocketsApi"
  };

  // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference.html
  public static CFFuncNames = {
    fnImport: "Fn::ImportValue",
    ref: "Ref"
  };

  /* eslint camelcase: ["error", {allow: ["^tls_"]}] */
  public static tlsVersions = {
    tls_1_0: "TLS_1_0",
    tls_1_2: "TLS_1_2",
    tls_1_3: "TLS_1_3"
  };

  public static routingPolicies = {
    simple: "simple",
    latency: "latency",
    weighted: "weighted"
  };

  public static getBaseStage () {
    return Globals.options.stage || Globals.serverless.service.provider.stage;
  }

  /**
   * Detects frameworks (osls v4) that removed the bundled AWS SDK v2 module and
   * expose getAwsSdkV3Config() instead. On those frameworks the v2 surfaces
   * (providers.aws.sdk / getCredentials()) are throwing removal stubs
   * (AWS_SDK_V2_SURFACE_REMOVED), and AWS SDK v3 clients resolve endpoints and
   * credentials natively.
   * @param awsProvider provider to probe; defaults to the active aws provider
   */
  public static hasSdkV3Config (awsProvider: any = Globals.serverless?.providers?.aws): boolean {
    return typeof awsProvider?.getAwsSdkV3Config === "function";
  }

  public static getServiceEndpoint (service: string) {
    const awsProvider = Globals.serverless.providers.aws;
    // AWS SDK v3 clients resolve custom endpoints (e.g. AWS_ENDPOINT_URL_*)
    // natively on osls v4, so no manual sdk.config lookup is needed there.
    if (Globals.hasSdkV3Config(awsProvider)) {
      return null;
    }
    try {
      const serviceConf = awsProvider.sdk && awsProvider.sdk.config[service];
      return serviceConf ? serviceConf.endpoint : null;
    } catch {
      // providers.aws.sdk is a removed v2 surface (osls v4); SDK v3 resolves endpoints natively
      return null;
    }
  }

  public static getRegion () {
    const slsRegion = Globals.options.region || Globals.serverless.service.provider.region;
    return slsRegion || Globals.currentRegion || Globals.defaultRegion;
  }

  public static async getProfileCreds (profile: string) {
    return await fromIni({ profile })();
  }

  public static getRetryStrategy (attempts: number = 5, delay: number = 3000, backoff: number = 500) {
    return new ConfiguredRetryStrategy(
      attempts, // max attempts.
      // This example sets the backoff at 500ms plus 3s per attempt.
      // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/modules/_aws_sdk_util_retry.html#aws-sdkutil-retry
      (attempt: number) => backoff + attempt * delay // backoff function.
    );
  }

  public static getRequestHandler () {
    const proxyAgent = new ProxyAgent();
    return new NodeHttpHandler({
      httpAgent: proxyAgent,
      httpsAgent: proxyAgent
    });
  }
}

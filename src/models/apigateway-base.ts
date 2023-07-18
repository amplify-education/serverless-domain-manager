import DomainInfo = require("./domain-info");
import ApiGatewayMap = require("./api-gateway-map");
import DomainConfig = require("./domain-config");
import {Client} from "@aws-sdk/smithy-client";
import {ConfiguredRetryStrategy} from "@aws-sdk/util-retry";

abstract class APIGatewayBase {
    public apiGateway: Client<any, any, any, any>;

    public static getRetryStrategy() {
        return new ConfiguredRetryStrategy(
            5, // max attempts.
            // This example sets the backoff at 100ms plus 5s per attempt.
            // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/modules/_aws_sdk_util_retry.html#aws-sdkutil-retry
            (attempt: number) => 100 + attempt * 5000 // backoff function.
        )
    }

    abstract createCustomDomain(domain: DomainConfig): Promise<DomainInfo>;

    abstract getCustomDomain(domain: DomainConfig): Promise<DomainInfo>;

    abstract deleteCustomDomain(domain: DomainConfig): Promise<void>;

    abstract createBasePathMapping(domain: DomainConfig): Promise<void>;

    abstract getBasePathMappings(domain: DomainConfig): Promise<ApiGatewayMap[]>;

    abstract updateBasePathMapping(domain: DomainConfig): Promise<void>;

    abstract deleteBasePathMapping(domain: DomainConfig): Promise<void>;
}

export = APIGatewayBase;

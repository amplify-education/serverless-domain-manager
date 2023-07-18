import DomainInfo = require("./domain-info");
import ApiGatewayMap = require("./api-gateway-map");
import DomainConfig = require("./domain-config");
import {Client} from "@aws-sdk/smithy-client";

abstract class APIGatewayBase {
    public apiGateway: Client<any, any, any, any>;

    abstract createCustomDomain(domain: DomainConfig): Promise<DomainInfo>;

    abstract getCustomDomain(domain: DomainConfig): Promise<DomainInfo>;

    abstract deleteCustomDomain(domain: DomainConfig): Promise<void>;

    abstract createBasePathMapping(domain: DomainConfig): Promise<void>;

    abstract getBasePathMappings(domain: DomainConfig): Promise<ApiGatewayMap[]>;

    abstract updateBasePathMapping(domain: DomainConfig): Promise<void>;

    abstract deleteBasePathMapping(domain: DomainConfig): Promise<void>;
}

export = APIGatewayBase;

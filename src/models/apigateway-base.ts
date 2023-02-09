import DomainInfo = require("./domain-info");
import ApiGatewayMap = require("./api-gateway-map");
import DomainConfig = require("./domain-config");
import {APIGateway, ApiGatewayV2} from "aws-sdk";

abstract class APIGatewayBase {
    public apiGateway: APIGateway | ApiGatewayV2;

    abstract createCustomDomain(domain: DomainConfig): Promise<DomainInfo>;

    abstract getCustomDomain(domain: DomainConfig): Promise<DomainInfo>;

    abstract deleteCustomDomain(domain: DomainConfig): Promise<void>;

    abstract createBasePathMapping(domain: DomainConfig): Promise<void>;

    abstract getBasePathMappings(domain: DomainConfig): Promise<ApiGatewayMap[]>;

    abstract updateBasePathMapping(domain: DomainConfig): Promise<void>;

    abstract deleteBasePathMapping(domain: DomainConfig): Promise<void>;
}

export = APIGatewayBase;

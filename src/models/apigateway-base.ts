import DomainInfo = require("./domain-info");
import ApiGatewayMap = require("./api-gateway-map");
import DomainConfig = require("./domain-config");

abstract class APIGatewayBase {
    abstract createCustomDomain(domain: DomainConfig): Promise<DomainInfo>;

    abstract getCustomDomain(domain: DomainConfig, silent?: boolean): Promise<DomainInfo>;

    abstract deleteCustomDomain(domain: DomainConfig): Promise<void>;

    abstract createBasePathMapping(domain: DomainConfig): Promise<void>;

    abstract getBasePathMappings(domain: DomainConfig): Promise<ApiGatewayMap[]>;

    abstract updateBasePathMapping(domain: DomainConfig): Promise<void>;

    abstract deleteBasePathMapping(domain: DomainConfig): Promise<void>;
}

export = APIGatewayBase;

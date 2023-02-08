/**
 * Wrapper class for AWS APIGateway provider
 */
import DomainConfig = require("../models/domain-config");
import DomainInfo = require("../models/domain-info");
import Globals from "../globals";
import APIGatewayV1Wrapper = require("./api-gateway-v1-wrapper");
import APIGatewayV2Wrapper = require("./api-gateway-v2-wrapper");
import ApiGatewayMap = require("../models/api-gateway-map");

class APIGatewayWrapper {
    public apiGatewayV1: APIGatewayV1Wrapper;
    public apiGatewayV2: APIGatewayV2Wrapper;

    constructor(credentials: any) {
        this.apiGatewayV1 = new APIGatewayV1Wrapper(credentials);
        this.apiGatewayV2 = new APIGatewayV2Wrapper(credentials);
    }

    /**
     * Return true if the EDGE domain type or TLS 1.0
     * @param domain: DomainConfig
     */
    private useV1(domain: DomainConfig): boolean {
        // For EDGE domain name or TLS 1.0 use APIGateway
        if (domain.endpointType === Globals.endpointTypes.edge) {
            return true;
        }
        if (domain.securityPolicy === Globals.tlsVersions.tls_1_0) {
            return true;
        }
        // For Regional domain use ApiGatewayV2
        return false;
    }

    /**
     * Creates Custom Domain Name through API Gateway
     * @param domain: DomainConfig
     */
    public async createCustomDomain(domain: DomainConfig): Promise<DomainInfo> {
        if (this.useV1(domain)) {
            return await this.apiGatewayV1.createCustomDomain(domain);
        }

        return await this.apiGatewayV2.createCustomDomain(domain);
    }

    /**
     * Get Custom Domain Info through API Gateway
     */
    public async getCustomDomainInfo(domain: DomainConfig): Promise<DomainInfo> {
        if (this.useV1(domain)) {
            return this.apiGatewayV1.getCustomDomain(domain);
        }

        return this.apiGatewayV2.getCustomDomain(domain);
    }

    /**
     * Delete Custom Domain Name through API Gateway
     */
    public async deleteCustomDomain(domain: DomainConfig): Promise<void> {
        if (this.useV1(domain)) {
            await this.apiGatewayV1.deleteCustomDomain(domain);
        } else {
            await this.apiGatewayV2.deleteCustomDomain(domain);
        }
    }

    /**
     * Creates basepath mapping
     */
    public async createBasePathMapping(domain: DomainConfig): Promise<void> {
        if (this.useV1(domain)) {
            return await this.apiGatewayV1.createBasePathMapping(domain);
        }

        return await this.apiGatewayV2.createApiMapping(domain);
    }


    public async getApiMappings(domain: DomainConfig): Promise<ApiGatewayMap[]> {
        if (this.useV1(domain)) {
            return await this.apiGatewayV1.getBasePathMappings(domain);
        }

        return await this.apiGatewayV2.getApiMappings(domain);
    }

    /**
     * Updates basepath mapping
     */
    public async updateBasePathMapping(domain: DomainConfig): Promise<void> {
        // Use APIGateway (v1) for EDGE or TLS 1.0 domains
        // check here if the EXISTING domain is using TLS 1.0 regardless of what is configured
        // We don't support updating custom domains so switching from TLS 1.0 to 1.2 will require recreating
        // the domain
        if (this.useV1(domain)) {
            return await this.apiGatewayV1.updateBasePathMapping(domain);
        }

        return await this.apiGatewayV2.updateApiMapping(domain);
    }

    /**
     * Deletes basepath mapping
     */
    public async deleteBasePathMapping(domain: DomainConfig): Promise<void> {
        if (this.useV1(domain)) {
            return await this.apiGatewayV1.deleteBasePathMapping(domain);
        }

        return await this.apiGatewayV2.deleteApiMapping(domain);
    }
}

export = APIGatewayWrapper;

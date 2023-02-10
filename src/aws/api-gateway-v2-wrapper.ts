/**
 * Wrapper class for AWS APIGatewayV2 provider
 */
import DomainConfig = require("../models/domain-config");
import DomainInfo = require("../models/domain-info");
import Globals from "../globals";
import {ApiGatewayV2} from "aws-sdk";
import {getAWSPagedResults, throttledCall} from "../utils";
import ApiGatewayMap = require("../models/api-gateway-map");
import APIGatewayBase = require("../models/apigateway-base");

class APIGatewayV2Wrapper extends APIGatewayBase {

    constructor(credentials: any) {
        super();
        this.apiGateway = new ApiGatewayV2(credentials);
    }

    /**
     * Creates Custom Domain Name
     * @param domain: DomainConfig
     */
    public async createCustomDomain(domain: DomainConfig): Promise<DomainInfo> {
        const providerTags = {
            ...Globals.serverless.service.provider.stackTags,
            ...Globals.serverless.service.provider.tags
        };

        const params: any = {
            DomainName: domain.givenDomainName,
            DomainNameConfigurations: [{
                CertificateArn: domain.certificateArn,
                EndpointType: domain.endpointType,
                SecurityPolicy: domain.securityPolicy,
            }],
            Tags: providerTags
        };

        const isEdgeType = domain.endpointType === Globals.endpointTypes.edge;
        if (!isEdgeType && domain.tlsTruststoreUri) {
            params.MutualTlsAuthentication = {
                TruststoreUri: domain.tlsTruststoreUri
            };

            if (domain.tlsTruststoreVersion) {
                params.MutualTlsAuthentication.TruststoreVersion = domain.tlsTruststoreVersion;
            }
        }

        try {
            const domainInfo = await throttledCall(this.apiGateway, "createDomainName", params);
            return new DomainInfo(domainInfo);
        } catch (err) {
            throw new Error(
                `V2 - Failed to create custom domain '${domain.givenDomainName}':\n${err.message}`
            );
        }
    }

    /**
     * Get Custom Domain Info
     * @param domain: DomainConfig
     */
    public async getCustomDomain(domain: DomainConfig): Promise<DomainInfo> {
        // Make API call
        try {
            const domainInfo = await throttledCall(this.apiGateway, "getDomainName", {
                DomainName: domain.givenDomainName,
            });
            return new DomainInfo(domainInfo);
        } catch (err) {
            if (err.code !== "NotFoundException") {
                throw new Error(
                    `V2 - Unable to fetch information about '${domain.givenDomainName}':\n${err.message}`
                );
            }
            Globals.logInfo(`V2 - '${domain.givenDomainName}' does not exist.`);
        }
    }

    /**
     * Delete Custom Domain Name
     * @param domain: DomainConfig
     */
    public async deleteCustomDomain(domain: DomainConfig): Promise<void> {
        // Make API call
        try {
            await throttledCall(this.apiGateway, "deleteDomainName", {
                DomainName: domain.givenDomainName,
            });
        } catch (err) {
            throw new Error(
                `V2 - Failed to delete custom domain '${domain.givenDomainName}':\n${err.message}`
            );
        }
    }

    /**
     * Create Base Path Mapping
     * @param domain: DomainConfig
     */
    public async createBasePathMapping(domain: DomainConfig): Promise<void> {
        let stage = domain.baseStage;
        if (domain.apiType === Globals.apiTypes.http) {
            // find a better way how to implement custom stage for the HTTP API type
            stage = Globals.defaultStage;
        }

        try {
            await throttledCall(this.apiGateway, "createApiMapping", {
                ApiId: domain.apiId,
                ApiMappingKey: domain.basePath,
                DomainName: domain.givenDomainName,
                Stage: stage,
            });
            Globals.logInfo(`V2 - Created API mapping '${domain.basePath}' for '${domain.givenDomainName}'`);
        } catch (err) {
            throw new Error(
                `V2 - Unable to create base path mapping for '${domain.givenDomainName}':\n${err.message}`
            );
        }
    }

    /**
     * Get APi Mapping
     * @param domain: DomainConfig
     */
    public async getBasePathMappings(domain: DomainConfig): Promise<ApiGatewayMap[]> {
        try {
            const items = await getAWSPagedResults(
                this.apiGateway,
                "getApiMappings",
                "Items",
                "NextToken",
                "NextToken",
                {DomainName: domain.givenDomainName},
            );

            return items.map(
                (item) => new ApiGatewayMap(item.ApiId, item.ApiMappingKey, item.Stage, item.ApiMappingId)
            );
        } catch (err) {
            throw new Error(
                `V2 - Make sure the '${domain.givenDomainName}' exists. Unable to get API Mappings:\n${err.message}`
            );
        }
    }

    /**
     * Update APi Mapping
     * @param domain: DomainConfig
     */
    public async updateBasePathMapping(domain: DomainConfig): Promise<void> {
        let stage = domain.baseStage;
        if (domain.apiType === Globals.apiTypes.http) {
            // find a better way how to implement custom stage for the HTTP API type
            stage = Globals.defaultStage;
        }

        try {
            await throttledCall(this.apiGateway, "updateApiMapping", {
                ApiId: domain.apiId,
                ApiMappingId: domain.apiMapping.apiMappingId,
                ApiMappingKey: domain.basePath,
                DomainName: domain.givenDomainName,
                Stage: stage,
            });
            Globals.logInfo(`V2 - Updated API mapping to '${domain.basePath}' for '${domain.givenDomainName}'`);
        } catch (err) {
            throw new Error(
                `V2 - Unable to update base path mapping for '${domain.givenDomainName}':\n${err.message}`
            );
        }
    }

    /**
     * Delete Api Mapping
     */
    public async deleteBasePathMapping(domain: DomainConfig): Promise<void> {
        const params = {
            ApiMappingId: domain.apiMapping.apiMappingId,
            DomainName: domain.givenDomainName,
        };

        // Make API call
        try {
            await throttledCall(this.apiGateway, "deleteApiMapping", params);
            Globals.logInfo(`V2 - Removed API Mapping with id: '${domain.apiMapping.apiMappingId}'`);
        } catch (err) {
            throw new Error(
                `V2 - Unable to remove base path mapping for '${domain.givenDomainName}':\n${err.message}`
            );
        }
    }
}

export = APIGatewayV2Wrapper;

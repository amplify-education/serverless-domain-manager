/**
 * Wrapper class for AWS APIGateway provider
 */
import DomainConfig = require("../domain-config");
import DomainInfo = require("../domain-info");
import Globals from "../globals";
import {APIGateway, ApiGatewayV2} from "aws-sdk";
import {getAWSPagedResults, throttledCall} from "../utils";

class APIGatewayWrapper {
    public apiGateway: APIGateway;
    public apiGatewayV2: ApiGatewayV2;

    constructor(credentials: any) {
        this.apiGateway = new APIGateway(credentials);
        this.apiGatewayV2 = new ApiGatewayV2(credentials);
    }

    /**
     * Creates Custom Domain Name through API Gateway
     * @param domain: DomainConfig
     */
    public async createCustomDomain(domain: DomainConfig): Promise<void> {
        let createdDomain = {};
        const providerTags = {
            ...Globals.serverless.service.provider.stackTags,
            ...Globals.serverless.service.provider.tags
        };

        // For EDGE domain name or TLS 1.0, create with APIGateway (v1)
        const isEdgeType = domain.endpointType === Globals.endpointTypes.edge;
        const hasMutualTls = !!domain.tlsTruststoreUri;
        if (isEdgeType || domain.securityPolicy === "TLS_1_0") {
            // Set up parameters
            const params = {
                domainName: domain.givenDomainName,
                endpointConfiguration: {
                    types: [domain.endpointType],
                },
                securityPolicy: domain.securityPolicy,
                [isEdgeType ? "certificateArn" : "regionalCertificateArn"]: domain.certificateArn,
                tags: providerTags,
            };

            if (!isEdgeType && hasMutualTls) {
                params.mutualTlsAuthentication = {
                    truststoreUri: domain.tlsTruststoreUri,
                    ...(domain.tlsTruststoreVersion ? {truststoreVersion: domain.tlsTruststoreVersion} : undefined)
                };
            }

            // Make API call to create domain
            try {
                // Creating EDGE domain so use APIGateway (v1) service
                createdDomain = await throttledCall(this.apiGateway, "createDomainName", params);
                domain.domainInfo = new DomainInfo(createdDomain);
            } catch (err) {
                throw new Error(`Failed to create custom domain '${domain.givenDomainName}':\n${err.message}`);
            }

        } else { // For Regional domain name create with ApiGatewayV2
            const params: any = {
                DomainName: domain.givenDomainName,
                DomainNameConfigurations: [{
                    CertificateArn: domain.certificateArn,
                    EndpointType: domain.endpointType,
                    SecurityPolicy: domain.securityPolicy,
                }],
                Tags: providerTags
            };

            if (!isEdgeType && hasMutualTls) {
                params.MutualTlsAuthentication = {
                    TruststoreUri: domain.tlsTruststoreUri,
                    ...(domain.tlsTruststoreVersion ? {TruststoreVersion: domain.tlsTruststoreVersion} : undefined)
                };
            }

            // Make API call to create domain
            try {
                // Creating Regional domain so use ApiGatewayV2
                createdDomain = await throttledCall(this.apiGatewayV2, "createDomainName", params);
                domain.domainInfo = new DomainInfo(createdDomain);
            } catch (err) {
                throw new Error(`Failed to create custom domain '${domain.givenDomainName}':\n${err.message}`);
            }
        }
    }

    /**
     * Delete Custom Domain Name through API Gateway
     */
    public async deleteCustomDomain(domain: DomainConfig): Promise<void> {
        // Make API call
        try {
            await throttledCall(this.apiGatewayV2, "deleteDomainName", {
                DomainName: domain.givenDomainName,
            });
        } catch (err) {
            throw new Error(`Failed to delete custom domain '${domain.givenDomainName}':\n${err.message}`);
        }
    }

    /**
     * Get Custom Domain Info through API Gateway
     */
    public async getCustomDomainInfo(domain: DomainConfig): Promise<DomainInfo> {
        // Make API call
        try {
            const domainInfo = await throttledCall(this.apiGatewayV2, "getDomainName", {
                DomainName: domain.givenDomainName,
            });
            return new DomainInfo(domainInfo);
        } catch (err) {
            if (err.code !== "NotFoundException") {
                throw new Error(`Unable to fetch information about '${domain.givenDomainName}':\n${err.message}`);
            }
            Globals.logInfo(`'${domain.givenDomainName}' does not exist.`);
        }
    }

    /**
     * Creates basepath mapping
     */
    public async createBasePathMapping(domain: DomainConfig): Promise<void> {
        // Use APIGateway (v1) for EDGE or TLS 1.0 domains
        if (domain.endpointType === Globals.endpointTypes.edge || domain.securityPolicy === "TLS_1_0") {
            const params = {
                basePath: domain.basePath,
                domainName: domain.givenDomainName,
                restApiId: domain.apiId,
                stage: domain.stage,
            };
            // Make API call
            try {
                await throttledCall(this.apiGateway, "createBasePathMapping", params);
                Globals.logInfo(`Created API mapping '${domain.basePath}' for '${domain.givenDomainName}'`);
            } catch (err) {
                throw new Error(
                    `Unable to create base path mapping for '${domain.givenDomainName}':\n${err.message}`
                );
            }
        } else { // Use ApiGatewayV2 for Regional domains
            const params = {
                ApiId: domain.apiId,
                ApiMappingKey: domain.basePath,
                DomainName: domain.givenDomainName,
                Stage: domain.apiType === Globals.apiTypes.http ? Globals.defaultStage : domain.stage,
            };
            // Make API call
            try {
                await throttledCall(this.apiGatewayV2, "createApiMapping", params);
                Globals.logInfo(`Created API mapping '${domain.basePath}' for '${domain.givenDomainName}'`);
            } catch (err) {
                throw new Error(`Unable to create base path mapping for '${domain.givenDomainName}':\n${err.message}`);
            }
        }
    }

    public async getApiMappings(domain: DomainConfig): Promise<ApiGatewayV2.GetApiMappingResponse[]> {
        try {
            return await getAWSPagedResults(
                this.apiGatewayV2,
                "getApiMappings",
                "Items",
                "NextToken",
                "NextToken",
                {DomainName: domain.givenDomainName},
            );
        } catch (err) {
            throw new Error(`Unable to get API Mappings for '${domain.givenDomainName}':\n${err.message}`);
        }
    }

    /**
     * Updates basepath mapping
     */
    public async updateBasePathMapping(domain: DomainConfig): Promise<void> {
        // Use APIGateway (v1) for EDGE or TLS 1.0 domains
        // check here if the EXISTING domain is using TLS 1.0 regardless of what is configured
        // We don't support updating custom domains so switching from TLS 1.0 to 1.2 will require recreating
        // the domain
        if (domain.endpointType === Globals.endpointTypes.edge || domain.domainInfo.securityPolicy === "TLS_1_0") {
            const params = {
                basePath: domain.apiMapping.ApiMappingKey || Globals.defaultBasePath,
                domainName: domain.givenDomainName,
                patchOperations: [{
                    op: "replace",
                    path: "/basePath",
                    value: domain.basePath,
                }]
            };
            // Make API call
            try {
                await throttledCall(this.apiGateway, "updateBasePathMapping", params);
                Globals.logInfo(`Updated API mapping from '${domain.apiMapping.ApiMappingKey}'
                    to '${domain.basePath}' for '${domain.givenDomainName}'`);
            } catch (err) {
                throw new Error(`Unable to update base path mapping for '${domain.givenDomainName}':\n${err.message}`);
            }
        } else { // Use ApiGatewayV2 for Regional domains
            const params = {
                ApiId: domain.apiId,
                ApiMappingId: domain.apiMapping.ApiMappingId,
                ApiMappingKey: domain.basePath,
                DomainName: domain.givenDomainName,
                Stage: domain.apiType === Globals.apiTypes.http ? Globals.defaultStage : domain.stage,
            };
            // Make API call
            try {
                await throttledCall(this.apiGatewayV2, "updateApiMapping", params);
                Globals.logInfo(`Updated API mapping to '${domain.basePath}' for '${domain.givenDomainName}'`);
            } catch (err) {
                throw new Error(`Unable to update base path mapping for '${domain.givenDomainName}':\n${err.message}`);
            }
        }
    }

    /**
     * Deletes basepath mapping
     */
    public async deleteBasePathMapping(domain: DomainConfig): Promise<void> {
        const params = {
            ApiMappingId: domain.apiMapping.ApiMappingId,
            DomainName: domain.givenDomainName,
        };

        // Make API call
        try {
            await throttledCall(this.apiGatewayV2, "deleteApiMapping", params);
            Globals.logInfo(`Removed API Mapping with id: '${domain.apiMapping.ApiMappingId}'`)
        } catch (err) {
            throw new Error(`Unable to remove base path mapping for '${domain.givenDomainName}':\n${err.message}`);
        }
    }
}

export = APIGatewayWrapper;

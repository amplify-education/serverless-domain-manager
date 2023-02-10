/**
 * Wrapper class for AWS APIGateway provider
 */
import DomainConfig = require("../models/domain-config");
import DomainInfo = require("../models/domain-info");
import Globals from "../globals";
import {APIGateway} from "aws-sdk";
import {getAWSPagedResults, throttledCall} from "../utils";
import ApiGatewayMap = require("../models/api-gateway-map");
import APIGatewayBase = require("../models/apigateway-base");

class APIGatewayV1Wrapper extends APIGatewayBase {
    constructor(credentials: any) {
        super();
        this.apiGateway = new APIGateway(credentials);
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
            domainName: domain.givenDomainName,
            endpointConfiguration: {
                types: [domain.endpointType],
            },
            securityPolicy: domain.securityPolicy,
            tags: providerTags,
        };

        const isEdgeType = domain.endpointType === Globals.endpointTypes.edge;
        if (isEdgeType) {
            params.certificateArn = domain.certificateArn;
        } else {
            params.regionalCertificateArn = domain.certificateArn;

            if (domain.tlsTruststoreUri) {
                params.mutualTlsAuthentication = {
                    truststoreUri: domain.tlsTruststoreUri
                };

                if (domain.tlsTruststoreVersion) {
                    params.mutualTlsAuthentication.truststoreVersion = domain.tlsTruststoreVersion;
                }
            }
        }

        try {
            const domainInfo = await throttledCall(this.apiGateway, "createDomainName", params);
            return new DomainInfo(domainInfo);
        } catch (err) {
            throw new Error(
                `V1 - Failed to create custom domain '${domain.givenDomainName}':\n${err.message}`
            );
        }
    }

    /**
     * Get Custom Domain Info
     */
    public async getCustomDomain(domain: DomainConfig): Promise<DomainInfo> {
        // Make API call
        try {
            const domainInfo = await throttledCall(this.apiGateway, "getDomainName", {
                domainName: domain.givenDomainName,
            });
            return new DomainInfo(domainInfo);
        } catch (err) {
            if (err.code !== "NotFoundException") {
                throw new Error(
                    `V1 - Unable to fetch information about '${domain.givenDomainName}':\n${err.message}`
                );
            }
            Globals.logInfo(`V1 - '${domain.givenDomainName}' does not exist.`);
        }
    }

    /**
     * Delete Custom Domain Name through API Gateway
     */
    public async deleteCustomDomain(domain: DomainConfig): Promise<void> {
        // Make API call
        try {
            await throttledCall(this.apiGateway, "deleteDomainName", {
                domainName: domain.givenDomainName,
            });
        } catch (err) {
            throw new Error(`V1 - Failed to delete custom domain '${domain.givenDomainName}':\n${err.message}`);
        }
    }

    public async createBasePathMapping(domain: DomainConfig): Promise<void> {
        try {
            await throttledCall(this.apiGateway, "createBasePathMapping", {
                basePath: domain.basePath,
                domainName: domain.givenDomainName,
                restApiId: domain.apiId,
                stage: domain.baseStage,
            });
            Globals.logInfo(`V1 - Created API mapping '${domain.basePath}' for '${domain.givenDomainName}'`);
        } catch (err) {
            throw new Error(
                `V1 - Make sure the '${domain.givenDomainName}' exists.
                 Unable to create base path mapping for '${domain.givenDomainName}':\n${err.message}`
            );
        }
    }

    public async getBasePathMappings(domain: DomainConfig): Promise<ApiGatewayMap[]> {
        try {
            const items = await getAWSPagedResults(
                this.apiGateway,
                "getBasePathMappings",
                "items",
                "position",
                "position",
                {domainName: domain.givenDomainName},
            );
            return items.map((item) => {
                    return new ApiGatewayMap(item.restApiId, item.basePath, item.stage, null);
                }
            );
        } catch (err) {
            throw new Error(
                `V1 - Make sure the '${domain.givenDomainName}' exists.
                 Unable to get Base Path Mappings:\n${err.message}`
            );
        }
    }

    public async updateBasePathMapping(domain: DomainConfig): Promise<void> {
        try {
            await throttledCall(this.apiGateway, "updateBasePathMapping", {
                basePath: domain.apiMapping.basePath,
                domainName: domain.givenDomainName,
                patchOperations: [{
                    op: "replace",
                    path: "/basePath",
                    value: domain.basePath,
                }]
            });
            Globals.logInfo(`V1 - Updated API mapping from '${domain.apiMapping.basePath}'
                    to '${domain.basePath}' for '${domain.givenDomainName}'`);
        } catch (err) {
            throw new Error(
                `V1 - Unable to update base path mapping for '${domain.givenDomainName}':\n${err.message}`
            );
        }
    }

    /**
     * Deletes basepath mapping
     */
    public async deleteBasePathMapping(domain: DomainConfig): Promise<void> {
        // Make API call
        try {
            await throttledCall(this.apiGateway, "deleteBasePathMapping", {
                basePath: domain.apiMapping.basePath,
                domainName: domain.givenDomainName,
            });
            Globals.logInfo(`V1 - Removed '${domain.apiMapping.basePath}' base path mapping`);
        } catch (err) {
            throw new Error(
                `V1 - Unable to remove base path mapping for '${domain.givenDomainName}':\n${err.message}`
            );
        }
    }
}

export = APIGatewayV1Wrapper;

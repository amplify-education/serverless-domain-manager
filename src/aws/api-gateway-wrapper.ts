/**
 * Wrapper class for AWS APIGateway provider
 */
import {APIGateway, ApiGatewayV2} from "aws-sdk";
import Globals from "../Globals";
import {getAWSPagedResults, throttledCall} from "../utils";
import DomainConfig = require("../DomainConfig");
import DomainInfo = require("../DomainInfo");

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

        // For EDGE domain name or TLS 1.0, create with APIGateway (v1)
        if (domain.endpointType === Globals.endpointTypes.edge || domain.securityPolicy === "TLS_1_0") {
            // Set up parameters
            const params = {
                domainName: domain.givenDomainName,
                endpointConfiguration: {
                    types: [domain.endpointType],
                },
                securityPolicy: domain.securityPolicy,
            };

            /* tslint:disable:no-string-literal */
            if (domain.endpointType === Globals.endpointTypes.edge) {
                params["certificateArn"] = domain.certificateArn;
            } else {
                params["regionalCertificateArn"] = domain.certificateArn;
            }
            /* tslint:enable:no-string-literal */

            // Make API call to create domain
            try {
                // Creating EDGE domain so use APIGateway (v1) service
                createdDomain = await throttledCall(this.apiGateway, "createDomainName", params);
                domain.domainInfo = new DomainInfo(createdDomain);
            } catch (err) {
                Globals.logError(err, domain.givenDomainName);
                throw new Error(`Failed to create custom domain ${domain.givenDomainName}\n`);
            }

        } else { // For Regional domain name create with ApiGatewayV2
            const params = {
                DomainName: domain.givenDomainName,
                DomainNameConfigurations: [{
                    CertificateArn: domain.certificateArn,
                    EndpointType: domain.endpointType,
                    SecurityPolicy: domain.securityPolicy,
                }],
            };

            // Make API call to create domain
            try {
                // Creating Regional domain so use ApiGatewayV2
                createdDomain = await throttledCall(this.apiGatewayV2, "createDomainName", params);
                domain.domainInfo = new DomainInfo(createdDomain);
            } catch (err) {
                Globals.logError(err, domain.givenDomainName);
                throw new Error(`Failed to create custom domain ${domain.givenDomainName}\n`);
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
            Globals.logError(err, domain.givenDomainName);
            throw new Error(`Failed to delete custom domain ${domain.givenDomainName}\n`);
        }
    }

    /**
     * Delete Custom Domain Name through API Gateway
     */
    public async getCustomDomainInfo(domain: DomainConfig): Promise<DomainInfo> {
        // Make API call
        try {
            const domainInfo = await throttledCall(this.apiGatewayV2, "getDomainName", {
                DomainName: domain.givenDomainName,
            });
            return new DomainInfo(domainInfo);
        } catch (err) {
            Globals.logError(err, domain.givenDomainName);
            if (err.code !== "NotFoundException") {
                throw new Error(`Unable to fetch information about ${domain.givenDomainName}`);
            }
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
                Globals.logInfo(`Created API mapping '${domain.basePath}' for ${domain.givenDomainName}`);
            } catch (err) {
                Globals.logError(err, domain.givenDomainName);
                throw new Error(`${domain.givenDomainName}: Unable to create basepath mapping.\n`);
            }

        } else { // Use ApiGatewayV2 for Regional domains
            const params = {
                ApiId: domain.apiId,
                ApiMappingKey: domain.basePath,
                DomainName: domain.givenDomainName,
                Stage: domain.apiType === Globals.apiTypes.http ? "$default" : domain.stage,
            };
            // Make API call
            try {
                await throttledCall(this.apiGatewayV2, "createApiMapping", params);
                Globals.logInfo(`Created API mapping '${domain.basePath}' for ${domain.givenDomainName}`);
            } catch (err) {
                Globals.logError(err, domain.givenDomainName);
                throw new Error(`${domain.givenDomainName}: Unable to create basepath mapping.\n`);
            }
        }
    }

    /**
     * Get basepath mapping
     */
    public async getBasePathMapping(domain: DomainConfig): Promise<ApiGatewayV2.GetApiMappingResponse> {
        try {
            const mappings = await getAWSPagedResults(
                this.apiGatewayV2,
                "getApiMappings",
                "Items",
                "NextToken",
                "NextToken",
                {DomainName: domain.givenDomainName},
            );
            for (const mapping of mappings) {
                if (mapping.ApiId === domain.apiId
                    || (mapping.ApiMappingKey === domain.basePath && domain.allowPathMatching)) {
                    return mapping;
                }
            }
        } catch (err) {
            Globals.logError(err, domain.givenDomainName);
            throw new Error(`Unable to get API Mappings for ${domain.givenDomainName}`);
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
                basePath: domain.apiMapping.ApiMappingKey || "(none)",
                domainName: domain.givenDomainName,
                patchOperations: [
                    {
                        op: "replace",
                        path: "/basePath",
                        value: domain.basePath,
                    },
                ],
            };

            // Make API call
            try {
                await throttledCall(this.apiGateway, "updateBasePathMapping", params);
                Globals.logInfo(`Updated API mapping from '${domain.apiMapping.ApiMappingKey}'
                     to '${domain.basePath}' for ${domain.givenDomainName}`);
            } catch (err) {
                Globals.logError(err, domain.givenDomainName);
                throw new Error(`${domain.givenDomainName}: Unable to update basepath mapping.\n`);
            }

        } else { // Use ApiGatewayV2 for Regional domains

            const params = {
                ApiId: domain.apiId,
                ApiMappingId: domain.apiMapping.ApiMappingId,
                ApiMappingKey: domain.basePath,
                DomainName: domain.givenDomainName,
                Stage: domain.apiType === Globals.apiTypes.http ? "$default" : domain.stage,
            };

            // Make API call
            try {
                await throttledCall(this.apiGatewayV2, "updateApiMapping", params);
                Globals.logInfo(`Updated API mapping to '${domain.basePath}' for ${domain.givenDomainName}`);
            } catch (err) {
                Globals.logError(err, domain.givenDomainName);
                throw new Error(`${domain.givenDomainName}: Unable to update basepath mapping.\n`);
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
            Globals.logInfo("Removed basepath mapping.");
        } catch (err) {
            Globals.logError(err, domain.givenDomainName);
            Globals.logInfo(`Unable to remove basepath mapping for ${domain.givenDomainName}`);
        }
    }
}

export = APIGatewayWrapper;

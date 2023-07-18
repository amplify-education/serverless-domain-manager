import {
    APIGatewayClient,
    CreateRestApiCommand,
    CreateRestApiCommandOutput,
    DeleteRestApiCommand,
    GetBasePathMappingsCommand,
    GetBasePathMappingsCommandOutput, GetDomainNameCommand, GetDomainNameCommandOutput,
    GetResourcesCommand,
    GetResourcesCommandOutput
} from "@aws-sdk/client-api-gateway";
import APIGatewayBase = require("../../src/models/apigateway-base");

export default class APIGatewayWrap {
    private client: APIGatewayClient;

    constructor(region: string) {
        this.client = new APIGatewayClient({
            region,
            retryStrategy: APIGatewayBase.getRetryStrategy()
        });
    }

    /**
     * Make API Gateway calls to create an API Gateway
     * @param {string} restApiName
     * @return {Object} Contains restApiId and resourceId
     */
    public async setupApiGatewayResources(restApiName) {
        const restAPI: CreateRestApiCommandOutput = await this.client.send(
            new CreateRestApiCommand({name: restApiName})
        )

        const restApiId = restAPI.id;
        const resources: GetResourcesCommandOutput = await this.client.send(
            new GetResourcesCommand({restApiId})
        )

        const resourceId = resources.items[0].id;
        return {restApiId, resourceId};
    }

    /**
     * Make API Gateway calls to delete an API Gateway
     * @param {string} restApiId
     * @return {boolean} Returns true if deleted
     */
    public async deleteApiGatewayResources(restApiId) {
        return await this.client.send(
            new DeleteRestApiCommand({restApiId})
        );
    }

    /**
     * Gets stage of given URL from AWS
     * @param domainName
     * @returns {Promise<String>}
     */
    public async getStage(domainName) {
        const result: GetBasePathMappingsCommandOutput = await this.client.send(
            new GetBasePathMappingsCommand({domainName})
        )

        return result.items[0].stage;
    }

    /**
     * Gets basePath of given URL from AWS
     * @param domainName
     * @returns {Promise<String>}
     */
    public async getBasePath(domainName) {
        const result: GetBasePathMappingsCommandOutput = await this.client.send(
            new GetBasePathMappingsCommand({domainName})
        )

        return result.items[0].basePath;
    }

    /**
     * Gets endpoint type of given URL from AWS
     * @param domainName
     * @returns {Promise<String>}
     */
    public async getEndpointType(domainName) {
        const result: GetDomainNameCommandOutput = await this.client.send(
            new GetDomainNameCommand({domainName})
        )

        return result.endpointConfiguration.types[0];
    }
}

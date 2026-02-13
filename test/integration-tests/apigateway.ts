import {
  APIGatewayClient,
  CreateRestApiCommand,
  CreateRestApiCommandOutput,
  DeleteRestApiCommand,
  GetBasePathMappingsCommand,
  GetBasePathMappingsCommandOutput,
  GetDomainNameCommand,
  GetDomainNameCommandOutput,
  GetDomainNamesCommand,
  GetDomainNamesCommandOutput,
  GetResourcesCommand,
  GetResourcesCommandOutput
} from "@aws-sdk/client-api-gateway";
import Globals from "../../src/globals";

export default class APIGatewayWrap {
    private client: APIGatewayClient;

    constructor (region: string) {
      this.client = new APIGatewayClient({
        region,
        retryStrategy: Globals.getRetryStrategy()
      });
    }

    /**
     * Make API Gateway calls to create an API Gateway
     * @param {string} restApiName
     * @return {Object} Contains restApiId and resourceId
     */
    public async setupApiGatewayResources (restApiName) {
      const restAPI: CreateRestApiCommandOutput = await this.client.send(
        new CreateRestApiCommand({ name: restApiName })
      );

      const restApiId = restAPI.id;
      const resources: GetResourcesCommandOutput = await this.client.send(
        new GetResourcesCommand({ restApiId })
      );

      const resourceId = resources.items[0].id;
      return { restApiId, resourceId };
    }

    /**
     * Make API Gateway calls to delete an API Gateway
     * @param {string} restApiId
     * @return {boolean} Returns true if deleted
     */
    public async deleteApiGatewayResources (restApiId) {
      return await this.client.send(
        new DeleteRestApiCommand({ restApiId })
      );
    }

    /**
     * Gets stage of given URL from AWS
     * @param domainName
     * @returns {Promise<String>}
     */
    public async getStage (domainName) {
      const result: GetBasePathMappingsCommandOutput = await this.client.send(
        new GetBasePathMappingsCommand({ domainName })
      );

      return result.items[0].stage;
    }

    /**
     * Gets basePath of given URL from AWS
     * @param domainName
     * @returns {Promise<String>}
     */
    public async getBasePath (domainName) {
      const result: GetBasePathMappingsCommandOutput = await this.client.send(
        new GetBasePathMappingsCommand({ domainName })
      );

      return result.items[0].basePath;
    }

    /**
     * Gets endpoint type of given URL from AWS
     * @param domainName
     * @param isPrivate - whether this is a private domain
     * @returns {Promise<String>}
     */
    public async getEndpointType (domainName: string, isPrivate: boolean = false): Promise<string> {
      let domainNameId: string | undefined;
      if (isPrivate) {
        domainNameId = await this.getDomainNameIdForPrivateDomain(domainName);
      }

      const result: GetDomainNameCommandOutput = await this.client.send(
        new GetDomainNameCommand({
          domainName,
          ...(domainNameId && { domainNameId })
        } as any)
      );

      return result.endpointConfiguration.types[0];
    }

    /**
     * Gets stage of given URL from AWS for private domains
     * @param domainName
     * @returns {Promise<String>}
     */
    public async getStageForPrivateDomain (domainName: string): Promise<string> {
      const domainNameId = await this.getDomainNameIdForPrivateDomain(domainName);
      if (!domainNameId) {
        throw new Error(`Could not find domainNameId for private domain: ${domainName}`);
      }

      const result: GetBasePathMappingsCommandOutput = await this.client.send(
        new GetBasePathMappingsCommand({
          domainName,
          domainNameId
        } as any)
      );

      return result.items[0].stage;
    }

    /**
     * Gets basePath of given URL from AWS for private domains
     * @param domainName
     * @returns {Promise<String>}
     */
    public async getBasePathForPrivateDomain (domainName: string): Promise<string> {
      const domainNameId = await this.getDomainNameIdForPrivateDomain(domainName);
      if (!domainNameId) {
        throw new Error(`Could not find domainNameId for private domain: ${domainName}`);
      }

      const result: GetBasePathMappingsCommandOutput = await this.client.send(
        new GetBasePathMappingsCommand({
          domainName,
          domainNameId
        } as any)
      );

      return result.items[0].basePath;
    }

    /**
     * Gets the domainNameId for a private custom domain
     * @param domainName
     * @returns {Promise<string | undefined>}
     */
    public async getDomainNameIdForPrivateDomain (domainName: string): Promise<string | undefined> {
      let position: string | undefined;
      do {
        const result: GetDomainNamesCommandOutput = await this.client.send(
          new GetDomainNamesCommand({ position })
        );

        const matchingDomain = result.items?.find(
          (item) => item.domainName === domainName &&
                    item.endpointConfiguration?.types?.includes("PRIVATE")
        );

        if (matchingDomain?.domainNameId) {
          return matchingDomain.domainNameId;
        }

        position = result.position;
      } while (position);

      return undefined;
    }
}

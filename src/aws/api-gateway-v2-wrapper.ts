/**
 * Wrapper class for AWS APIGatewayV2 provider
 */
import DomainConfig = require("../models/domain-config");
import DomainInfo = require("../models/domain-info");
import Globals from "../globals";
import ApiGatewayMap = require("../models/api-gateway-map");
import APIGatewayBase = require("../models/apigateway-base");
import {
  ApiGatewayV2Client,
  ApiMapping,
  CreateApiMappingCommand,
  CreateDomainNameCommand,
  CreateDomainNameCommandOutput,
  DeleteApiMappingCommand,
  DeleteDomainNameCommand,
  GetApiMappingsCommand,
  GetApiMappingsCommandInput,
  GetApiMappingsCommandOutput,
  GetDomainNameCommand,
  GetDomainNameCommandOutput,
  GetDomainNamesCommand,
  GetDomainNamesCommandInput,
  GetDomainNamesCommandOutput,
  UpdateApiMappingCommand
} from "@aws-sdk/client-apigatewayv2";
import Logging from "../logging";
import { getAWSPagedResults } from "../utils";

class APIGatewayV2Wrapper extends APIGatewayBase {
  public readonly apiGateway: ApiGatewayV2Client;

  constructor (credentials?: any) {
    super();
    this.apiGateway = new ApiGatewayV2Client({
      credentials,
      region: Globals.getRegion(),
      retryStrategy: Globals.getRetryStrategy(),
      requestHandler: Globals.getRequestHandler(),
      endpoint: Globals.getServiceEndpoint("apigatewayv2")
    });
  }

  /**
   * Creates Custom Domain Name
   * @param domain: DomainConfig
   */
  public async createCustomDomain (domain: DomainConfig): Promise<DomainInfo> {
    const providerTags = {
      ...Globals.serverless.service.provider.stackTags,
      ...Globals.serverless.service.provider.tags
    };

    const params: any = {
      DomainName: domain.givenDomainName,
      DomainNameConfigurations: [{
        CertificateArn: domain.certificateArn,
        EndpointType: domain.endpointType,
        SecurityPolicy: domain.securityPolicy
      }],
      Tags: providerTags
    };

    const isEdgeType = domain.endpointType === Globals.endpointTypes.edge;
    const isPrivateType = domain.endpointType === Globals.endpointTypes.private;
    if (!isEdgeType && !isPrivateType && domain.tlsTruststoreUri) {
      params.MutualTlsAuthentication = {
        TruststoreUri: domain.tlsTruststoreUri
      };

      if (domain.tlsTruststoreVersion) {
        params.MutualTlsAuthentication.TruststoreVersion = domain.tlsTruststoreVersion;
      }
    }

    try {
      const domainInfo: CreateDomainNameCommandOutput = await this.apiGateway.send(
        new CreateDomainNameCommand(params)
      );
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
   * @param silent: To issue an error or not. Not by default.
   */
  public async getCustomDomain (domain: DomainConfig, silent: boolean = true): Promise<DomainInfo> {
    const isPrivateType = domain.endpointType === Globals.endpointTypes.private;
    
    // For private domains, we need to fetch domainNameId first
    let domainNameId: string | undefined;
    if (isPrivateType) {
      domainNameId = await this.getDomainNameIdForPrivateDomain(domain);
      if (!domainNameId) {
        if (!silent) {
          throw new Error(
            `V2 - Unable to find domainNameId for private domain '${domain.givenDomainName}'`
          );
        }
        Logging.logWarning(`V2 - '${domain.givenDomainName}' does not exist or is not a private domain.`);
        return;
      }
    }

    // Make API call
    try {
      const domainInfo: GetDomainNameCommandOutput = await this.apiGateway.send(
        new GetDomainNameCommand({
          DomainName: domain.givenDomainName,
          ...(isPrivateType && domainNameId && { DomainNameId: domainNameId })
        })
      );
      return new DomainInfo(domainInfo);
    } catch (err) {
      if (!err.$metadata || err.$metadata.httpStatusCode !== 404 || !silent) {
        throw new Error(
          `V2 - Unable to fetch information about '${domain.givenDomainName}':\n${err.message}`
        );
      }
      Logging.logInfo(`V2 - '${domain.givenDomainName}' does not exist.`);
    }
  }

  /**
   * Helper method to get domainNameId for private custom domains.
   * Private domains require a domainNameId for all API operations.
   * First checks domainInfo if available, otherwise fetches by listing all domains.
   * @param domain: DomainConfig
   * @returns Promise<string | undefined> The domainNameId if found, undefined otherwise
   */
  private async getDomainNameIdForPrivateDomain (domain: DomainConfig): Promise<string | undefined> {
    // Only applicable for private endpoints
    if (domain.endpointType !== Globals.endpointTypes.private) {
      return undefined;
    }

    // First try to get it from domainInfo if already fetched
    if (domain.domainInfo?.domainNameId) {
      return domain.domainInfo.domainNameId;
    }

    // Otherwise, fetch it by listing domains and finding the matching private domain
    try {
      type DomainNameItem = {
        DomainName: string;
        DomainNameId?: string;
        DomainNameConfigurations?: Array<{ EndpointType?: string }>;
      };

      const items = await getAWSPagedResults<DomainNameItem, GetDomainNamesCommandInput, GetDomainNamesCommandOutput>(
        this.apiGateway,
        "Items",
        "NextToken",
        "NextToken",
        new GetDomainNamesCommand({})
      );

      const matchingDomain = items.find(
        (item) => item.DomainName === domain.givenDomainName &&
                  item.DomainNameConfigurations?.some((config) => config.EndpointType === Globals.endpointTypes.private)
      );

      return matchingDomain?.DomainNameId;
    } catch (err) {
      Logging.logWarning(`V2 - Unable to list domain names to find domainNameId: ${err.message}`);
      return undefined;
    }
  }

  /**
   * Delete Custom Domain Name
   * @param domain: DomainConfig
   */
  public async deleteCustomDomain (domain: DomainConfig): Promise<void> {
    // Make API call
    try {
      const domainNameId = await this.getDomainNameIdForPrivateDomain(domain);
      await this.apiGateway.send(
        new DeleteDomainNameCommand({
          DomainName: domain.givenDomainName,
          ...(domainNameId && { DomainNameId: domainNameId })
        })
      );
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
  public async createBasePathMapping (domain: DomainConfig): Promise<void> {
    if (domain.apiType === Globals.apiTypes.http && domain.stage !== Globals.defaultStage) {
      Logging.logWarning(
        `Using a HTTP API with a stage name other than '${Globals.defaultStage}'. ` +
        `HTTP APIs require a stage named '${Globals.defaultStage}'. ` +
        "Please make sure that stage exists in the API Gateway. " +
        "See https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-stages.html"
      );
    }
    try {
      const domainNameId = await this.getDomainNameIdForPrivateDomain(domain);
      await this.apiGateway.send(
        new CreateApiMappingCommand({
          ApiId: domain.apiId,
          ApiMappingKey: domain.basePath,
          DomainName: domain.givenDomainName,
          Stage: domain.stage,
          ...(domainNameId && { DomainNameId: domainNameId })
        })
      );
      Logging.logInfo(`V2 - Created API mapping '${domain.basePath}' for '${domain.givenDomainName}'`);
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
  public async getBasePathMappings (domain: DomainConfig): Promise<ApiGatewayMap[]> {
    try {
      const domainNameId = await this.getDomainNameIdForPrivateDomain(domain);
      const items = await getAWSPagedResults<ApiMapping, GetApiMappingsCommandInput, GetApiMappingsCommandOutput>(
        this.apiGateway,
        "Items",
        "NextToken",
        "NextToken",
        new GetApiMappingsCommand({
          DomainName: domain.givenDomainName,
          ...(domainNameId && { DomainNameId: domainNameId })
        })
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
  public async updateBasePathMapping (domain: DomainConfig): Promise<void> {
    try {
      const domainNameId = await this.getDomainNameIdForPrivateDomain(domain);
      await this.apiGateway.send(
        new UpdateApiMappingCommand({
          ApiId: domain.apiId,
          ApiMappingId: domain.apiMapping.apiMappingId,
          ApiMappingKey: domain.basePath,
          DomainName: domain.givenDomainName,
          Stage: domain.stage,
          ...(domainNameId && { DomainNameId: domainNameId })
        })
      );
      Logging.logInfo(`V2 - Updated API mapping to '${domain.basePath}' for '${domain.givenDomainName}'`);
    } catch (err) {
      throw new Error(
        `V2 - Unable to update base path mapping for '${domain.givenDomainName}':\n${err.message}`
      );
    }
  }

  /**
   * Delete Api Mapping
   */
  public async deleteBasePathMapping (domain: DomainConfig): Promise<void> {
    try {
      const domainNameId = await this.getDomainNameIdForPrivateDomain(domain);
      await this.apiGateway.send(new DeleteApiMappingCommand({
        ApiMappingId: domain.apiMapping.apiMappingId,
        DomainName: domain.givenDomainName,
        ...(domainNameId && { DomainNameId: domainNameId })
      }));
      Logging.logInfo(`V2 - Removed API Mapping with id: '${domain.apiMapping.apiMappingId}'`);
    } catch (err) {
      throw new Error(
        `V2 - Unable to remove base path mapping for '${domain.givenDomainName}':\n${err.message}`
      );
    }
  }
}

export = APIGatewayV2Wrapper;

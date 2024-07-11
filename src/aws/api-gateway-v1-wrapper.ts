/**
 * Wrapper class for AWS APIGateway provider
 */
import DomainConfig = require("../models/domain-config");
import DomainInfo = require("../models/domain-info");
import Globals from "../globals";
import {
  APIGatewayClient,
  BasePathMapping,
  CreateBasePathMappingCommand,
  CreateDomainNameCommand,
  CreateDomainNameCommandOutput,
  DeleteBasePathMappingCommand,
  DeleteDomainNameCommand,
  GetBasePathMappingsCommand,
  GetBasePathMappingsCommandInput,
  GetBasePathMappingsCommandOutput,
  GetDomainNameCommand,
  GetDomainNameCommandOutput,
  UpdateBasePathMappingCommand
} from "@aws-sdk/client-api-gateway";
import ApiGatewayMap = require("../models/api-gateway-map");
import APIGatewayBase = require("../models/apigateway-base");
import Logging from "../logging";
import { getAWSPagedResults } from "../utils";

class APIGatewayV1Wrapper extends APIGatewayBase {
  public readonly apiGateway: APIGatewayClient;


  constructor (credentials?: any) {
    super();
    this.apiGateway = new APIGatewayClient({
      credentials,
      region: Globals.getRegion(),
      retryStrategy: Globals.getRetryStrategy(),
      requestHandler: Globals.getRequestHandler(),
      endpoint: Globals.getServiceEndpoint("apigateway")
    });
  }

  public async createCustomDomain (domain: DomainConfig): Promise<DomainInfo> {
    const providerTags = {
      ...Globals.serverless.service.provider.stackTags,
      ...Globals.serverless.service.provider.tags
    };

    const params: any = {
      domainName: domain.givenDomainName,
      endpointConfiguration: {
        types: [domain.endpointType]
      },
      securityPolicy: domain.securityPolicy,
      tags: providerTags
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
      const domainInfo: CreateDomainNameCommandOutput = await this.apiGateway.send(
        new CreateDomainNameCommand(params)
      );
      return new DomainInfo(domainInfo);
    } catch (err) {
      throw new Error(
        `V1 - Failed to create custom domain '${domain.givenDomainName}':\n${err.message}`
      );
    }
  }

  /**
   * Get Custom Domain Info
   * @param domain: DomainConfig
   * @param silent: To issue an error or not. Not by default.
   */
  public async getCustomDomain (domain: DomainConfig, silent: boolean = true): Promise<DomainInfo> {
    // Make API call
    try {
      const domainInfo: GetDomainNameCommandOutput = await this.apiGateway.send(
        new GetDomainNameCommand({
          domainName: domain.givenDomainName
        })
      );
      return new DomainInfo(domainInfo);
    } catch (err) {
      if (!err.$metadata || err.$metadata.httpStatusCode !== 404 || !silent) {
        throw new Error(
          `V1 - Unable to fetch information about '${domain.givenDomainName}':\n${err.message}`
        );
      }
      Logging.logWarning(`V1 - '${domain.givenDomainName}' does not exist.`);
    }
  }

  public async deleteCustomDomain (domain: DomainConfig): Promise<void> {
    // Make API call
    try {
      await this.apiGateway.send(new DeleteDomainNameCommand({
        domainName: domain.givenDomainName
      }));
    } catch (err) {
      throw new Error(`V1 - Failed to delete custom domain '${domain.givenDomainName}':\n${err.message}`);
    }
  }

  public async createBasePathMapping (domain: DomainConfig): Promise<void> {
    try {
      await this.apiGateway.send(new CreateBasePathMappingCommand({
        basePath: domain.basePath,
        domainName: domain.givenDomainName,
        restApiId: domain.apiId,
        stage: domain.stage
      }));
      Logging.logInfo(`V1 - Created API mapping '${domain.basePath}' for '${domain.givenDomainName}'`);
    } catch (err) {
      throw new Error(
        `V1 - Unable to create base path mapping for '${domain.givenDomainName}':\n${err.message}`
      );
    }
  }

  public async getBasePathMappings (domain: DomainConfig): Promise<ApiGatewayMap[]> {
    try {
      const items = await getAWSPagedResults<BasePathMapping, GetBasePathMappingsCommandInput, GetBasePathMappingsCommandOutput>(
        this.apiGateway,
        "items",
        "position",
        "position",
        new GetBasePathMappingsCommand({
          domainName: domain.givenDomainName
        })
      );
      return items.map((item) => {
        return new ApiGatewayMap(item.restApiId, item.basePath, item.stage, null);
      });
    } catch (err) {
      throw new Error(
        `V1 - Make sure the '${domain.givenDomainName}' exists.
                 Unable to get Base Path Mappings:\n${err.message}`
      );
    }
  }

  public async updateBasePathMapping (domain: DomainConfig): Promise<void> {
    Logging.logInfo(`V1 - Updating API mapping from '${domain.apiMapping.basePath}'
            to '${domain.basePath}' for '${domain.givenDomainName}'`);
    try {
      await this.apiGateway.send(new UpdateBasePathMappingCommand({
        basePath: domain.apiMapping.basePath,
        domainName: domain.givenDomainName,
        patchOperations: [{
          op: "replace",
          path: "/basePath",
          value: domain.basePath
        }]
      }));
    } catch (err) {
      throw new Error(
        `V1 - Unable to update base path mapping for '${domain.givenDomainName}':\n${err.message}`
      );
    }
  }

  public async deleteBasePathMapping (domain: DomainConfig): Promise<void> {
    try {
      await this.apiGateway.send(
        new DeleteBasePathMappingCommand({
          basePath: domain.apiMapping.basePath,
          domainName: domain.givenDomainName
        })
      );
      Logging.logInfo(`V1 - Removed '${domain.apiMapping.basePath}' base path mapping`);
    } catch (err) {
      throw new Error(
        `V1 - Unable to remove base path mapping for '${domain.givenDomainName}':\n${err.message}`
      );
    }
  }
}

export = APIGatewayV1Wrapper;

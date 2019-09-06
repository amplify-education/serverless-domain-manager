import { Domain, ServerlessInstance, ServerlessOptions } from "./types";

/**
 * Wrapper class for Custom Domain information
 */
class DomainInfo {

  public domainName: string;
  public basePath?: string | undefined = "";
  public stage?: string | undefined;
  public certificateName?: string | undefined;
  public certificateArn?: string | undefined;
  public securityPolicy?: string | undefined = "TLS_1_2";
  public endpointType?: string | undefined = "EDGE";
  public hostedZoneId?: string | undefined;
  public enabled?: boolean | string | undefined = true;
  public websocket?: boolean | string | undefined = false;
  public createRoute53Record?: boolean | undefined = true;
  public hostedZonePrivate?: boolean | undefined;

  public aliasTarget?: string | undefined;
  public aliasHostedZoneId?: string | undefined;

  private endpointTypes = {
    edge: "EDGE",
    regional: "REGIONAL",
  };

  private tlsVersions = {
    tls_1_0: "TLS_1_0",
    tls_1_2: "TLS_1_2",
  };

  private fallbackHostedZoneId = "Z2FDTNDATAQYW2";

  constructor(domain: Domain, serverless: ServerlessInstance, options: ServerlessOptions) {
    this.domainName = domain.domainName;

    if (typeof this.domainName === "undefined") {
      throw new Error(`domainName is required. Pass it on your serverless.yaml file.`);
    }

    if (typeof domain.enabled !== "undefined") {
      this.enabled = this.evaluateEnabled(domain.enabled);
    }

    if (typeof domain.websocket !== "undefined") {
      this.websocket = this.evaluateEnabled(domain.websocket);
    }

    if (typeof domain.basePath !== "undefined" && domain.basePath !== null && domain.basePath.trim() !== "") {
      this.basePath = domain.basePath;
    }

    if (typeof domain.stage !== "undefined") {
      this.stage = domain.stage;
    } else {
      this.stage = options.stage || serverless.service.provider.stage;
    }

    if (typeof domain.certificateName !== "undefined") {
      this.certificateName = domain.certificateName;
    }

    if (typeof domain.certificateArn !== "undefined") {
      this.certificateArn = domain.certificateArn;
    }

    if (typeof domain.securityPolicy !== "undefined" && this.tlsVersions[domain.securityPolicy.toLowerCase()]) {
      this.securityPolicy = this.tlsVersions[domain.securityPolicy.toLowerCase()];
    } else if (typeof domain.securityPolicy !== "undefined" && !this.tlsVersions[domain.securityPolicy.toLowerCase()]) {
      throw new Error(`${domain.securityPolicy} is not a supported securityPolicy, use tls_1_0 or tls_1_2.`);
    }

    if (typeof domain.endpointType === "undefined" && !this.websocket) {
      this.endpointType = "EDGE";
    } else if (this.websocket) {
      this.endpointType = "REGIONAL";
    } else if (typeof domain.endpointType !== "undefined" && this.endpointTypes[domain.endpointType.toLowerCase()]) {
      this.endpointType = this.endpointTypes[domain.endpointType.toLowerCase()];
    } else {
      throw new Error(`${domain.endpointType} is not supported endpointType, use edge or regional.`);
    }

    if (typeof domain.hostedZoneId !== "undefined") {
      this.hostedZoneId = domain.hostedZoneId;
    }

    if (typeof domain.createRoute53Record !== "undefined") {
      this.createRoute53Record = domain.createRoute53Record;
    }

    if (typeof domain.hostedZonePrivate !== "undefined") {
      this.hostedZonePrivate = domain.hostedZonePrivate;
    }
  }

  public SetApiGatewayRespV1(data: any) {
    this.aliasTarget = data.distributionDomainName || data.regionalDomainName;
    this.aliasHostedZoneId = data.distributionHostedZoneId || data.regionalHostedZoneId || this.fallbackHostedZoneId;
  }

  public SetApiGatewayRespV2(data: any) {
    this.aliasTarget = data.DomainNameConfigurations[0].ApiGatewayDomainName;
    this.aliasHostedZoneId = data.DomainNameConfigurations[0].HostedZoneId;
  }

  public isRegional(): boolean {
    const regional = this.endpointType === this.endpointTypes.regional ? true : false;
    return regional;
  }

  /**
   * Transforms string booleans to booleans or throws error if not possible
   */

  public evaluateEnabled(value: any) {

    if (typeof value === "boolean") {
        return value;
    } else if (typeof value === "string" && value === "true") {
        return true;
    } else if (typeof value === "string" && value === "false") {
        return false;
    } else {
        throw new Error(`serverless-domain-manager: Ambiguous enablement boolean: "${value}"`);
    }
  }
}

export = DomainInfo;

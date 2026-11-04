/**
 * Wrapper class for Custom Domain information
 */

import DomainInfo = require("./domain-info");
import Globals from "../globals";
import { CustomDomain, Route53Params } from "../types";
import { evaluateBoolean } from "../utils";
import ApiGatewayMap = require("./api-gateway-map");
import Logging from "../logging";
import { SecurityPolicy as RestSecurityPolicy } from "@aws-sdk/client-api-gateway";
import { SecurityPolicy as HttpSecurityPolicy } from "@aws-sdk/client-apigatewayv2";

class DomainConfig {
  public givenDomainName: string;
  public basePath: string | undefined;
  public stage: string | undefined;
  public certificateName: string | undefined;
  public certificateArn: string | undefined;
  public createRoute53Record: boolean | undefined;
  public createRoute53IPv6Record: boolean | undefined;
  public route53Profile: string | undefined;
  public route53Region: string | undefined;
  public endpointType: string | undefined;
  public apiType: string | undefined;
  public tlsTruststoreUri: string | undefined;
  public tlsTruststoreVersion: string | undefined;
  public hostedZoneId: string | undefined;
  public hostedZonePrivate: boolean | undefined;
  public splitHorizonDns: boolean | undefined;
  public enabled: boolean | string | undefined;
  public securityPolicy: string | undefined;
  public endpointAccessMode: string | undefined;
  public autoDomain: boolean | undefined;
  public autoDomainWaitFor: string | undefined;
  public route53Params: Route53Params;
  public preserveExternalPathMappings: boolean | undefined;
  public domainInfo: DomainInfo | undefined;
  public apiId: string | undefined;
  public apiMapping: ApiGatewayMap;
  public allowPathMatching: boolean | false;

  constructor (config: CustomDomain) {
    this.enabled = evaluateBoolean(config.enabled, true);
    this.givenDomainName = config.domainName;
    this.certificateArn = config.certificateArn;
    this.certificateName = config.certificateName;
    this.createRoute53Record = evaluateBoolean(config.createRoute53Record, true);
    this.createRoute53IPv6Record = evaluateBoolean(config.createRoute53IPv6Record, true);
    this.route53Profile = config.route53Profile;
    this.route53Region = config.route53Region;
    this.hostedZoneId = config.hostedZoneId;
    this.hostedZonePrivate = config.hostedZonePrivate;
    this.allowPathMatching = config.allowPathMatching;
    this.autoDomain = evaluateBoolean(config.autoDomain, false);
    this.autoDomainWaitFor = config.autoDomainWaitFor;
    this.preserveExternalPathMappings = evaluateBoolean(config.preserveExternalPathMappings, false);
    this.basePath = DomainConfig._getBasePath(config.basePath);
    this.apiType = DomainConfig._getApiType(config.apiType);
    // apiType and basePath should be defined before stage
    this.stage = DomainConfig._getStage(config.stage, this.apiType, this.basePath);
    this.endpointType = DomainConfig._getEndpointType(config.endpointType);
    this.tlsTruststoreUri = DomainConfig._getTLSTruststoreUri(config.tlsTruststoreUri, this.endpointType);
    this.tlsTruststoreVersion = config.tlsTruststoreVersion;
    this.endpointAccessMode = DomainConfig._getEndpointAccessMode(config.endpointAccessMode, this.apiType, this.basePath);
    // apiType, endpointType, basePath and endpointAccessMode should be defined before securityPolicy
    this.securityPolicy = DomainConfig._getSecurityPolicy(
      config.securityPolicy, this.apiType, this.endpointType, this.basePath, this.endpointAccessMode
    );
    this.route53Params = DomainConfig._getRoute53Params(config.route53Params, this.endpointType);
    this.splitHorizonDns = !this.hostedZoneId && !this.hostedZonePrivate && evaluateBoolean(config.splitHorizonDns, false);
  }

  private static _getStage (stage: string, apiType: string, basePath: string) {
    if (apiType === Globals.apiTypes.http && (basePath === Globals.defaultBasePath || !stage)) {
      return Globals.defaultStage;
    }
    return stage || Globals.getBaseStage();
  }

  private static _getBasePath (basePath: string | undefined) {
    if (!basePath || basePath.trim() === "") {
      basePath = Globals.defaultBasePath;
    }
    if (Globals.reservedBasePaths.indexOf(basePath) !== -1) {
      Logging.logWarning(
        "The `/ping` and `/sping` paths are reserved for the service health check.\n Please take a look at" +
        "https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-known-issues.html"
      );
    }
    return basePath;
  }

  private static _getEndpointType (endpointType: string | undefined) {
    const endpointTypeWithDefault = endpointType || Globals.endpointTypes.edge;
    const endpointTypeToUse = Globals.endpointTypes[endpointTypeWithDefault.toLowerCase()];
    if (!endpointTypeToUse) {
      throw new Error(`${endpointTypeWithDefault} is not supported endpointType, use EDGE, REGIONAL, or PRIVATE.`);
    }
    return endpointTypeToUse;
  }

  private static _getApiType (apiType: string | undefined) {
    const apiTypeWithDefault = apiType || Globals.apiTypes.rest;
    const apiTypeToUse = Globals.apiTypes[apiTypeWithDefault.toLowerCase()];
    if (!apiTypeToUse) {
      throw new Error(`${apiTypeWithDefault} is not supported api type, use REST, HTTP or WEBSOCKET.`);
    }
    return apiTypeToUse;
  }

  private static _getTLSTruststoreUri (tlsTruststoreUri: string | undefined, endpointType: string) {
    if (tlsTruststoreUri) {
      if (endpointType === Globals.endpointTypes.edge || endpointType === Globals.endpointTypes.private) {
        throw new Error(
          endpointType + " APIs do not support mutual TLS, " +
          "remove tlsTruststoreUri or change to a regional API."
        );
      }

      const invalidUriError = new Error(
        `${tlsTruststoreUri} is not a valid s3 uri, try something like s3://bucket-name/key-name.`
      );
      let url: URL;
      try {
        url = new URL(tlsTruststoreUri);
      } catch {
        throw invalidUriError;
      }

      // pathname is "/" when the key is missing (s3://bucket-name/)
      if (url.protocol !== "s3:" || !url.hostname || url.pathname.length <= 1) {
        throw invalidUriError;
      }
    }

    return tlsTruststoreUri;
  }

  private static _getEndpointAccessMode (endpointAccessMode: string | undefined, apiType: string, basePath: string) {
    if (!endpointAccessMode) {
      return undefined;
    }

    if (apiType !== Globals.apiTypes.rest) {
      throw new Error("endpointAccessMode is only supported for REST APIs.");
    }

    // multi-level base paths are managed through API Gateway V2, which has no endpoint access mode
    if (basePath.includes("/")) {
      throw new Error(`endpointAccessMode is not supported with a multi-level basePath ('${basePath}').`);
    }

    const normalized = String(endpointAccessMode).toUpperCase();
    if (!Globals.endpointAccessModes.includes(normalized)) {
      throw new Error(`${endpointAccessMode} is not a supported endpointAccessMode, use BASIC or STRICT.`);
    }
    return normalized;
  }

  /**
   * Converts legacy lowercase policies (e.g. tls_1_2) to upper case and warns about a policy AWS is likely
   * to reject. The policy is still sent to AWS, so policies added after the installed AWS SDK version keep working.
   * https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-security-policies-list.html
   */
  private static _getSecurityPolicy (
    securityPolicy: string | undefined, apiType: string, endpointType: string, basePath: string, endpointAccessMode: string | undefined
  ) {
    // left undefined when not configured, so existing domains are only updated to an explicit policy
    if (!securityPolicy) {
      return undefined;
    }
    const policy = /^tls_\d_\d$/i.test(securityPolicy) ? securityPolicy.toUpperCase() : securityPolicy;
    const warn = (reason: string) => Logging.logWarning(`securityPolicy '${policy}' ${reason}`);

    // HTTP and WebSocket APIs and multi-level base paths are managed through API Gateway V2
    if (apiType !== Globals.apiTypes.rest || basePath.includes("/")) {
      const policies: string[] = Object.values(HttpSecurityPolicy);
      if (!policies.includes(policy)) {
        warn(`is not supported for HTTP/WebSocket APIs and multi-level base paths, use ${policies.join(" or ")}.`);
      }
      return policy;
    }

    if (!(Object.values(RestSecurityPolicy) as string[]).includes(policy)) {
      warn("is not a known REST API security policy, AWS may reject it.");
    } else if (policy.startsWith("SecurityPolicy_")) {
      const isEdgePolicy = policy.endsWith("_EDGE");
      const isEdgeEndpoint = endpointType === Globals.endpointTypes.edge;
      if (isEdgePolicy && !isEdgeEndpoint) {
        warn(`is for EDGE endpoints only, not ${endpointType}.`);
      } else if (!isEdgePolicy && isEdgeEndpoint) {
        warn("is not supported for EDGE endpoints, use a SecurityPolicy_*_EDGE policy.");
      }
      if (!endpointAccessMode) {
        warn("requires endpointAccessMode (BASIC or STRICT).");
      }
    }
    return policy;
  }

  private static _getRoute53Params (route53Params: Route53Params | undefined, endpointType: string) {
    const routingPolicy = route53Params?.routingPolicy?.toLowerCase() ?? Globals.routingPolicies.simple;
    const routingPolicyToUse = Globals.routingPolicies[routingPolicy];
    if (!routingPolicyToUse) {
      throw new Error(`${routingPolicy} is not a supported routing policy, use simple, latency, or weighted.`);
    }

    if (routingPolicyToUse !== Globals.routingPolicies.simple && (endpointType === Globals.endpointTypes.edge || endpointType === Globals.endpointTypes.private)) {
      throw new Error(
        `${routingPolicy} routing is not intended to be used with ${endpointType} endpoints. ` +
        "Use a regional endpoint instead."
      );
    }

    return {
      routingPolicy: routingPolicyToUse,
      setIdentifier: route53Params?.setIdentifier,
      weight: route53Params?.weight ?? 200,
      healthCheckId: route53Params?.healthCheckId
    };
  }
}

export = DomainConfig;

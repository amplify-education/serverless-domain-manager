/**
 * Wrapper class for Custom Domain information
 */

import * as AWS from "aws-sdk"; // imported for Types
import DomainInfo = require("./domain-info");
import Globals from "./globals";
import {CustomDomain, Route53Params} from "./types";
import {evaluateBoolean} from "./utils";

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
    public enabled: boolean | string | undefined;
    public securityPolicy: string | undefined;
    public autoDomain: boolean | undefined;
    public autoDomainWaitFor: string | undefined;
    public route53Params: Route53Params;
    public preserveExternalPathMappings: boolean | undefined;
    public domainInfo: DomainInfo | undefined;
    public apiId: string | undefined;
    public apiMapping: AWS.ApiGatewayV2.GetApiMappingResponse;
    public allowPathMatching: boolean | false;

    constructor(config: CustomDomain) {

        this.enabled = evaluateBoolean(config.enabled, true);
        this.givenDomainName = config.domainName;
        this.hostedZonePrivate = config.hostedZonePrivate;
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

        let basePath = config.basePath;
        if (!basePath || basePath.trim() === "") {
            basePath = Globals.defaultBasePath;
        }
        this.basePath = basePath;

        let stage = config.stage;
        if (!stage) {
            stage = Globals.options.stage || Globals.serverless.service.provider.stage;
        }
        this.stage = stage;

        const endpointTypeWithDefault = config.endpointType || Globals.endpointTypes.edge;
        const endpointTypeToUse = Globals.endpointTypes[endpointTypeWithDefault.toLowerCase()];
        if (!endpointTypeToUse) {
            throw new Error(`${endpointTypeWithDefault} is not supported endpointType, use EDGE or REGIONAL.`);
        }
        this.endpointType = endpointTypeToUse;

        const apiTypeWithDefault = config.apiType || Globals.apiTypes.rest;
        const apiTypeToUse = Globals.apiTypes[apiTypeWithDefault.toLowerCase()];
        if (!apiTypeToUse) {
            throw new Error(`${apiTypeWithDefault} is not supported api type, use REST, HTTP or WEBSOCKET.`);
        }
        this.apiType = apiTypeToUse;

        const isEdgeType = this.endpointType === Globals.endpointTypes.edge;
        const hasMutualTls = !!config.tlsTruststoreUri;
        if (isEdgeType && hasMutualTls) {
            throw new Error(`${this.endpointType} APIs do not support mutual TLS, remove tlsTruststoreUri or change to a regional API.`);
        }
        if (config.tlsTruststoreUri) {
            this.validateS3Uri(config.tlsTruststoreUri);
        }
        this.tlsTruststoreUri = config.tlsTruststoreUri;
        this.tlsTruststoreVersion = config.tlsTruststoreVersion;

        const securityPolicyDefault = config.securityPolicy || Globals.tlsVersions.tls_1_2;
        const tlsVersionToUse = Globals.tlsVersions[securityPolicyDefault.toLowerCase()];
        if (!tlsVersionToUse) {
            throw new Error(`${securityPolicyDefault} is not a supported securityPolicy, use tls_1_0 or tls_1_2.`);
        }
        this.securityPolicy = tlsVersionToUse;

        const defaultRoutingPolicy = Globals.routingPolicies.simple;
        const routingPolicy = config.route53Params?.routingPolicy?.toLowerCase() ?? defaultRoutingPolicy;
        const routingPolicyToUse = Globals.routingPolicies[routingPolicy];
        if (!routingPolicyToUse) {
            throw new Error(`${routingPolicy} is not a supported routing policy, use simple, latency, or weighted.`);
        }

        if (routingPolicyToUse !== defaultRoutingPolicy && endpointTypeToUse === Globals.endpointTypes.edge) {
            throw new Error(
                `${routingPolicy} routing is not intended to be used with edge endpoints. ` +
                "Use a regional endpoint instead."
            );
        }

        this.route53Params = {
            routingPolicy: routingPolicyToUse,
            setIdentifier: config.route53Params?.setIdentifier,
            weight: config.route53Params?.weight ?? 200,
            healthCheckId: config.route53Params?.healthCheckId
        }
    }

    private validateS3Uri(uri: string): void {
        const { protocol, pathname } = new URL(uri);

        if (protocol !== "s3:" && !pathname.substring(1).includes("/")) {
            throw new Error(`${uri} is not a valid s3 uri, try something like s3://bucket-name/key-name.`);
        }
    }
}

export = DomainConfig;

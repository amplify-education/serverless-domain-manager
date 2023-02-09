/**
 * Wrapper class for Custom Domain information
 */

import DomainInfo = require("./domain-info");
import Globals from "../globals";
import {CustomDomain, Route53Params} from "../types";
import {evaluateBoolean} from "../utils";
import ApiGatewayMap = require("./api-gateway-map");

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
    public autoDomain: boolean | undefined;
    public autoDomainWaitFor: string | undefined;
    public route53Params: Route53Params;
    public preserveExternalPathMappings: boolean | undefined;
    public domainInfo: DomainInfo | undefined;
    public apiId: string | undefined;
    public apiMapping: ApiGatewayMap;
    public allowPathMatching: boolean | false;

    constructor(config: CustomDomain) {

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
        this.basePath = this._getBasePath(config.basePath);
        this.stage = this._getStage(config.stage);
        this.endpointType = this._getEndpointType(config.endpointType);
        this.apiType = this._getApiType(config.apiType);
        this.tlsTruststoreUri = this._getTLSTruststoreUri(config.tlsTruststoreUri, this.endpointType);
        this.tlsTruststoreVersion = config.tlsTruststoreVersion;
        this.securityPolicy = this._getSecurityPolicy(config.securityPolicy);
        this.route53Params = this._getRoute53Params(config.route53Params, this.endpointType);
        this.splitHorizonDns = !this.hostedZoneId && !this.hostedZonePrivate && evaluateBoolean(config.splitHorizonDns, false);
    }

    private _getBasePath(basePath: string | undefined) {
        if (!basePath || basePath.trim() === "") {
            basePath = Globals.defaultBasePath;
        }
        if (Globals.reservedBasePaths.indexOf(basePath) !== -1) {
            Globals.logWarning(
                "The `/ping` and `/sping` paths are reserved for the service health check.\n Please take a look at" +
                "https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-known-issues.html"
            );
        }
        return basePath;
    }

    private _getStage(stage: string | undefined) {
        return stage || Globals.options.stage || Globals.serverless.service.provider.stage;
    }

    private _getEndpointType(endpointType: string | undefined) {
        const endpointTypeWithDefault = endpointType || Globals.endpointTypes.edge;
        const endpointTypeToUse = Globals.endpointTypes[endpointTypeWithDefault.toLowerCase()];
        if (!endpointTypeToUse) {
            throw new Error(`${endpointTypeWithDefault} is not supported endpointType, use EDGE or REGIONAL.`);
        }
        return endpointTypeToUse;
    }

    private _getApiType(apiType: string | undefined) {
        const apiTypeWithDefault = apiType || Globals.apiTypes.rest;
        const apiTypeToUse = Globals.apiTypes[apiTypeWithDefault.toLowerCase()];
        if (!apiTypeToUse) {
            throw new Error(`${apiTypeWithDefault} is not supported api type, use REST, HTTP or WEBSOCKET.`);
        }
        return apiTypeToUse;
    }

    private _getTLSTruststoreUri(tlsTruststoreUri: string | undefined, endpointType: string) {
        if (tlsTruststoreUri) {
            if (endpointType === Globals.endpointTypes.edge) {
                throw new Error(
                    endpointType + " APIs do not support mutual TLS, " +
                    "remove tlsTruststoreUri or change to a regional API."
                );
            }

            const {protocol, pathname} = new URL(tlsTruststoreUri);

            if (protocol !== "s3:" && !pathname.substring(1).includes("/")) {
                throw new Error(
                    `${tlsTruststoreUri} is not a valid s3 uri, try something like s3://bucket-name/key-name.`
                );
            }
        }

        return tlsTruststoreUri;
    }

    private _getSecurityPolicy(securityPolicy: string | undefined) {
        const securityPolicyDefault = securityPolicy || Globals.tlsVersions.tls_1_2;
        const tlsVersionToUse = Globals.tlsVersions[securityPolicyDefault.toLowerCase()];
        if (!tlsVersionToUse) {
            throw new Error(`${securityPolicyDefault} is not a supported securityPolicy, use tls_1_0 or tls_1_2.`);
        }

        return tlsVersionToUse;
    }

    private _getRoute53Params(route53Params: Route53Params | undefined, endpointType: string) {
        const routingPolicy = route53Params?.routingPolicy?.toLowerCase() ?? Globals.routingPolicies.simple;
        const routingPolicyToUse = Globals.routingPolicies[routingPolicy];
        if (!routingPolicyToUse) {
            throw new Error(`${routingPolicy} is not a supported routing policy, use simple, latency, or weighted.`);
        }

        if (routingPolicyToUse !== Globals.routingPolicies.simple && endpointType === Globals.endpointTypes.edge) {
            throw new Error(
                `${routingPolicy} routing is not intended to be used with edge endpoints. ` +
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

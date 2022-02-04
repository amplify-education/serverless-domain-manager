/**
 * Wrapper class for Custom Domain information
 */

import * as AWS from "aws-sdk"; // imported for Types
import DomainInfo = require("./domain-info");
import Globals from "./globals";
import {CustomDomain, Route53Params} from "./types";

class DomainConfig {
    public allowPathMatching: boolean | false;
    public apiId: string | undefined;
    public apiMapping: AWS.ApiGatewayV2.GetApiMappingResponse;
    public apiType: string | undefined;
    public autoDomain: boolean | undefined;
    public autoDomainWaitFor: string | undefined;
    public basePath: string | undefined;
    public certificateArn: string | undefined;
    public certificateName: string | undefined;
    public createRoute53IPv6Record: boolean | undefined;
    public createRoute53Record: boolean | undefined;
    public domainInfo: DomainInfo | undefined;
    public enabled: boolean | string | undefined;
    public endpointType: string | undefined;
    public givenDomainName: string;
    public hostedZoneId: string | undefined;
    public hostedZonePrivate: boolean | undefined;
    public preserveExternalPathMappings: boolean | undefined;
    public route53Params: Route53Params;
    public route53Profile: string | undefined;
    public route53Region: string | undefined;
    public securityPolicy: string | undefined;
    public setupOnPackaging: boolean | undefined;
    public stage: string | undefined;

    constructor(config: CustomDomain) {
        this.allowPathMatching = config.allowPathMatching;
        this.autoDomain = config.autoDomain;
        this.autoDomainWaitFor = config.autoDomainWaitFor;
        this.certificateArn = config.certificateArn;
        this.certificateName = config.certificateName;
        this.createRoute53IPv6Record = this.evaluateBoolean(config.createRoute53IPv6Record, true);
        this.createRoute53Record = this.evaluateBoolean(config.createRoute53Record, true);
        this.enabled = this.evaluateBoolean(config.enabled, true);
        this.givenDomainName = config.domainName;
        this.hostedZoneId = config.hostedZoneId;
        this.hostedZonePrivate = config.hostedZonePrivate;
        this.hostedZonePrivate = config.hostedZonePrivate;
        this.preserveExternalPathMappings = this.evaluateBoolean(config.preserveExternalPathMappings, false);
        this.route53Profile = config.route53Profile;
        this.route53Region = config.route53Region;
        this.setupOnPackaging = this.evaluateBoolean(config.setupOnPackaging, false);

        let basePath = config.basePath;
        if (basePath == null || basePath.trim() === "") {
            basePath = Globals.defaultBasePath;
        }
        this.basePath = basePath;

        let stage = config.stage;
        if (typeof stage === "undefined") {
            stage = Globals.options.stage || Globals.serverless.service.provider.stage;
        }
        this.stage = stage;

        const endpointTypeWithDefault = config.endpointType || Globals.endpointTypes.edge;
        const endpointTypeToUse = Globals.endpointTypes[endpointTypeWithDefault.toLowerCase()];
        if (!endpointTypeToUse) {
            throw new Error(`${endpointTypeWithDefault} is not supported endpointType, use edge or regional.`);
        }
        this.endpointType = endpointTypeToUse;

        const apiTypeWithDefault = config.apiType || Globals.apiTypes.rest;
        const apiTypeToUse = Globals.apiTypes[apiTypeWithDefault.toLowerCase()];
        if (!apiTypeToUse) {
            throw new Error(`${apiTypeWithDefault} is not supported api type, use REST, HTTP or WEBSOCKET.`);
        }
        this.apiType = apiTypeToUse;

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

    /**
     * Determines whether this boolean config is configured to true or false.
     *
     * This method evaluates a customDomain property to see if it's true or false.
     * If the property's value is undefined, the default value is returned.
     * If the property's value is provided, this should be boolean, or a string parseable as boolean,
     * otherwise an exception is thrown.
     * @param {boolean|string} booleanConfig the config value provided
     * @param {boolean} defaultValue the default value to return, if config value is undefined
     * @returns {boolean} the parsed boolean from the config value, or the default value
     */
    private evaluateBoolean(booleanConfig: any, defaultValue: boolean): boolean {
        if (booleanConfig === undefined) {
            return defaultValue;
        }
        if (typeof booleanConfig === "boolean") {
            return booleanConfig;
        } else if (typeof booleanConfig === "string" && booleanConfig === "true") {
            return true;
        } else if (typeof booleanConfig === "string" && booleanConfig === "false") {
            return false;
        }
        throw new Error(`${Globals.pluginName}: Ambiguous boolean config: "${booleanConfig}"`);
    }
}

export = DomainConfig;

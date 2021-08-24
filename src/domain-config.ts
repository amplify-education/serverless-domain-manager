/**
 * Wrapper class for Custom Domain information
 */

import * as AWS from "aws-sdk"; // imported for Types
import DomainInfo = require("./domain-info");
import Globals from "./globals";
import {CustomDomain} from "./types";

class DomainConfig {

    public acm: any;

    public givenDomainName: string;
    public basePath: string | undefined;
    public stage: string | undefined;
    public certificateName: string | undefined;
    public certificateArn: string | undefined;
    public createRoute53Record: boolean | undefined;
    public route53Profile: string | undefined;
    public route53Region: string | undefined;
    public endpointType: string | undefined;
    public apiType: string | undefined;
    public hostedZoneId: string | undefined;
    public hostedZonePrivate: boolean | undefined;
    public enabled: boolean | string | undefined;
    public securityPolicy: string | undefined;
    public autoDomain: boolean | undefined;
    public autoDomainWaitFor: string | undefined;

    public domainInfo: DomainInfo | undefined;
    public apiId: string | undefined;
    public apiMapping: AWS.ApiGatewayV2.GetApiMappingResponse;
    public allowPathMatching: boolean | false;

    constructor(config: CustomDomain) {

        this.enabled = this.evaluateEnabled(config.enabled);
        this.givenDomainName = config.domainName;
        this.hostedZonePrivate = config.hostedZonePrivate;
        this.certificateArn = config.certificateArn;
        this.certificateName = config.certificateName;
        this.createRoute53Record = config.createRoute53Record;
        this.route53Profile = config.route53Profile;
        this.route53Region = config.route53Region;
        this.hostedZoneId = config.hostedZoneId;
        this.hostedZonePrivate = config.hostedZonePrivate;
        this.allowPathMatching = config.allowPathMatching;
        this.autoDomain = config.autoDomain;
        this.autoDomainWaitFor = config.autoDomainWaitFor;

        let basePath = config.basePath;
        if (basePath == null || basePath.trim() === "") {
            basePath = "(none)";
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

        let region = Globals.defaultRegion;
        if (this.endpointType === Globals.endpointTypes.regional) {
            region = Globals.serverless.providers.aws.getRegion();
        }
        const acmCredentials = Object.assign({}, Globals.serverless.providers.aws.getCredentials(), {region});
        this.acm = new Globals.serverless.providers.aws.sdk.ACM(acmCredentials);
    }

    /**
     * Determines whether this plug-in is enabled.
     *
     * This method reads the customDomain property "enabled" to see if this plug-in should be enabled.
     * If the property's value is undefined, a default value of true is assumed (for backwards
     * compatibility).
     * If the property's value is provided, this should be boolean, otherwise an exception is thrown.
     * If no customDomain object exists, an exception is thrown.
     */
    private evaluateEnabled(enabled: any): boolean {
        if (enabled === undefined) {
            return true;
        }
        if (typeof enabled === "boolean") {
            return enabled;
        } else if (typeof enabled === "string" && enabled === "true") {
            return true;
        } else if (typeof enabled === "string" && enabled === "false") {
            return false;
        }
        throw new Error(`${Globals.pluginName}: Ambiguous enablement boolean: "${enabled}"`);
    }
}

export = DomainConfig;

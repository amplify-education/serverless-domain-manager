/**
 * Wrapper class for Custom Domain information
 */

import * as AWS from "aws-sdk"; // imported for Types
import DomainInfo = require("./DomainInfo");
import Globals from "./Globals";
import {CustomDomain} from "./types";

class DomainConfig {

    public acm: any;

    public givenDomainName: string;
    public basePath: string | undefined;
    public stage: string | undefined;
    public certificateName: string | undefined;
    public certificateArn: string | undefined;
    public createRoute53Record: boolean | undefined;
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

        this.enabled = this.evaluateBoolean(config.enabled, true);
        this.givenDomainName = config.domainName;
        this.hostedZonePrivate = config.hostedZonePrivate;
        this.certificateArn = config.certificateArn;
        this.certificateName = config.certificateName;
        this.createRoute53Record = this.evaluateBoolean(config.createRoute53Record, true);
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

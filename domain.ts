import { CustomDomain, ServerlessInstance, ServerlessOptions } from "./types";

const tlsVersions = {
    tls_1_0: "TLS_1_0",
    tls_1_2: "TLS_1_2",
};

export const endpointTypes = {
    edge: "EDGE",
    regional: "REGIONAL",
};

export class Domain {

    // AWS SDK resources
    public acm: any;

    public DomainName: string;
    public BasePath: string;
    public Stage: string;
    public EndpointType: string;
    public SecurityPolicy: string;
    public Enabled: boolean | string;
    public CertificateARN: string;
    public CertificateName: string;
    public CreateRoute53Record: boolean;
    public HostedZoneId: string;
    public HostedZonePrivate: boolean;

    public serverless: ServerlessInstance;
    public options: ServerlessOptions;

    constructor(serverless: ServerlessInstance, options: ServerlessOptions, customDomain: CustomDomain)  {
        this.serverless = serverless;
        this.options = options;

        const credentials = this.serverless.providers.aws.getCredentials();
        credentials.region = this.serverless.providers.aws.getRegion();

        this.DomainName = customDomain.domainName;
        this.Enabled = customDomain.enabled;
        this.CertificateARN = customDomain.certificateArn;
        this.CertificateName = customDomain.certificateName;
        this.CreateRoute53Record = customDomain.createRoute53Record;
        this.HostedZoneId = customDomain.hostedZoneId;
        this.HostedZonePrivate = customDomain.hostedZonePrivate;

        let basePath = customDomain.basePath;
        if (basePath == null || basePath.trim() === "") {
            basePath = "(none)";
        }
        this.BasePath = basePath;

        let stage = customDomain.stage;
        if (typeof stage === "undefined") {
            stage = this.options.stage || this.serverless.service.provider.stage;
        }
        this.Stage = stage;

        const endpointTypeWithDefault = customDomain.endpointType ||
        endpointTypes.edge;
        const endpointTypeToUse = endpointTypes[endpointTypeWithDefault.toLowerCase()];
        if (!endpointTypeToUse) {
            throw new Error(`${endpointTypeWithDefault} is not supported endpointType, use edge or regional.`);
        }
        this.EndpointType = endpointTypeToUse;

        const securityPolicyDefault = customDomain.securityPolicy ||
        tlsVersions.tls_1_2;
        const tlsVersionToUse = tlsVersions[securityPolicyDefault.toLowerCase()];
        if (!tlsVersionToUse) {
            throw new Error(`${securityPolicyDefault} is not a supported securityPolicy, use tls_1_0 or tls_1_2.`);
        }
        this.SecurityPolicy = tlsVersionToUse;

        const region = this.EndpointType === endpointTypes.regional ?
        this.serverless.providers.aws.getRegion() : "us-east-1";
        const acmCredentials = Object.assign({}, credentials, { region });
        this.acm = new this.serverless.providers.aws.sdk.ACM(acmCredentials);
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
    public evaluateEnabled(): boolean {
        const enabled = this.Enabled;
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

        throw new Error(`serverless-domain-manager: Ambiguous enablement boolean: "${enabled}"`);
    }
}

/**
 * Wrapper class for Custom Domain information
 */
class DomainInfo {

    public domainName: string;
    public hostedZoneId: string;
    public securityPolicy: string;

    /**
     * Sometimes, the getDomainName call doesn't return either a distributionHostedZoneId or a regionalHostedZoneId.
     * AFAICT, this only happens with edge-optimized endpoints.
     * The hostedZoneId for these endpoints is always the one below.
     * Docs: https://docs.aws.amazon.com/general/latest/gr/rande.html#apigateway_region
     * PR: https://github.com/amplify-education/serverless-domain-manager/pull/171
     */
    private defaultHostedZoneId: string = "Z2FDTNDATAQYW2";
    private defaultSecurityPolicy: string = "TLS_1_2";

    constructor(data: any) {
        this.domainName = data.distributionDomainName || data.regionalDomainName;
        this.hostedZoneId = data.distributionHostedZoneId ||
            data.regionalHostedZoneId ||
            this.defaultHostedZoneId;
        this.securityPolicy = data.securityPolicy || this.defaultSecurityPolicy;
    }
}

export = DomainInfo;

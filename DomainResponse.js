"use strict";
/**
 * Wrapper class for Custom Domain information
 */
class DomainResponse {
    constructor(data) {
        /**
         * Sometimes, the getDomainName call doesn't return either a distributionHostedZoneId or a regionalHostedZoneId.
         * AFAICT, this only happens with edge-optimized endpoints.
         * The hostedZoneId for these endpoints is always the one below.
         * Docs: https://docs.aws.amazon.com/general/latest/gr/rande.html#apigateway_region
         * PR: https://github.com/amplify-education/serverless-domain-manager/pull/171
         */
        this.defaultHostedZoneId = "Z2FDTNDATAQYW2";
        this.domainName = data.distributionDomainName || data.regionalDomainName;
        this.hostedZoneId = data.distributionHostedZoneId ||
            data.regionalHostedZoneId ||
            this.defaultHostedZoneId;
    }
}
module.exports = DomainResponse;

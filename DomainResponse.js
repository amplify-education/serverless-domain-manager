'use strict';

// Sometimes, the getDomainName call doesn't return either a distributionHostedZoneId or a
// regionalHostedZoneId.
// AFAICT, this only happens with edge-optimized endpoints. The hostedZoneId for these endpoints
// is always the one below.
// Docs: https://docs.aws.amazon.com/general/latest/gr/rande.html#apigateway_region
// PR: https://github.com/amplify-education/serverless-domain-manager/pull/171
const defaultHostedZoneId = 'Z2FDTNDATAQYW2';

class DomainResponse {
  constructor(data) {
    return {
      domainName: data.distributionDomainName || data.regionalDomainName,
      hostedZoneId: data.distributionHostedZoneId ||
                    data.regionalHostedZoneId ||
                    defaultHostedZoneId,
    };
  }
}

module.exports = DomainResponse;

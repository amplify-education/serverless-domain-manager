'use strict';

class DomainResponse {
  constructor(data) {
    return {
      domainName: data.distributionDomainName || data.regionalDomainName,
      hostedZoneId: data.distributionHostedZoneId || data.regionalHostedZoneId,
    };
  }
}

module.exports = DomainResponse;

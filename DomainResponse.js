'use strict';

class DomainResponse {
  constructor(data) {
    return {
      domainName: data.distributionDomainName || data.regionalDomainName,
      hostedZoneId: data.distributionHostedZoneId || data.regionalHostedZoneId || 'Z2FDTNDATAQYW2',
    };
  }
}

module.exports = DomainResponse;

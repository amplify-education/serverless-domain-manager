class DomainResponse {
  constructor(data, hostedZoneId) {
    return {
      domainName: data.distributionDomainName || data.regionalDomainName,
      hostedZoneId: hostedZoneId || data.distributionHostedZoneId || data.regionalHostedZoneId,
    };
  }
}

module.exports = DomainResponse;

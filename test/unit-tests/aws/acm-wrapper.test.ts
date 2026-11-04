import ACMWrapper = require("../../../src/aws/acm-wrapper");
import DomainConfig = require("../../../src/models/domain-config");
import Globals from "../../../src/globals";
import { expect, getDomainConfig } from "../base";
import { mockClient } from "aws-sdk-client-mock";
import { ACMClient, ListCertificatesCommand } from "@aws-sdk/client-acm";

const testCertificateArnByName = "test_certificate_name";
const testCertificateArnByDomain = "test_domain_arn";
const certTestData = {
  CertificateSummaryList: [
    {
      CertificateArn: testCertificateArnByDomain,
      DomainName: "test_domain"
    }, {
      CertificateArn: testCertificateArnByName,
      DomainName: "cert_name"
    }, {
      CertificateArn: "test_dummy_arn",
      DomainName: "other_cert_name"
    }
  ]
};

describe("ACM Wrapper checks", () => {
  it("Initialization edge", async () => {
    const acmWrapper = new ACMWrapper(null, Globals.endpointTypes.edge);
    const actualResult = await acmWrapper.acm.config.region();
    expect(actualResult).to.equal(Globals.defaultRegion);
  });

  it("Initialization regional", async () => {
    const acmWrapper = new ACMWrapper(null, Globals.endpointTypes.regional);
    const actualResult = await acmWrapper.acm.config.region();
    expect(actualResult).to.equal(Globals.currentRegion);
  });

  it("getCertArn by certificate name", async () => {
    const ACMCMock = mockClient(ACMClient);
    ACMCMock.on(ListCertificatesCommand).resolves(certTestData);

    const acmWrapper = new ACMWrapper(null, Globals.endpointTypes.regional);
    const dc = new DomainConfig(getDomainConfig({
      certificateName: "cert_name"
    }));

    const actualResult = await acmWrapper.getCertArn(dc);
    expect(actualResult).to.equal(testCertificateArnByName);
  });

  it("getCertArn by domain name", async () => {
    const ACMCMock = mockClient(ACMClient);
    ACMCMock.on(ListCertificatesCommand).resolves(certTestData);

    const acmWrapper = new ACMWrapper(null, Globals.endpointTypes.regional);
    const dc = new DomainConfig(getDomainConfig({
      domainName: "test_domain"
    }));

    const actualResult = await acmWrapper.getCertArn(dc);
    expect(actualResult).to.equal(testCertificateArnByDomain);
  });

  it("getCertArn by domain name by getting all paginated certificates from AWS", async () => {
    const ACMCMock = mockClient(ACMClient);
    ACMCMock.on(ListCertificatesCommand)
      .resolvesOnce({
        CertificateSummaryList: [
          {
            CertificateArn: "test_domain_arn",
            DomainName: "test_domain",
            Status: "ISSUED"
          }
        ],
        NextToken: "NextToken"
      })
      .resolves({
        CertificateSummaryList: [
          {
            CertificateArn: "test_domain_arn2",
            DomainName: "test_domain2",
            Status: "ISSUED"
          }
        ]
      });

    const acmWrapper = new ACMWrapper(null, Globals.endpointTypes.regional);
    const dc = new DomainConfig(getDomainConfig({
      domainName: "test_domain"
    }));

    const actualResult = await acmWrapper.getCertArn(dc);
    expect(actualResult).to.equal(testCertificateArnByDomain);
    expect(ACMCMock.calls().length).to.equal(2);
  });

  it("empty getCertArn by certificate name", async () => {
    const ACMCMock = mockClient(ACMClient);
    ACMCMock.on(ListCertificatesCommand).resolves(certTestData);

    const certificateName = "not_existing_certificate";
    const acmWrapper = new ACMWrapper(null, Globals.endpointTypes.regional);
    const dc = new DomainConfig(getDomainConfig({ certificateName }));

    let errored = false;
    try {
      await acmWrapper.getCertArn(dc);
    } catch (err) {
      errored = true;
      expect(err.message).to.contains(`Could not find an in-date certificate for '${certificateName}'`);
    }
    expect(errored).to.equal(true);
  });

  it("getCertArn with wild card and alternative name summaries", async () => {
    const wildCardCertificate = "*.test_domain";
    const ACMCMock = mockClient(ACMClient);
    ACMCMock.on(ListCertificatesCommand).resolves({
      CertificateSummaryList: [{
        CertificateArn: testCertificateArnByDomain,
        DomainName: "dammy_domain",
        SubjectAlternativeNameSummaries: [
          wildCardCertificate
        ]
      }]
    });

    const acmWrapper = new ACMWrapper(null, Globals.endpointTypes.regional);
    const dc = new DomainConfig(getDomainConfig({
      domainName: "sub.test_domain"
    }));

    const actualResult = await acmWrapper.getCertArn(dc);
    expect(actualResult).to.equal(testCertificateArnByDomain);
  });

  it("getCertArn prefers an exact match over a wildcard and matches case-insensitively", async () => {
    const ACMCMock = mockClient(ACMClient);
    ACMCMock.on(ListCertificatesCommand).resolves({
      CertificateSummaryList: [
        { CertificateArn: "wildcard_arn", DomainName: "*.example.com" },
        { CertificateArn: "exact_arn", DomainName: "API.example.com" }
      ]
    });

    const acmWrapper = new ACMWrapper(null, Globals.endpointTypes.regional);
    const dc = new DomainConfig(getDomainConfig({ domainName: "api.Example.com" }));

    expect(await acmWrapper.getCertArn(dc)).to.equal("exact_arn");
  });

  for (const { domainName, certName } of [
    { domainName: "api.notexample.com", certName: "example.com" },
    { domainName: "api.example.com.au", certName: "example.com" },
    { domainName: "api.example.com", certName: "example.com" },
    { domainName: "a.b.example.com", certName: "*.example.com" },
    { domainName: "example.com", certName: "*.example.com" }
  ]) {
    it(`getCertArn does not pick '${certName}' for '${domainName}'`, async () => {
      const ACMCMock = mockClient(ACMClient);
      ACMCMock.on(ListCertificatesCommand).resolves({
        CertificateSummaryList: [{ CertificateArn: "wrong_arn", DomainName: certName }]
      });

      const acmWrapper = new ACMWrapper(null, Globals.endpointTypes.regional);
      const dc = new DomainConfig(getDomainConfig({ domainName }));

      let errored = false;
      try {
        await acmWrapper.getCertArn(dc);
      } catch (err) {
        errored = true;
        expect(err.message).to.contains(`Could not find an in-date certificate for '${domainName}'`);
      }
      expect(errored).to.equal(true);
    });
  }

  it("empty getCertArn by domain name", async () => {
    const ACMCMock = mockClient(ACMClient);
    ACMCMock.on(ListCertificatesCommand).resolves(certTestData);

    const domainName = "not_existing_domain";
    const acmWrapper = new ACMWrapper(null, Globals.endpointTypes.regional);
    const dc = new DomainConfig(getDomainConfig({ domainName }));

    let errored = false;
    try {
      await acmWrapper.getCertArn(dc);
    } catch (err) {
      errored = true;
      expect(err.message).to.contains(`Could not find an in-date certificate for '${domainName}'`);
    }
    expect(errored).to.equal(true);
  });

  it("getCertArn failure", async () => {
    const awsError = new Error("throttled");
    const ACMCMock = mockClient(ACMClient);
    ACMCMock.on(ListCertificatesCommand).rejects(awsError);

    const acmWrapper = new ACMWrapper(null, Globals.endpointTypes.regional);
    const dc = new DomainConfig(getDomainConfig({
      domainName: "test_domain"
    }));

    let errored = false;
    try {
      await acmWrapper.getCertArn(dc);
    } catch (err) {
      errored = true;
      expect(err.message).to.contains("Could not search certificates in Certificate Manager");
      expect(err.cause).to.equal(awsError);
    }
    expect(errored).to.equal(true);
  });

  it("getCertArn failure for Edge", async () => {
    const ACMCMock = mockClient(ACMClient);
    ACMCMock.on(ListCertificatesCommand).resolves({ CertificateSummaryList: [] });

    const acmWrapper = new ACMWrapper(null, Globals.endpointTypes.edge);
    const dc = new DomainConfig(getDomainConfig({ domainName: "test_domain" }));

    let errored = false;
    try {
      await acmWrapper.getCertArn(dc);
    } catch (err) {
      errored = true;
      expect(err.message).to.contains(
        `Make sure the needed ACM certificate exists in the '${Globals.defaultRegion}' region`
      );
    }
    expect(errored).to.equal(true);
  });
});

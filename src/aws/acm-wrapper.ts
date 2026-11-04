import {
  CertificateStatus,
  ACMClient,
  CertificateSummary,
  KeyAlgorithm,
  ListCertificatesCommand,
  ListCertificatesCommandInput,
  ListCertificatesCommandOutput
} from "@aws-sdk/client-acm";
import Globals from "../globals";
import DomainConfig = require("../models/domain-config");
import { getAWSPagedResults } from "../utils";
import Logging from "../logging";

const certStatuses = [
  CertificateStatus.PENDING_VALIDATION,
  CertificateStatus.ISSUED,
  CertificateStatus.INACTIVE
];

class ACMWrapper {
  public acm: ACMClient;

  constructor (credentials: any, endpointType: string) {
    const isEdge = endpointType === Globals.endpointTypes.edge;
    this.acm = new ACMClient({
      credentials,
      region: isEdge ? Globals.defaultRegion : Globals.getRegion(),
      retryStrategy: Globals.getRetryStrategy(),
      requestHandler: Globals.getRequestHandler(),
      endpoint: Globals.getServiceEndpoint("acm")
    });
  }

  public async getCertArn (domain: DomainConfig): Promise<string> {
    let certificateArn; // The arn of the selected certificate
    let certificateName = domain.certificateName; // The certificate name

    try {
      const certificates = await getAWSPagedResults<CertificateSummary, ListCertificatesCommandInput, ListCertificatesCommandOutput>(
        this.acm,
        "CertificateSummaryList",
        "NextToken",
        "NextToken",
        new ListCertificatesCommand({
          CertificateStatuses: certStatuses,
          // ACM ListCertificates defaults to RSA_1024/RSA_2048 only; without
          // Includes.keyTypes every EC-key certificate is silently omitted, so
          // getCertArnByCertName / getCertArnByDomainName never see them.
          Includes: { keyTypes: Object.values(KeyAlgorithm) }
        })
      );
      // enhancement idea: weight the choice of cert so longer expires
      // and RenewalEligibility = ELIGIBLE is more preferable
      if (certificateName) {
        certificateArn = this.getCertArnByCertName(certificates, certificateName);
      } else {
        certificateName = domain.givenDomainName;
        certificateArn = ACMWrapper.getCertArnByDomainName(certificates, certificateName);
      }
      Logging.logInfo(`Found a certificate ARN: '${certificateArn}'`);
    } catch (err) {
      throw Error(`Could not search certificates in Certificate Manager.\n${err.message}`, { cause: err });
    }
    if (certificateArn == null) {
      let errorMessage = `Could not find an in-date certificate for '${certificateName}'.`;
      if (domain.endpointType === Globals.endpointTypes.edge) {
        errorMessage += ` The endpoint type '${Globals.endpointTypes.edge}' is used. ` +
          `Make sure the needed ACM certificate exists in the '${Globals.defaultRegion}' region.`;
      }
      if (domain.endpointType === Globals.endpointTypes.private) {
        errorMessage += ` The endpoint type '${Globals.endpointTypes.private}' is used. ` +
          `Make sure the needed ACM certificate exists in the '${Globals.getRegion()}' region.`;
      }
      throw Error(errorMessage);
    }
    return certificateArn;
  }

  private getCertArnByCertName (certificates, certName): string {
    const found = certificates.find((c) => c.DomainName === certName);
    if (found) {
      return found.CertificateArn;
    }
    return null;
  }

  private static getCertArnByDomainName (certificates, domainName): string {
    // The more specific name will be the longest
    let nameLength = 0;
    let certificateArn;
    for (const currCert of certificates) {
      const allDomainsForCert = [
        currCert.DomainName,
        ...(currCert.SubjectAlternativeNameSummaries || [])
      ];
      for (const currCertDomain of allDomainsForCert) {
        // Also checks if the name is more specific than previous ones
        if (ACMWrapper.certNameCoversDomain(currCertDomain, domainName) && currCertDomain.length > nameLength) {
          nameLength = currCertDomain.length;
          certificateArn = currCert.CertificateArn;
        }
      }
    }
    return certificateArn;
  }

  /**
   * Checks whether a certificate name covers the given domain, following TLS rules:
   * an exact name matches only itself, and a wildcard (`*.example.com`) matches
   * exactly one label in its place (`api.example.com`, but not `a.b.example.com`).
   */
  private static certNameCoversDomain (certName: string, domainName: string): boolean {
    const cert = certName.toLowerCase();
    const domain = domainName.toLowerCase();
    if (!cert.startsWith("*.")) {
      return cert === domain;
    }
    const parent = cert.substring(1); // ".example.com"
    if (!domain.endsWith(parent)) {
      return false;
    }
    const label = domain.substring(0, domain.length - parent.length);
    return label.length > 0 && !label.includes(".");
  }
}

export = ACMWrapper;

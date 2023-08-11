import {
  ACMClient,
  CertificateSummary,
  ListCertificatesCommand,
  ListCertificatesCommandInput,
  ListCertificatesCommandOutput
} from "@aws-sdk/client-acm";
import Globals from "../globals";
import DomainConfig = require("../models/domain-config");
import { getAWSPagedResults } from "../utils";

const certStatuses = ["PENDING_VALIDATION", "ISSUED", "INACTIVE"];

class ACMWrapper {
    public acm: ACMClient;

    constructor(credentials: any, endpointType: string) {
        const isEdge = endpointType === Globals.endpointTypes.edge;
        this.acm = new ACMClient({
          credentials,
          region: isEdge ? Globals.defaultRegion : Globals.getRegion(),
          retryStrategy: Globals.getRetryStrategy()
        });
    }

    public async getCertArn(domain: DomainConfig): Promise<string> {
        let certificateArn; // The arn of the selected certificate
        let certificateName = domain.certificateName; // The certificate name

        try {
          const certificates = await getAWSPagedResults<CertificateSummary, ListCertificatesCommandInput, ListCertificatesCommandOutput>(
            this.acm,
            "CertificateSummaryList",
            "NextToken",
            "NextToken",
            new ListCertificatesCommand({ CertificateStatuses: certStatuses })
          );
          // enhancement idea: weight the choice of cert so longer expires
          // and RenewalEligibility = ELIGIBLE is more preferable
          if (certificateName) {
            certificateArn = this.getCertArnByCertName(certificates, certificateName);
          } else {
            certificateName = domain.givenDomainName;
            certificateArn = this.getCertArnByDomainName(certificates, certificateName);
          }
        } catch (err) {
          throw Error(`Could not search certificates in Certificate Manager.\n${err.message}`);
        }
        if (certificateArn == null) {
          throw Error(`Could not find an in-date certificate for '${certificateName}'.`);
        }
        return certificateArn;
    }

    private getCertArnByCertName(certificates, certName): string {
      const found = certificates.find((c) => c.DomainName === certName);
      if (found) {
        return found.CertificateArn;
      }
      return null;
    }

    private getCertArnByDomainName(certificates, domainName): string {
      // The more specific name will be the longest
      let nameLength = 0;
      let certificateArn;
      for (const currCert of certificates) {
        const allDomainsForCert = [
          currCert.DomainName,
          ...(currCert.SubjectAlternativeNameSummaries || []),
        ];
        for (const currCertDomain of allDomainsForCert) {
          let certificateListName = currCertDomain;
          // Looks for wild card and take it out when checking
          if (certificateListName[0] === "*") {
            certificateListName = certificateListName.substring(1);
          }
          // Looks to see if the name in the list is within the given domain
          // Also checks if the name is more specific than previous ones
          if (domainName.includes(certificateListName) && certificateListName.length > nameLength) {
            nameLength = certificateListName.length;
            certificateArn = currCert.CertificateArn;
          }
        }
      }
      return certificateArn;
    }
}

export = ACMWrapper;

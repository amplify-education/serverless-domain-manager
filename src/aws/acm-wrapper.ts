import {ACM} from "aws-sdk";
import Globals from "../globals";
import {getAWSPagedResults, throttledCall} from "../utils";
import DomainConfig = require("../domain-config");

const certStatuses = ["PENDING_VALIDATION", "ISSUED", "INACTIVE"];

class ACMWrapper {
    public acm: ACM;

    constructor(endpointType: string) {
        const credentials = Globals.serverless.providers.aws.getCredentials();
        credentials.region = Globals.defaultRegion;
        if (endpointType === Globals.endpointTypes.regional) {
            credentials.region = Globals.serverless.providers.aws.getRegion();
        }
        this.acm = new Globals.serverless.providers.aws.sdk.ACM(credentials);
    }

    /**
     * * Gets Certificate ARN that most closely matches domain name OR given Cert ARN if provided
     */
    public async getCertArn(domain: DomainConfig): Promise<string> {
        if (domain.certificateArn) {
            Globals.logInfo(`Selected specific certificateArn '${domain.certificateArn}'`);
            return domain.certificateArn;
        }

        let certificateArn; // The arn of the selected certificate
        let certificateName = domain.certificateName; // The certificate name

        try {
            const certificates = await getAWSPagedResults(
                this.acm,
                "listCertificates",
                "CertificateSummaryList",
                "NextToken",
                "NextToken",
                {CertificateStatuses: certStatuses},
            );

            // The more specific name will be the longest
            let nameLength = 0;
            // Checks if a certificate name is given
            if (certificateName != null) {
                // note: we only check DomainName, but a future enhancement could
                // be to also check SubjectAlternativeNames
                const matches = certificates
                    .filter((certificate) => (certificate.DomainName === certificateName));
                for (const curr of matches) {
                  const currArn = curr.CertificateArn;
                  const details = await throttledCall(
                      this.acm,
                      "describeCertificate",
                      {CertificateArn: currArn},
                  );
                  const currNotAfter = details.Certificate.NotAfter;
                  if (Date.now() < currNotAfter) {
                    Globals.logInfo(`Selecting cert with ARN=${
                      currArn} with future expiry (${currNotAfter.toISOString()})`);
                    certificateArn = currArn;
                    break;
                  }
                  Globals.logInfo(`Ignoring cert with ARN=${
                    currArn} that is expired (${currNotAfter.toISOString()})`);
                }
            } else {
                certificateName = domain.givenDomainName;
                certificates.forEach((certificate) => {
                    let certificateListName = certificate.DomainName;
                    // Looks for wild card and takes it out when checking
                    if (certificateListName[0] === "*") {
                        certificateListName = certificateListName.substring(1);
                    }
                    // Looks to see if the name in the list is within the given domain
                    // Also checks if the name is more specific than previous ones
                    if (certificateName.includes(certificateListName)
                        && certificateListName.length > nameLength) {
                        nameLength = certificateListName.length;
                        certificateArn = certificate.CertificateArn;
                    }
                });
            }
        } catch (err) {
            throw Error(`Could not search certificates in Certificate Manager.\n${err.message}`);
        }
        if (certificateArn == null) {
            throw Error(`Could not find an in-date certificate for '${certificateName}'.`);
        }
        return certificateArn;
    }
}

export = ACMWrapper;

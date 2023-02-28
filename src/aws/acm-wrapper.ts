import {
    ACMClient,
    ListCertificatesCommand,
    ListCertificatesCommandOutput,
} from "@aws-sdk/client-acm";
import Globals from "../globals";
import DomainConfig = require("../models/domain-config");

const certStatuses = ["PENDING_VALIDATION", "ISSUED", "INACTIVE"];

class ACMWrapper {
    public acm: ACMClient;

    constructor(endpointType: string) {
        const credentials = Globals.serverless.providers.aws.getCredentials();
        credentials.region = Globals.defaultRegion;
        if (endpointType === Globals.endpointTypes.regional) {
            credentials.region = Globals.serverless.providers.aws.getRegion();
        }
        this.acm = new ACMClient(credentials);
    }

    /**
     * * Gets Certificate ARN that most closely matches domain name OR given Cert ARN if provided
     */
    public async getCertArn(domain: DomainConfig): Promise<string> {
        let certificateArn; // The arn of the selected certificate
        let certificateName = domain.certificateName; // The certificate name


        try {
            const response: ListCertificatesCommandOutput = await this.acm.send(
                new ListCertificatesCommand({CertificateStatuses: certStatuses})
            )
            // enhancement idea: weight the choice of cert so longer expires
            // and RenewalEligibility = ELIGIBLE is more preferable
            if (certificateName != null) {
                certificateArn = this.getCertArnByCertName(response.CertificateSummaryList, certificateName);
            } else {
                certificateName = domain.givenDomainName;
                certificateArn = this.getCertArnByDomainName(response.CertificateSummaryList, certificateName);
            }
        } catch (err) {
            throw Error(`Could not search certificates in Certificate Manager.\n${err.message}`);
        }
        if (certificateArn == null) {
            throw Error(`Could not find an in-date certificate for '${certificateName}'.`);
        }
        return certificateArn;
    }

    /**
     * * Gets Certificate ARN that most closely matches Cert ARN and not expired
     */
    private getCertArnByCertName(certificates, certName): string {
        const found = certificates.find((c) => c.DomainName === certName);
        if (found) {
            return found.CertificateArn;
        }
        return null;
    }

    /**
     * * Gets Certificate ARN that most closely matches domain name
     */
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
                if (domainName.includes(certificateListName)
                    && certificateListName.length > nameLength
                ) {
                    nameLength = certificateListName.length;
                    certificateArn = currCert.CertificateArn;
                }
            }
        }
        return certificateArn;
    }
}

export = ACMWrapper;

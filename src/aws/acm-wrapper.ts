import {ACM} from "aws-sdk";
import Globals from "../globals";
import {getAWSPagedResults} from "../utils";
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
        let certificateArn; // The arn of the selected certificate
        let certificateName = domain.certificateName; // The certificate name
        let certificates = [];

        try {
            certificates = await getAWSPagedResults(
                this.acm,
                "listCertificates",
                "CertificateSummaryList",
                "NextToken",
                "NextToken",
                {CertificateStatuses: certStatuses},
            );
        } catch (err) {
            Globals.logError(err, domain.givenDomainName);
            throw Error(`Could not list certificates in Certificate Manager.\n${err}`);
        }

        // The more specific name will be the longest
        let nameLength = 0;
        // Checks if a certificate name is given
        if (certificateName) {
            const checkNames = certificateName.startsWith("*.") ? [certificateName]
                : [certificateName, `*.${certificateName}`]
            const foundCertificate = certificates.find((certificate) => {
                // Looks for wild card 'example.tld' => '*.example.tld'
                return checkNames.includes(certificate.DomainName)
            });
            if (foundCertificate != null) {
                certificateArn = foundCertificate.CertificateArn;
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
                if (certificateName.includes(certificateListName) && certificateListName.length > nameLength) {
                    nameLength = certificateListName.length;
                    certificateArn = certificate.CertificateArn;
                }
            });
        }

        if (certificateArn == null) {
            throw Error(`Could not find the certificate ${certificateName}.`);
        }
        return certificateArn;
    }
}

export = ACMWrapper;

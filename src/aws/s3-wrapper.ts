import DomainConfig = require("../models/domain-config");
import Logging from "../logging";
import {HeadObjectCommand, HeadObjectRequest, S3Client} from "@aws-sdk/client-s3";

class S3Wrapper {
    public s3: S3Client;

    constructor(credentials: any) {
        this.s3 = new S3Client(credentials);
    }

    /**
     * * Checks whether the Mutual TLS certificate exists in S3 or not
     */
    public async assertTlsCertObjectExists(domain: DomainConfig): Promise<void> {
        try {
            const {Bucket, Key} = this.extractBucketAndKey(domain.tlsTruststoreUri);
            const params: HeadObjectRequest = {Bucket, Key};

            if (domain.tlsTruststoreVersion) {
                params.VersionId = domain.tlsTruststoreVersion;
            }

            await this.s3.send(new HeadObjectCommand(params));
        } catch (err) {
            if (err.$metadata && err.$metadata.httpStatusCode !== 403) {
                throw Error(`Could not head S3 object at ${domain.tlsTruststoreUri}.\n${err.message}`);
            }

            Logging.logWarning(
                `Forbidden to check the existence of the S3 object ${domain.tlsTruststoreUri} due to\n${err}`
            );
        }
    }

    /**
     * * Extracts Bucket and Key from the given s3 uri
     */
    private extractBucketAndKey(uri: string): { Bucket: string; Key: string } {
        const {hostname, pathname} = new URL(uri);
        return {Bucket: hostname, Key: pathname.substring(1)};
    }
}

export = S3Wrapper;

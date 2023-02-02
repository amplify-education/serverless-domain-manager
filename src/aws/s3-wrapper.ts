import {S3} from "aws-sdk";
import {throttledCall} from "../utils";
import DomainConfig = require("../domain-config");
import Globals from "../globals";

class S3Wrapper {
    public s3: S3;

    constructor(credentials: any) {
        this.s3 = new S3(credentials);
    }

    /**
     * * Checks whether the Mutual TLS certificate exists in S3 or not
     */
    public async assertTlsCertObjectExists(domain: DomainConfig): Promise<void> {
        try {
            const {Bucket, Key} = this.extractBucketAndKey(domain.tlsTruststoreUri);
            const params: S3.Types.HeadObjectRequest = {Bucket, Key};

            if (domain.tlsTruststoreVersion) {
                params.VersionId = domain.tlsTruststoreVersion;
            }

            await throttledCall(this.s3, "headObject", params);
        } catch (err) {
            if (err.code !== "AccessDenied") {
                Globals.logError(err);
                throw Error(`Could not head S3 object at ${domain.tlsTruststoreUri}.\n${err.message}`);
            }

            Globals.logWarning(`Unable to check existance of S3 object at ${domain.tlsTruststoreUri} due to\n${err.message}`);
        }
    }

    /**
     * * Extracts Bucket and Key from the given s3 uri
     */
    private extractBucketAndKey(uri: string): { Bucket: string; Key: string } {
        const { hostname, pathname } = new URL(uri);

        return { Bucket: hostname, Key: pathname.substring(1) };
    }
}

export = S3Wrapper;

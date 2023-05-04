import {consoleOutput, expect, getDomainConfig} from "../base";
import Globals from "../../../src/globals";
import S3Wrapper = require("../../../src/aws/s3-wrapper");
import {mockClient} from "aws-sdk-client-mock";
import {HeadObjectCommand, S3Client} from "@aws-sdk/client-s3";
import DomainConfig = require("../../../src/models/domain-config");

describe("S3 wrapper checks", () => {
    beforeEach(() => {
        consoleOutput.length = 0;
    });

    it("Initialization", async () => {
        const s3Wrapper = new S3Wrapper();
        const actualResult = await s3Wrapper.s3.config.region();
        expect(actualResult).to.equal(Globals.currentRegion);
    });

    it("Assert TlS cert object exists", async () => {
        const S3Mock = mockClient(S3Client);
        S3Mock.on(HeadObjectCommand).resolves(null);

        const dc = new DomainConfig(getDomainConfig({
            domainName: "test_domain",
            endpointType: "regional",
            tlsTruststoreUri: 's3://test_bucket/test_key',
            tlsTruststoreVersion: "test-version"
        }));
        await new S3Wrapper().assertTlsCertObjectExists(dc);

        const expectedParams = {
            Bucket: 'test_bucket',
            Key: 'test_key'
        }
        const commandCalls = S3Mock.commandCalls(HeadObjectCommand, expectedParams);
        expect(commandCalls.length).to.equal(1);
    });

    it("Assert TlS cert object exists failure", async () => {
        const S3Mock = mockClient(S3Client);
        S3Mock.on(HeadObjectCommand).rejects();

        const dc = new DomainConfig(getDomainConfig({
            domainName: "test_domain",
        }));

        let errored = false;
        try {
            await new S3Wrapper().assertTlsCertObjectExists(dc);
        } catch (err) {
            errored = true;
            expect(err.message).to.contains("Invalid URL");
        }
        expect(errored).to.equal(true);

        dc.tlsTruststoreUri = "s3://test_bucket/test_key"
        errored = false;
        try {
            await new S3Wrapper().assertTlsCertObjectExists(dc);
        } catch (err) {
            errored = true;
            expect(err.message).to.contains("Could not head S3 object at");
        }
        expect(errored).to.equal(true);
    });

    it("Assert TlS cert object exists forbidden", async () => {
        const S3Mock = mockClient(S3Client);
        S3Mock.on(HeadObjectCommand).rejects({
            "$metadata": {httpStatusCode: 403}
        });

        const dc = new DomainConfig(getDomainConfig({
            domainName: "test_domain",
            endpointType: Globals.endpointTypes.regional,
            tlsTruststoreUri: 's3://test_bucket/test_key',
        }));

        let errored = false;
        try {
            await new S3Wrapper().assertTlsCertObjectExists(dc);
        } catch (err) {
            errored = true;
        }
        expect(errored).to.equal(false);
        expect(consoleOutput[0]).to.contains("Forbidden to check the existence of the S3 object");
    });
});

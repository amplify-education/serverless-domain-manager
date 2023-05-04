import {consoleOutput, expect} from "../base";
import Globals from "../../../src/globals";
import CloudFormationWrapper = require("../../../src/aws/cloud-formation-wrapper");
import {mockClient} from "aws-sdk-client-mock";
import {
    CloudFormationClient,
    DescribeStackResourceCommand, DescribeStacksCommand,
    ListExportsCommand, ListExportsCommandOutput,
    ResourceStatus, StackStatus
} from "@aws-sdk/client-cloudformation";

describe("Cloud Formation wrapper checks", () => {
    beforeEach(() => {
        consoleOutput.length = 0;
    });

    afterEach(() => {
        Globals.serverless.service.provider.apiGateway.restApiId = null;
        Globals.serverless.service.provider.apiGateway.websocketApiId = null;
    });

    it("Initialization", async () => {
        const cloudFormationWrapper = new CloudFormationWrapper();
        const actualResult = await cloudFormationWrapper.cloudFormation.config.region();
        expect(actualResult).to.equal(Globals.nodeRegion);
        expect(cloudFormationWrapper.stackName).to.equal(Globals.serverless.service.provider.stackName);
    });

    it("findApiId for the rest api type in the sls config", async () => {

        Globals.serverless.service.provider.apiGateway.restApiId = "test_api_id";

        const actualResult = await new CloudFormationWrapper().findApiId(Globals.apiTypes.rest)
        expect(actualResult).to.equal(Globals.serverless.service.provider.apiGateway.restApiId);
    });

    it("findApiId for the rest api type via Fn::ImportValue", async () => {
        const fnImportValue = "test-value";
        const CloudFormationMock = mockClient(CloudFormationClient);
        CloudFormationMock.on(ListExportsCommand).resolves({
            Exports: [
                {Name: "test-name", Value: fnImportValue},
                {Name: "dummy-name", Value: "dummy-value"},
            ]
        });

        const cloudFormationWrapper = new CloudFormationWrapper();
        Globals.serverless.service.provider.apiGateway.restApiId = {
            [Globals.CFFuncNames.fnImport]: "test-name"
        };

        const actualResult = await cloudFormationWrapper.findApiId(Globals.apiTypes.rest)
        expect(actualResult).to.equal(fnImportValue);

        const expectedParams = {};
        const commandCalls = CloudFormationMock.commandCalls(ListExportsCommand, expectedParams, true);
        expect(commandCalls.length).to.equal(1);
    });

    it("findApiId for the rest api type via Fn::ImportValue not found", async () => {
        const fnImportValue = "test-value";
        const CloudFormationMock = mockClient(CloudFormationClient);
        CloudFormationMock.on(ListExportsCommand).resolves({
            Exports: [
                {Name: "test-name", Value: fnImportValue},
                {Name: "dummy-name", Value: "dummy-value"},
            ]
        });

        Globals.serverless.service.provider.apiGateway.restApiId = {
            [Globals.CFFuncNames.fnImport]: "not-existing-name"
        };

        let errored = false;
        try {
            await new CloudFormationWrapper().findApiId(Globals.apiTypes.rest);
        } catch (err) {
            errored = true;
            expect(err.message).to.contains("Failed to find a stack");
        }
        expect(errored).to.equal(true);

        const expectedParams = {};
        const commandCalls = CloudFormationMock.commandCalls(ListExportsCommand, expectedParams, true);
        expect(commandCalls.length).to.equal(1);
    });

    it("findApiId for the rest api type via Ref", async () => {
        const physicalResourceId = "test_rest_api_id";
        const fnRefName = "test-name";
        const CloudFormationMock = mockClient(CloudFormationClient);
        CloudFormationMock.on(DescribeStackResourceCommand).resolves({
            StackResourceDetail: {
                LogicalResourceId: fnRefName,
                PhysicalResourceId: physicalResourceId,
                ResourceType: "",
                LastUpdatedTimestamp: null,
                ResourceStatus: ResourceStatus.CREATE_COMPLETE,
            },
        });

        const cloudFormationWrapper = new CloudFormationWrapper();
        Globals.serverless.service.provider.apiGateway.restApiId = {
            [Globals.CFFuncNames.ref]: fnRefName
        };

        const actualResult = await cloudFormationWrapper.findApiId(Globals.apiTypes.rest)
        expect(actualResult).to.equal(physicalResourceId);

        const expectedParams = {
            LogicalResourceId: fnRefName,
            StackName: Globals.serverless.service.provider.stackName,
        };
        const commandCalls = CloudFormationMock.commandCalls(DescribeStackResourceCommand, expectedParams, true);
        expect(commandCalls.length).to.equal(1);
    });

    it("findApiId for the rest api type via Ref not found", async () => {
        const fnRefName = "not-existing-name";
        const CloudFormationMock = mockClient(CloudFormationClient);
        CloudFormationMock.on(DescribeStackResourceCommand).resolves(null);

        Globals.serverless.service.provider.apiGateway.restApiId = {
            [Globals.CFFuncNames.ref]: fnRefName
        };

        let errored = false;
        try {
            await new CloudFormationWrapper().findApiId(Globals.apiTypes.rest);
        } catch (err) {
            errored = true;
            expect(err.message).to.contains("Failed to find a stack");
        }
        expect(errored).to.equal(true);

        const expectedParams = {
            LogicalResourceId: fnRefName,
            StackName: Globals.serverless.service.provider.stackName,
        };
        const commandCalls = CloudFormationMock.commandCalls(DescribeStackResourceCommand, expectedParams, true);
        expect(commandCalls.length).to.equal(1);
    });

    it("findApiId for the rest api type via not supported func", async () => {
        const CloudFormationMock = mockClient(CloudFormationClient);
        CloudFormationMock.on(DescribeStackResourceCommand).resolves(null);

        Globals.serverless.service.provider.apiGateway.restApiId = {
            "unsupported-func-name": "test-value"
        };

        let errored = false;
        try {
            await new CloudFormationWrapper().findApiId(Globals.apiTypes.rest);
        } catch (err) {
            errored = true;
            expect(err.message).to.contains("Failed to find a stack");
        }
        expect(errored).to.equal(true);
        expect(consoleOutput[0]).to.contains("Unsupported apiGateway");

        const expectedParams = {
            LogicalResourceId: Globals.CFResourceIds[Globals.apiTypes.rest],
            StackName: Globals.serverless.service.provider.stackName,
        };
        const commandCalls = CloudFormationMock.commandCalls(DescribeStackResourceCommand, expectedParams, true);
        expect(commandCalls.length).to.equal(1);
    });

    it("findApiId for the rest api type", async () => {
        const physicalResourceId = "test_rest_api_id";
        const CloudFormationMock = mockClient(CloudFormationClient);
        CloudFormationMock.on(DescribeStackResourceCommand).resolves({
            StackResourceDetail: {
                LogicalResourceId: "ApiGatewayRestApi",
                PhysicalResourceId: physicalResourceId,
                ResourceType: "",
                LastUpdatedTimestamp: null,
                ResourceStatus: ResourceStatus.CREATE_COMPLETE,
            },
        });

        const cloudFormationWrapper = new CloudFormationWrapper();
        const actualResult = await cloudFormationWrapper.findApiId(Globals.apiTypes.rest)
        expect(actualResult).to.equal(physicalResourceId);

        const expectedParams = {
            LogicalResourceId: Globals.CFResourceIds[Globals.apiTypes.rest],
            StackName: Globals.serverless.service.provider.stackName,
        };
        const commandCalls = CloudFormationMock.commandCalls(DescribeStackResourceCommand, expectedParams, true);
        expect(commandCalls.length).to.equal(1);
    });

    it("findApiId for the rest api type failure", async () => {
        const CloudFormationMock = mockClient(CloudFormationClient);
        CloudFormationMock.on(DescribeStackResourceCommand).resolves({
            StackResourceDetail: {
                LogicalResourceId: Globals.CFResourceIds[Globals.apiTypes.rest],
                PhysicalResourceId: null,
                ResourceType: "",
                LastUpdatedTimestamp: null,
                ResourceStatus: ResourceStatus.CREATE_COMPLETE,
            },
        });

        let errored = false;
        try {
            await new CloudFormationWrapper().findApiId(Globals.apiTypes.rest);
        } catch (err) {
            errored = true;
            expect(err.message).to.contains("No ApiId associated with CloudFormation stack");
        }
        expect(errored).to.equal(true);
    });

    it("findApiId for the rest api type with nested stacks", async () => {
        const physicalResourceId = "test_rest_api_id";
        const nestedStackName = "custom-stage-name-NestedStackTwo-U89W84TQIHJK";
        const CloudFormationMock = mockClient(CloudFormationClient);
        CloudFormationMock.on(DescribeStackResourceCommand).rejectsOnce()
            .resolves({
                StackResourceDetail: {
                    LogicalResourceId: Globals.CFResourceIds[Globals.apiTypes.rest],
                    PhysicalResourceId: physicalResourceId,
                    ResourceType: "",
                    LastUpdatedTimestamp: null,
                    ResourceStatus: ResourceStatus.CREATE_COMPLETE,
                },
            });
        CloudFormationMock.on(DescribeStacksCommand).resolves({
            Stacks: [
                {
                    StackName: "custom-stage-name-NestedStackOne-U89W84TQIHJK",
                    RootId: "arn:aws:cloudformation:us-east-1:000000000000:stack/dummy-name/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                    CreationTime: null,
                    StackStatus: StackStatus.CREATE_COMPLETE
                },
                {
                    StackName: nestedStackName,
                    RootId: `arn:aws:cloudformation:us-east-1:000000000000:stack/${Globals.serverless.service.provider.stackName}/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`,
                    CreationTime: null,
                    StackStatus: StackStatus.CREATE_COMPLETE
                },
                {
                    StackName: "outside-stack-NestedStackZERO-U89W84TQIHJK",
                    RootId: null,
                    CreationTime: null,
                    StackStatus: StackStatus.CREATE_COMPLETE
                },
            ],
        });

        const actualResult = await new CloudFormationWrapper().findApiId(Globals.apiTypes.rest)
        expect(actualResult).to.equal(physicalResourceId);

        const expectedParams = {
            LogicalResourceId: Globals.CFResourceIds[Globals.apiTypes.rest],
            StackName: nestedStackName,
        };

        const commandCalls = CloudFormationMock.commandCalls(DescribeStackResourceCommand, expectedParams, true);
        expect(commandCalls.length).to.equal(1);

        const allCommandCalls = CloudFormationMock.commandCalls(DescribeStackResourceCommand);
        expect(allCommandCalls.length).to.equal(2);
    });

    it("findApiId for the rest api type with nested stacks failure", async () => {
        const nestedStackName = "custom-stage-name-NestedStackTwo-U89W84TQIHJK";
        const CloudFormationMock = mockClient(CloudFormationClient);
        CloudFormationMock.on(DescribeStackResourceCommand).rejects();
        CloudFormationMock.on(DescribeStacksCommand).resolves({
            Stacks: [
                {
                    StackName: "custom-stage-name-NestedStackOne-U89W84TQIHJK",
                    RootId: "arn:aws:cloudformation:us-east-1:000000000000:stack/dummy-name/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                    CreationTime: null,
                    StackStatus: StackStatus.CREATE_COMPLETE
                },
                {
                    StackName: nestedStackName,
                    RootId: `arn:aws:cloudformation:us-east-1:000000000000:stack/${Globals.serverless.service.provider.stackName}/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`,
                    CreationTime: null,
                    StackStatus: StackStatus.CREATE_COMPLETE
                }
            ],
        });

        let errored = false;
        try {
            await new CloudFormationWrapper().findApiId(Globals.apiTypes.rest);
        } catch (err) {
            errored = true;
            expect(err.message).to.contains("Failed to find a stack");
        }
        expect(errored).to.equal(true);
        expect(consoleOutput[0]).to.contains("[WARNING] Failed to find CloudFormation resources with an error");
    });
});

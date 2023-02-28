/**
 * Wrapper class for AWS CloudFormation provider
 */

import Globals from "../globals";
import Logging from "../logging";
import {
    CloudFormationClient,
    DescribeStackResourceCommand,
    DescribeStackResourceCommandOutput,
    DescribeStacksCommand,
    DescribeStacksCommandOutput,
    ListExportsCommand,
    ListExportsCommandOutput
} from "@aws-sdk/client-cloudformation";

class CloudFormationWrapper {
    public cloudFormation: CloudFormationClient;
    public stackName: string;

    constructor(credentials: any) {
        this.cloudFormation = new CloudFormationClient(credentials);
        this.stackName = Globals.serverless.service.provider.stackName ||
            `${Globals.serverless.service.service}-${Globals.getBaseStage()}`;
    }

    /**
     * Get an API id from the existing config or CloudFormation stack resources or outputs
     */
    public async findApiId(apiType: string): Promise<string> {
        const configApiId = await this.getConfigId(apiType);
        if (configApiId) {
            return configApiId;
        }

        return await this.getStackApiId(apiType);
    }

    /**
     * Get an API id from the existing config or CloudFormation stack based on provider.apiGateway params
     */
    public async getConfigId(apiType: string): Promise<string | null> {
        const apiGateway = Globals.serverless.service.provider.apiGateway || {};
        const apiIdKey = Globals.gatewayAPIIdKeys[apiType];
        const apiGatewayValue = apiGateway[apiIdKey];

        if (apiGatewayValue) {
            if (typeof apiGatewayValue === "string") {
                return apiGatewayValue;
            }

            return await this.getCloudformationId(apiGatewayValue, apiType);
        }

        return null;
    }

    public async getCloudformationId(apiGatewayValue: object, apiType: string): Promise<string | null> {
        // in case object and Fn::ImportValue try to get API id from the CloudFormation outputs
        const importName = apiGatewayValue[Globals.CFFuncNames.fnImport];
        if (importName) {
            const importValues = await this.getImportValues([importName]);
            const nameValue = importValues[importName];
            if (!nameValue) {
                Logging.logWarning(`CloudFormation ImportValue '${importName}' not found in the outputs`);
            }
            return nameValue;
        }

        const ref = apiGatewayValue[Globals.CFFuncNames.ref];
        if (ref) {
            try {
                return await this.getStackApiId(apiType, ref);
            } catch (error) {
                Logging.logWarning(`Unable to get ref ${ref} value.\n ${error.message}`);
                return null;
            }
        }

        // log warning not supported restApiId
        Logging.logWarning(`Unsupported apiGateway.${apiType} object`);

        return null;
    }

    /**
     * Gets rest API id from CloudFormation stack or nested stack
     */
    public async getStackApiId(apiType: string, logicalResourceId: string = null): Promise<string> {
        if (!logicalResourceId) {
            logicalResourceId = Globals.CFResourceIds[apiType];
        }

        let response;
        try {
            // trying to get information for specified stack name
            response = await this.getStack(logicalResourceId, this.stackName);
        } catch {
            // in case error trying to get information from some of nested stacks
            response = await this.getNestedStack(logicalResourceId, this.stackName);
        }

        if (!response) {
            throw new Error(`Failed to find a stack ${this.stackName}\n`);
        }

        const apiId = response.StackResourceDetail.PhysicalResourceId;
        if (!apiId) {
            throw new Error(`No ApiId associated with CloudFormation stack ${this.stackName}`);
        }

        return apiId;
    }

    /**
     * Gets values by names from cloudformation exports
     */
    public async getImportValues(names: string[]): Promise<any> {
        const response: ListExportsCommandOutput = await this.cloudFormation.send(
            new ListExportsCommand({})
        );
        const exports = response.Exports || []
        // filter Exports by names which we need
        const filteredExports = exports.filter((item) => names.indexOf(item.Name) !== -1);
        // converting a list of unique values to dict
        // [{Name: "export-name", Value: "export-value"}, ...] - > {"export-name": "export-value"}
        return filteredExports.reduce((prev, current) => ({...prev, [current.Name]: current.Value}), {});
    }

    /**
     * Returns a description of the specified resource in the specified stack.
     */
    public async getStack(logicalResourceId: string, stackName: string): Promise<DescribeStackResourceCommandOutput> {
        try {
            return await this.cloudFormation.send(
                new DescribeStackResourceCommand({
                    LogicalResourceId: logicalResourceId,
                    StackName: stackName,
                })
            );
        } catch (err) {
            throw new Error(`Failed to find CloudFormation resources with an error: ${err.message}\n`);
        }
    }

    /**
     * Returns a description of the specified resource in the specified nested stack.
     */
    public async getNestedStack(logicalResourceId: string, stackName?: string) {
        // get all stacks from the CloudFormation
        const response: DescribeStacksCommandOutput = await this.cloudFormation.send(
            new DescribeStacksCommand({})
        );
        const stacks = response.Stacks || [];

        // filter stacks by given stackName and check by nested stack RootId
        const regex = new RegExp("/" + stackName + "/");
        const filteredStackNames = stacks
            .reduce((acc, stack) => {
                if (!stack.RootId) {
                    return acc;
                }
                const match = stack.RootId.match(regex);
                if (match) {
                    acc.push(stack.StackName);
                }
                return acc;
            }, []);

        for (const name of filteredStackNames) {
            try {
                // stop the loop and return the stack details in case the first one found
                // in case of error continue the looping
                return await this.getStack(logicalResourceId, name);
            } catch (err) {
                Logging.logWarning(err.message);
            }
        }
        return null;
    }
}

export = CloudFormationWrapper;

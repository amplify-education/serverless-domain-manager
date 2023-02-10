/**
 * Wrapper class for AWS CloudFormation provider
 */

import {CloudFormation} from "aws-sdk";
import Globals from "../globals";
import {getAWSPagedResults, throttledCall} from "../utils";
import DomainConfig = require("../models/domain-config");

class CloudFormationWrapper {
    public cloudFormation: CloudFormation;
    public stackName: string;

    constructor(credentials: any) {
        const slsService = Globals.serverless.service;

        this.cloudFormation = new CloudFormation(credentials);
        this.stackName = slsService.provider.stackName || `${Globals.options.stage || slsService.provider.stage}`;
    }

    /**
     * Get an API id from the existing config or CloudFormation stack resources or outputs
     */
    public async findApiId(domain: DomainConfig): Promise<string> {
        const configApiId = this.getConfigId(domain.apiType);
        if (configApiId) {
            console.log("getConfigId: ", configApiId);
            return configApiId;
        }

        return await this.getStackApiId(domain.apiType);
    }

    /**
     * Get an API id from the existing config or CloudFormation stack based on provider.apiGateway params
     */
    public async getConfigId(apiType: string): Promise<string | null> {
        const apiGateway = Globals.serverless.service.provider.apiGateway || {};
        const apiIdKey = Globals.gatewayAPIIdKeys[apiType];
        let apiGatewayValue = apiGateway[apiIdKey];

        console.log(apiGatewayValue);

        if (apiGatewayValue) {
            if (typeof apiGatewayValue === "string") {
                // check if the string is a short intrinsic function reference
                // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference.html
                const splittedValue = apiGatewayValue.split(" ", 2);
                if (splittedValue.length === 1) {
                    Globals.logInfo(`Mapping custom domain to existing API '${apiGatewayValue}'.`);
                    return apiGatewayValue;
                }

                apiGatewayValue = {
                    [apiGatewayValue[0]]: apiGatewayValue[1]
                }
            }

            return await this.getCloudformationId(apiGatewayValue, apiType)
        }

        return null;
    }

    public async getCloudformationId(apiGatewayValue: object, apiType: string): Promise<string | null> {
        // in case object and Fn::ImportValue try to get API id from the CloudFormation outputs
        const importName = apiGatewayValue["Fn::ImportValue"];
        if (importName) {
            const importValues = await this.getImportValues([importName]);
            if (!importValues[importName]) {
                Globals.logWarning(`CloudFormation ImportValue '${importName}' not found in the outputs`);
            }
            return importValues[importName];
        }

        const ref = apiGatewayValue["Ref"] || apiGatewayValue["!Ref"];
        if (ref) {
            try {
                return this.getStackApiId(apiType, ref);
            } catch (error) {
                Globals.logWarning(`Unable to get ref ${ref} value.\n ${error.message}`);
                return null;
            }
        }

        // log warning not supported restApiId
        Globals.logWarning(`Unsupported apiGateway.${apiType} object`);

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
        const exports = await getAWSPagedResults(
            this.cloudFormation,
            "listExports",
            "Exports",
            "NextToken",
            "NextToken",
            {},
        );

        // filter Exports by names which we need
        const filteredExports = exports.filter((item) => names.indexOf(item.Name) !== -1);
        // converting a list of unique values to dict
        // [{Name: "export-name", Value: "export-value"}, ...] - > {"export-name": "export-value"}
        return filteredExports.reduce((prev, current) => ({...prev, [current.Name]: current.Value}), {});
    }

    /**
     * Returns a description of the specified resource in the specified stack.
     */
    public async getStack(logicalResourceId: string, stackName: string) {
        try {
            return await throttledCall(this.cloudFormation, "describeStackResource", {
                LogicalResourceId: logicalResourceId,
                StackName: stackName,
            });
        } catch (err) {
            throw new Error(`Failed to find CloudFormation resources with an error: ${err.message}\n`);
        }
    }

    /**
     * Returns a description of the specified resource in the specified nested stack.
     */
    public async getNestedStack(logicalResourceId: string, stackName?: string) {
        // get all stacks from the CloudFormation
        const stacks = await getAWSPagedResults(
            this.cloudFormation,
            "describeStacks",
            "Stacks",
            "NextToken",
            "NextToken",
            {},
        );

        // filter stacks by given stackName and check by nested stack RootId
        const regex = new RegExp(`\/${stackName}\/`);
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

        let response;
        for (const name of filteredStackNames) {
            try {
                response = await this.getStack(logicalResourceId, name);
                break;
            } catch (err) {
                Globals.logWarning(err);
            }
        }
        return response;
    }
}

export = CloudFormationWrapper;

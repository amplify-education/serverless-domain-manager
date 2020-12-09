/**
 * Wrapper class for AWS CloudFormation provider
 */

import {CloudFormation, HTTPOptions} from "aws-sdk";
import DomainConfig = require("../DomainConfig");
import Globals from "../Globals";
import {getAWSPagedResults, throttledCall} from "../utils";

class CloudFormationWrapper {
    public cloudFormation: CloudFormation;

    constructor(credentials: any, httpOptions: HTTPOptions) {
        this.cloudFormation = new CloudFormation({credentials, httpOptions});
    }

    /**
     * Gets rest API id from CloudFormation stack or nested stack
     */
    public async getApiId(domain: DomainConfig, stackName: string): Promise<string> {
        let logicalResourceId = "ApiGatewayRestApi";
        if (domain.apiType === Globals.apiTypes.http) {
            logicalResourceId = "HttpApi";
        }
        if (domain.apiType === Globals.apiTypes.websocket) {
            logicalResourceId = "WebsocketsApi";
        }

        let response;
        try {
            // trying to get information for specified stack name
            response = await this.getStack(logicalResourceId, stackName);
        } catch {
            // in case error trying to get information from the some of nested stacks
            response = await this.getNestedStack(logicalResourceId, stackName);
        }

        if (!response) {
            throw new Error(`Failed to find a stack ${stackName}\n`);
        }

        const apiId = response.StackResourceDetail.PhysicalResourceId;
        if (!apiId) {
            throw new Error(`No ApiId associated with CloudFormation stack ${stackName}`);
        }

        Globals.logInfo(`Found apiId: ${apiId} for ${domain.givenDomainName}`);

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
            throw new Error(`Failed to find CloudFormation resources with an error: ${err}\n`);
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

        // filter stacks by given stackName
        const filteredStackNames = stacks
            .map((stack) => stack.StackName) // collect list of stack names
            .filter((name) => name.includes(stackName)); // filter by stackName

        let response;
        for (const name of filteredStackNames) {
            try {
                response = await this.getStack(logicalResourceId, name);
                break;
            } catch (err) {
                Globals.logError(err);
            }
        }
        return response;
    }
}

export = CloudFormationWrapper;

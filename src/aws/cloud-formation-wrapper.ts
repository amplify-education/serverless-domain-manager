/**
 * Wrapper class for AWS CloudFormation provider
 */

import {CloudFormation} from "aws-sdk";
import DomainConfig = require("../DomainConfig");
import Globals from "../Globals";
import {getAWSPagedResults, throttledCall} from "../utils";

class CloudFormationWrapper {
    private readonly provider: CloudFormation;

    constructor(credentials: any) {
        this.provider = new CloudFormation(credentials);
    }

    /**
     * Gets rest API id from CloudFormation stack
     */
    public async getApiId(domain: DomainConfig, stackName: string): Promise<string> {
        let LogicalResourceId = "ApiGatewayRestApi";
        if (domain.apiType === Globals.apiTypes.http) {
            LogicalResourceId = "HttpApi";
        }
        if (domain.apiType === Globals.apiTypes.websocket) {
            LogicalResourceId = "WebsocketsApi";
        }

        const params = {
            LogicalResourceId,
            StackName: stackName,
        };

        let response;
        try {
            response = await throttledCall(this.provider, "describeStackResource", params);
        } catch (err) {
            throw new Error(`Failed to find CloudFormation resources with an error: ${err}\n`);
        }

        const apiId = response.StackResourceDetail.PhysicalResourceId;
        if (!apiId) {
            throw new Error(`No ApiId associated with CloudFormation stack ${stackName}`);
        }
        return apiId;
    }

    /**
     * Gets values by names from cloudformation exports
     */
    public async getImportValues(names: string[]): Promise<any> {
        const exports = await getAWSPagedResults(
            this.provider,
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
}

export = CloudFormationWrapper;

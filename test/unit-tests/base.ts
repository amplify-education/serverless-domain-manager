import "mocha";
import chai = require("chai");
import spies = require("chai-spies");
import Globals from "../../src/globals";
import {ServerlessOptions, ServerlessUtils} from "../../src/types";
import ServerlessCustomDomain = require("../../src");

chai.use(spies);

const expect = chai.expect;
const chaiSpy = chai.spy;
const consoleOutput = [];
const getDomainConfig = (customDomainOptions) => {
    return {
        allowPathMatching: customDomainOptions.allowPathMatching,
        apiType: customDomainOptions.apiType,
        autoDomain: customDomainOptions.autoDomain,
        autoDomainWaitFor: customDomainOptions.autoDomainWaitFor,
        basePath: customDomainOptions.basePath,
        certificateArn: customDomainOptions.certificateArn,
        certificateName: customDomainOptions.certificateName,
        createRoute53Record: customDomainOptions.createRoute53Record,
        createRoute53IPv6Record: customDomainOptions.createRoute53IPv6Record,
        domainName: customDomainOptions.domainName,
        enabled: customDomainOptions.enabled,
        endpointType: customDomainOptions.endpointType,
        tlsTruststoreUri: customDomainOptions.tlsTruststoreUri,
        tlsTruststoreVersion: customDomainOptions.tlsTruststoreVersion,
        hostedZoneId: customDomainOptions.hostedZoneId,
        hostedZonePrivate: customDomainOptions.hostedZonePrivate,
        splitHorizonDns: customDomainOptions.splitHorizonDns,
        route53Profile: customDomainOptions.route53Profile,
        route53Region: customDomainOptions.route53Region,
        preserveExternalPathMappings: customDomainOptions.preserveExternalPathMappings,
        securityPolicy: customDomainOptions.securityPolicy,
        stage: customDomainOptions.stage,
        route53Params: customDomainOptions.route53Params
    }
}
const constructPlugin = (domainConfig, options?: ServerlessOptions, v3Utils?: ServerlessUtils) => {
    const isMultiple = Array.isArray(domainConfig);
    const serverless = {
        cli: {
            log(str: string) {
                consoleOutput.push(str);
            }
        },
        providers: {
            aws: {
                getCredentials: () => null
            }
        },
        service: {
            custom: {
                customDomain: isMultiple ? undefined : domainConfig,
                customDomains: isMultiple ? domainConfig : undefined,
            },
            provider: {
                apiGateway: {
                    restApiId: null,
                    websocketApiId: null,
                },
                compiledCloudFormationTemplate: {
                    Outputs: null,
                },
                stackName: "custom-stage-name",
                stage: null,
                stackTags: {
                    test: "test"
                },
                tags: {
                    test2: "test2"
                }
            },
            service: "test",
        }
    };
    const defaultOptions = {
        stage: "test",
    };
    return new ServerlessCustomDomain(serverless, options || defaultOptions, v3Utils);
};
const getV3Utils = () => {
    return {
        writeText: (message: string) => {
            consoleOutput.push(message);
        },
        log: {
            error(message: string) {
                consoleOutput.push("V3 [Error] " + message);
            },
            verbose(message: string) {
                consoleOutput.push("V3 [Info] " + message);
            },
            warning(message: string) {
                consoleOutput.push("V3 [WARNING] " + message);
            }
        },
        progress: null
    }
}

Globals.currentRegion = "test_region";
Globals.options = {
    stage: "test"
};

// this is needed for running an individual test
constructPlugin(getDomainConfig({}));

export {
    expect,
    chaiSpy,
    consoleOutput,
    getDomainConfig,
    getV3Utils,
    constructPlugin,
}

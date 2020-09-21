export interface CustomDomain {
    domainName: string;
    basePath: string | undefined;
    stage: string | undefined;
    certificateName: string | undefined;
    certificateArn: string | undefined;
    createRoute53Record: boolean | undefined;
    endpointType: string | undefined;
    apiType: string | undefined;
    hostedZoneId: string | undefined;
    hostedZonePrivate: boolean | undefined;
    enabled: boolean | string | undefined;
    securityPolicy: string | undefined;
    autoDomain: boolean | undefined;
    autoDomainWaitFor: string | undefined;
    allowPathMatching: boolean | undefined;
}

export interface ServerlessInstance {
    service: {
        service: string
        provider: {
            stage: string
            stackName: string
            compiledCloudFormationTemplate: {
                Outputs: any,
            },
            apiGateway: {
                restApiId: string,
            },
        }
        custom: {
            customDomain?: CustomDomain | undefined,
            customDomains?: CustomDomain[] | undefined,
        },
    };
    providers: {
        aws: {
            sdk: {
                APIGateway: any,
                ApiGatewayV2: any,
                Route53: any,
                CloudFormation: any,
                ACM: any,
                config: {
                    update(toUpdate: object): void,
                },
            }
            getCredentials(),
            getRegion(),
        },
    };
    cli: {
        log(str: string, entity?: string),
        consoleLog(str: any),
    };
}

export interface ServerlessOptions {
    stage: string;
}

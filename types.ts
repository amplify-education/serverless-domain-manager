export interface ServerlessInstance { // tslint:disable-line
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
            customDomain: {
                domainName: string,
                basePath: string | undefined,
                stage: string | undefined,
                certificateName: string | undefined,
                certificateArn: string | undefined,
                createRoute53Record: boolean | undefined,
                endpointType: string | undefined,
                hostedZoneId: string | undefined,
                hostedZonePrivate: boolean | undefined,
                enabled: boolean | string | undefined,
                securityPolicy: string | undefined,
            },
        },
    };
    providers: {
        aws: {
            sdk: {
                APIGateway: any,
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

export interface ServerlessOptions { // tslint:disable-line
    stage: string;
}

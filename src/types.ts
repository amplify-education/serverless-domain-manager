
export interface Route53Params {
    routingPolicy: "simple" | "latency" | "weighted" | undefined;
    weight: number | undefined;
    setIdentifier: string | undefined;
    healthCheckId: string | undefined;
}

export interface CustomDomain {
    domainName: string;
    basePath: string | undefined;
    stage: string | undefined;
    certificateName: string | undefined;
    certificateArn: string | undefined;
    createRoute53Record: boolean | undefined;
    createRoute53IPv6Record: boolean | undefined;
    route53Profile: string | undefined;
    route53Region: string | undefined;
    endpointType: string | undefined;
    apiType: string | undefined;
    tlsTruststoreUri: string | undefined;
    tlsTruststoreVersion: string | undefined;
    hostedZoneId: string | undefined;
    hostedZonePrivate: boolean | undefined;
    splitHorizonDns: boolean | undefined;
    enabled: boolean | string | undefined;
    securityPolicy: string | undefined;
    autoDomain: boolean | undefined;
    autoDomainWaitFor: string | undefined;
    allowPathMatching: boolean | undefined;
    route53Params: Route53Params | undefined;
    preserveExternalPathMappings: boolean | undefined;
}

export interface Tags {
    [key: string]: string;
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
                websocketApiId: string,
            },
            tags: Tags,
            stackTags: Tags,
        }
        custom: {
            customDomain?: CustomDomain,
            customDomains?: CustomDomain[],
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
                S3: any,
                config: {
                    httpOptions: any,
                    update(toUpdate: object): void,
                },
                SharedIniFileCredentials: any,
            }
            getCredentials(),
            getRegion(),
        },
    };
    cli: {
        log(str: string, entity?: string),
        consoleLog(str: any),
    };

    addServiceOutputSection?(name: string, data: string[]);
}

export interface ServerlessOptions { // tslint:disable-line
    stage: string;
}

interface ServerlessProgress {
    update(message: string): void

    remove(): void
}

export interface ServerlessProgressFactory {
    get(name: string): ServerlessProgress;
}

export interface ServerlessUtils {
    writeText: (message: string) => void,
    log: ((message: string) => void) & {
        error(message: string): void
        verbose(message: string): void
        warning(message: string): void
    }
    progress: ServerlessProgressFactory
}

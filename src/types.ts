import {HTTPOptions} from "aws-sdk";

export interface CustomDomain { // tslint:disable-line
    domainName: string;
    basePath: string | undefined;
    stage: string | undefined;
    certificateName: string | undefined;
    certificateArn: string | undefined;
    createRoute53Record: boolean | undefined;
    route53Profile: string | undefined;
    route53Region: string | undefined;
    endpointType: string | undefined;
    apiType: string | undefined;
    hostedZoneId: string | undefined;
    hostedZonePrivate: boolean | undefined;
    enabled: boolean | string | undefined;
    securityPolicy: string | undefined;
    autoDomain: boolean | undefined;
    autoDomainWaitFor: string | undefined;
    allowPathMatching: boolean | undefined;
    route53Params: Route53Params | undefined;
    preserveExternalPathMappings: boolean | undefined;
}

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
                websocketApiId: string,
            },
            tags: Tags,
            stackTags: Tags,
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
                    httpOptions: HTTPOptions,
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
    log: ((message: string) => void) & {
        error(message: string): void
        verbose(message: string): void
        warning(message: string): void
    }
    progress: ServerlessProgressFactory
}


export interface Route53Params {
    routingPolicy: 'simple' | 'latency' | 'weighted' | undefined;
    weight: number | undefined;
    setIdentifier: string | undefined;
    healthCheckId: string | undefined;
}

export interface Tags {
    [key: string]: string;
}

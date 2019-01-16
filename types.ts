export interface ServerlessInstance {
    service: {
        service: string
        provider: {
            stage: string
            stackName: string
            compiledCloudFormationTemplate: {
                Outputs: any
            }
        }
        custom: {
            customDomain: {
                domainName: string
                basePath: string|undefined
                stage: string|undefined
                certificateName: string|undefined
                certificateArn: string|undefined
                createRoute53Record: boolean|undefined
                endpointType: string|undefined
                hostedZoneId: string|undefined
                hostedZonePrivate: string|undefined
                enabled: boolean|string|undefined

            }
        }
    }
    providers: {
        aws: {
            sdk: {
                APIGateway: any
                Route53: any
                CloudFormation: any
                ACM: any
            }
            getCredentials()
            getRegion()
        }
    }
    cli: {
        log(str: string)
        consoleLog(str: any)
    }
}

export interface ServerlessOptions {
    stage: string
}
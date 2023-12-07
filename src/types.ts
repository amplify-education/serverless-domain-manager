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
      region?: string
      profile?: string
      stackName: string
      compiledCloudFormationTemplate: {
        Outputs: any,
      },
      apiGateway: {
        restApiId: any,
        websocketApiId: any,
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
      getCredentials (),
    },
  };
  cli: {
    log (str: string, entity?: string)
  };

  addServiceOutputSection? (name: string, data: string[]);
}

export interface ServerlessOptions {
  stage: string;
  region?: string;
}

interface ServerlessProgress {
  update (message: string): void

  remove (): void
}

export interface ServerlessProgressFactory {
  get (name: string): ServerlessProgress;
}

export interface ServerlessUtils {
  writeText: (message: string) => void,
  log: {
    error (message: string): void
    verbose (message: string): void
    warning (message: string): void
  }
  progress: ServerlessProgressFactory
}

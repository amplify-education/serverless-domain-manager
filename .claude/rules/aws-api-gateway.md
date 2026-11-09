---
paths:
  - "src/**"
  - "test/**"
---

# AWS API Gateway facts

- There is **no `TLS_1_3` policy**. REST: `TLS_1_0`, `TLS_1_2`, `SecurityPolicy_*` (list = SDK `SecurityPolicy` enum in `@aws-sdk/client-api-gateway`). HTTP/WebSocket (V2): only `TLS_1_0`/`TLS_1_2`.
- `*_EDGE` policies are for EDGE endpoints only; other `SecurityPolicy_*` are for REGIONAL/PRIVATE. Every `SecurityPolicy_*` requires `endpointAccessMode` (`BASIC`/`STRICT`). See https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-security-policies-list.html
- Policy/mode changes take ~15 minutes; STRICT → BASIC makes the domain unavailable during that time. `/endpointAccessMode` can only be replaced, not removed.
- The REST API itself also has a security policy, but it is created by the Serverless Framework (CloudFormation) – not managed by this plugin.
- The V2 SDK has no `EndpointAccessMode`; V2 `UpdateDomainName` replaces the whole `DomainNameConfigurations` (risky).
- CloudFormation permissions used: `DescribeStackResource`, `DescribeStacks` (nested stacks), `ListExports` (`Fn::ImportValue`). Access denied (403) is rethrown instead of searching nested stacks (#641).
- Default security policy for new custom domains is `TLS_1_2` (`Globals.defaultSecurityPolicy`); `DomainConfig.securityPolicy` stays `undefined` unless configured, so the default never updates existing domains.

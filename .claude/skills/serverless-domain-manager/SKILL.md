---
name: serverless-domain-manager
description: Architecture, conventions, release process, AWS API Gateway facts and testing gotchas for the serverless-domain-manager plugin. Use when changing code, reviewing PRs or issues, updating dependencies, or preparing a release in this repository.
---

# serverless-domain-manager

Serverless Framework plugin (TypeScript, compiled to CommonJS in `dist/`) that creates API Gateway custom domains, Route 53 records and base path mappings through the AWS SDK v3 (not CloudFormation).

## Architecture

- `src/index.ts` – `ServerlessCustomDomain`. Every hook goes through `hookWrapper`: validate config → `initializeVariables` (builds `DomainConfig`s) → `initSLSCredentials` → `initAWSRegion` → `initAWSResources` (creates the wrapper clients) → lifecycle function.
  - Hooks: `before:deploy:deploy` → `createOrGetDomainForCfOutputs` (creates the domain only with `autoDomain`), `after:deploy:deploy` → `setupBasePathMappings`, `before:remove:remove` → `removeBasePathMappings`, `after:info:info`, `create_domain:create`, `delete_domain:delete`.
  - `getApiGateway(domain)`: REST → `APIGatewayV1Wrapper`; HTTP/WebSocket **and REST with a multi-level `basePath` (contains `/`)** → `APIGatewayV2Wrapper`. Anything only the V1 API supports (enhanced security policies, `endpointAccessMode`) is unavailable for multi-level base paths.
  - `updateDomainSecurity` runs in `createDomain` and `setupBasePathMappings`: updates an existing domain only for values that are configured (`securityPolicy` and/or `endpointAccessMode`) and differ.
  - `deleteDomain` removes Route 53 records **before** the domain (11.0.0+), so a failure can be re-run.
- `src/globals.ts` – static config and helpers: defaults (`defaultSecurityPolicy`, `defaultStage`, `defaultMaxRetries`, `maxRetriesLimit`), enums-as-objects (`apiTypes`, `endpointTypes`, `endpointAccessModes`), `getRetryStrategy`, `getMaxAttempts`, `getLegacyCredentials`, `hasSdkV3Config`.
- `src/models/domain-config.ts` – `DomainConfig`, parsed per domain. **Field pattern:** `this.x = DomainConfig._getX(config.x, ...dependencies)` with a static helper that normalizes, validates (throws for invalid config, `Logging.logWarning` for suspicious values) and returns. Keep dependency order explicit with a comment (e.g. `endpointAccessMode` before `securityPolicy`).
- `src/aws/*-wrapper.ts` – one class per AWS service. Errors are wrapped as `new Error("V1 - ...:\n${err.message}", { cause: err })` (`cause` is required by ESLint 10's `preserve-caught-error`, 11.0.0+).
- `src/logging.ts` – `Logging.logInfo/logWarning/logError`; uses `Globals.v3Utils` when present, else `serverless.cli.log`.

### Credentials (`initSLSCredentials`)
1. `--aws-profile` / `provider.profile` → `fromIni`.
2. osls v4 (`hasSdkV3Config`: provider has `getAwsSdkV3Config()`) → its `.credentials`. On osls v4 `getCredentials()` and `providers.aws.sdk` are throwing stubs.
3. Serverless v3 → `Globals.getLegacyCredentials()`: `getCredentials()` returns a wrapper `{ credentials: <AWS SDK v2 credentials> }` (or `{}`); it must be unwrapped to `{ accessKeyId, secretAccessKey, sessionToken }`, else SDK v3 fails with "Resolved credential object is not valid" (#683).
4. Otherwise `null` → AWS SDK v3 default chain.

### Retries
`SLS_DOMAIN_MANAGER_MAX_RETRIES` counts retries (attempts = retries + 1), default 4 retries, capped at 20; invalid values warn once and use the default. Backoff is linear: 500 ms + 3 s × attempt.

## AWS API Gateway facts
- There is **no `TLS_1_3` policy**. REST: `TLS_1_0`, `TLS_1_2`, `SecurityPolicy_*` (list = SDK `SecurityPolicy` enum in `@aws-sdk/client-api-gateway`). HTTP/WebSocket (V2): only `TLS_1_0`/`TLS_1_2`.
- `*_EDGE` policies are for EDGE endpoints only; other `SecurityPolicy_*` are for REGIONAL/PRIVATE. Every `SecurityPolicy_*` requires `endpointAccessMode` (`BASIC`/`STRICT`). See https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-security-policies-list.html
- Policy/mode changes take ~15 minutes; STRICT → BASIC makes the domain unavailable during that time. `/endpointAccessMode` can only be replaced, not removed.
- The REST API itself also has a security policy, but it is created by the Serverless Framework (CloudFormation) – not managed by this plugin.
- The V2 SDK has no `EndpointAccessMode`; V2 `UpdateDomainName` replaces the whole `DomainNameConfigurations` (risky).
- CloudFormation permissions used: `DescribeStackResource`, `DescribeStacks` (nested stacks), `ListExports` (`Fn::ImportValue`). Access denied (403) is rethrown instead of searching nested stacks (#641).
- Default security policy for new custom domains is `TLS_1_2` (`Globals.defaultSecurityPolicy`); `DomainConfig.securityPolicy` stays `undefined` unless configured, so the default never updates existing domains.

## Testing
- `npm test` = c8 + mocha + ts-node over `test/unit-tests/**/*.test.ts`; `npm run lint` covers `src` and `test/unit-tests` (`test/integration-tests` has known lint errors). Integration tests (`npm run integration-*`) need a real AWS account.
- `test/unit-tests/base.ts`: `constructPlugin(getDomainConfig({...}))`, `consoleOutput` collects logs. Mock AWS with `aws-sdk-client-mock`; inspect the client that sent a command via `commandCalls(Cmd)[0].thisValue.config.credentials()`.
- Stub module functions with `import utils = require("../../src/utils")` (a namespace import copies the exports).
- `SyntaxError: TypeScript import equals declaration is not supported in strip-only mode` on Node 25 means ts-node failed to compile the test file – type-check it to see the real error. Ad-hoc `tsc` on single files misses the project `lib` (`es2022`); use `npx tsc --noEmit -p tsconfig.json`.
- Newer `@smithy` (`@smithy/core` retry) waits out the backoff inside `refreshRetryTokenForRetry`; tests driving the retry strategy must pass zero delays (`getRetryStrategy(undefined, 0, 0)`).
- To prove a regression test, run it against the old source: `git stash push -- src`, run, `git stash pop`.
- AWS SDK response mocks: SDK enums (e.g. `securityPolicy`) need loosely typed fixtures (`Record<string, any>`).

## Dependencies
- Do not install `osls` at the repo root (drifts `@aws-sdk`/`@smithy`, breaks `tsc`); run it via `npx`.
- `proxy-agent` stays on v6: v7+/v8 is ESM-only and the build is CommonJS. `basic-ftp` (via proxy-agent) is pinned with an override `^6.2.5`; `diff` override `^9.0.0` (ts-node, mocha, sinon).
- Held back: TypeScript (typescript-eslint supports `<6.1`), `@types/node` matches the minimum Node. These caps live in `.github/renovate.json` (not the root: `files` publishes `*.json`), which also sets `:preserveSemverRanges` so Renovate doesn't pin a published library's ranges.
- ESM-only test deps (chai 6) load through `require()` of ESM, which needs Node 22.12+. Spy with `mock.method()` from `node:test` (no chai-spies).
- Integration-test plugins are referenced only from `serverless.yml` configs, not imports: `serverless-plugin-split-stacks` (`basepath-nested-stack`), `serverless-vpc-discovery` (`private-domain`, `vpcDiscovery:`).
- `serverless` devDependency is pinned to an exact version.
- AWS SDK clients drop response fields they don't know, so using a new AWS field (e.g. `endpointAccessMode`) needs an SDK version that models it; check `node_modules/@aws-sdk/<client>/dist-types/commands/*.d.ts`.

## Release process
- Merging to `main` with a changed `package.json` version auto-publishes to npm and tags `vX.Y.Z` (`.github/workflows/publish.yml`). Merges without a version change publish nothing – but the next release includes everything already on `main`, so merge release PRs before unrelated feature PRs.
- Branch `release/X.Y.Z`; commit subject `release/X.Y.Z`; PR title `Release X.Y.Z`, opened as draft; body sections: Included / Changes in this PR / Testing (state what was not verified, e.g. real-AWS checks). `Fixes #N` closes issues on merge.
- Contributor PRs are merged first, then a release PR bumps the version and adds the CHANGELOG entry.
- `npm version X.Y.Z --no-git-tag-version` updates `package.json` and the lockfile.
- CHANGELOG follows Keep a Changelog; sections used: `Possible Breaking Changes`, `Added`, `Fixed`, `Changed`. Credit pattern: `Thank you @user ([713](https://github.com/amplify-education/serverless-domain-manager/pull/713))`; issues link as `([683](.../issues/683))`. Keep entries to one concise line each; no README upgrade guides; CI-only changes (e.g. workflow renames) are not listed.
- CI: `.github/workflows/test.yml` (PRs, Node 22/24/26 from 11.0.0) runs `npm ci`, build, lint, test; actions are pinned to commit SHAs. Outside-contributor PRs need a maintainer to approve the workflow run.

## External
- The serverless.com plugin page (https://www.serverless.com/plugins/serverless-domain-manager) serves a stale README cached by Serverless Inc. (registry: `serverless/plugins`, only stores the GitHub URL); it cannot be fixed from this repo.
- `scripts/cloudformation/serverless-domain-manager-deploy-policy.yaml` is the documented least-privilege deploy policy; keep it in sync with the README IAM list.

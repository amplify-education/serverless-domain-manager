# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [6.2.1] - 2022-11-28

### Fixed
- Fixed hostedZonePrivate parameter is not honoured.

### Added
- Added node 18.x check 

## [6.2.0] - 2022-10-28

### Added
- Added support for split horizon dns support. Thank you @overbit ([518](https://github.com/amplify-education/serverless-domain-manager/pull/518))

## [6.1.0] - 2022-08-10

### Added
- Added support for mutual TLS authentication for regional APIs. Thank you @cjuega ([505](https://github.com/amplify-education/serverless-domain-manager/pull/505))

### Changed
- Dropped Node v12 support
- Fixed get paged result for listHostedZones
- Refactoring

## [6.0.4] - 2022-08-04

### Fixed
- Enabled `declaration` option in tsconfig.json. Thank you @estahn ([506](https://github.com/amplify-education/serverless-domain-manager/pull/506))
- Use uppercase consistently for endpoint type. Thank you @dnicolson ([511](https://github.com/amplify-education/serverless-domain-manager/pull/511))
- ACM permission. Thank you @kevinle-1 ([508](https://github.com/amplify-education/serverless-domain-manager/pull/508))
- Removed `peerDependencies`
- Replaced `-` with `\n` for the printing summary

## [6.0.3] - 2022-04-13

### Fixed
- Added AWS certificate check for expiry date before trying to use it. Thank you @tomsaleeba ([493](https://github.com/amplify-education/serverless-domain-manager/pull/493))

## [6.0.2] - 2022-02-11

### Fixed
- Fixed compiledCloudFormationTemplate output creation.

## [6.0.1] - 2022-02-07

### Fixed
- Fixed issue with printing a summary with empty summary list.

## [6.0.0] - 2022-02-03

### Changed
- Updated dependency to work with Serverless V3. Releasing a new major version in case there are any issues that weren't caught in our testing.
- Logging improvements

## [5.8.0] - 2022-01-27

### Added
- Added an option to disable IPv6. Thank you @davehensley ([365](https://github.com/amplify-education/serverless-domain-manager/pull/365))

## [5.7.0] - 2022-01-27

### Added
- Added tagging of apiGateway custom domain. Thank you @fdobrovolny ([328](https://github.com/amplify-education/serverless-domain-manager/pull/328))

### Changed
- Refactoring of the code

## [5.6.0] - 2022-01-26

### Added
- Added config option to avoid automatically deleting an APIGW domain when other base path mappings exist. Thank you @straticJeff ([389](https://github.com/amplify-education/serverless-domain-manager/pull/389))  

## [5.5.0] - 2022-01-24

### Added
- Added proxy support. Thank you @mscharp ([405](https://github.com/amplify-education/serverless-domain-manager/pull/405))
- Enabled dependabot

### Fixed
- Fixed issue with disabling createRoute53Record. Thank you @albinlundmark ([476](https://github.com/amplify-education/serverless-domain-manager/pull/476))

### Changed
- Cleaned up getRoute53HostedZoneId. Thatnk you @codyseibert ([261](https://github.com/amplify-education/serverless-domain-manager/pull/261))

## [5.4.1] - 2022-01-21

### Fixed
- Fixed route53 resource creation.

## [5.4.0] - 2022-01-20

### Added
- Added custom route53 profile options. Thank you @CodeVision ([393](https://github.com/amplify-education/serverless-domain-manager/pull/393))

## [5.3.2] - 2022-01-19

### Added
- Added logs for Serverless Framework v3. Thank you @medikoo ([448](https://github.com/amplify-education/serverless-domain-manager/pull/448))

## [5.3.1] - 2022-01-18

### Changed
- Updated output for `compiledCloudFormationTemplate`. Thank you @nalbion ([442](https://github.com/amplify-education/serverless-domain-manager/pull/442))

### Fixed
- Fixed Route53 creation for `create_domain` action.

## [5.3.0] - 2022-01-14

### Added
- Added support of Serverless version 3. Thank you @medikoo ([449](https://github.com/amplify-education/serverless-domain-manager/pull/449))

### Changed
- Integration test refactoring

## [5.2.0] - 2021-11-10

### Added
- Added support latency and weighted routing. Thank you @clintadams-sg ([#439](https://github.com/amplify-education/serverless-domain-manager/pull/439))

## [5.1.5] - 2021-08-03

### Changed
- Updated CHANGELOG.md and README files

## [5.1.4] - 2021-07-19

### Added
- Added error logging for getDomainName API fail. Thank you @adamrhunter ([#434](https://github.com/amplify-education/serverless-domain-manager/pull/434))

## [5.1.3] - 2021-07-19

### Fixed
- Fixed filtering of stacks by the given stackName and check by the nested stack RootId. Thank you @matteobattista ([#427](https://github.com/amplify-education/serverless-domain-manager/pull/427))

### Changed
- Refactoring. Packages updating 

## [5.1.2] - 2021-07-16

### Fixed
- Fixed package publishing

## [5.1.1] - 2021-07-16

### Added
- Registered serverless as peer dependency. Thank you @medikoo ([#424](https://github.com/amplify-education/serverless-domain-manager/pull/424))

### Changed
- Replaced Travis with Github Actions

## [5.1.0] - 2020-11-04

### Changed
- Disabled insensitive error logging for SLS_DEBUG off

### Fixed
- Fixed getting an api id for different types of the API gateway ([#366](https://github.com/amplify-education/serverless-domain-manager/issues/366))

## [5.0.0] - 2020-09-23

### Added
- Added support for Multiple domains. Thank you @ConradKurth ([#327](https://github.com/amplify-education/serverless-domain-manager/pull/327)). 
Support for multiple domains led to lots of refactoring. Releasing a new major version in case there are any issues that weren't caught in our testing.

## [4.2.3] - 2020-09-18

### Added
- Added support for using CloudFormation nested stacks. Thank you @Katafalkas ([#235](https://github.com/amplify-education/serverless-domain-manager/pull/235))

## [4.2.2] - 2020-09-16

### Changed
- Fix for package build. Thank you @michaelgmcd ([#382](https://github.com/amplify-education/serverless-domain-manager/pull/382))

## [4.2.1] - 2020-09-16

### Added
- Added support for using CloudFormation Fn::ImportValue. Thank you @sampsasaarela ([#220](https://github.com/amplify-education/serverless-domain-manager/pull/220))

## [4.2.0] - 2020-07-14

### Added
- Added support for automatically creating/destroying custom domains on deploy/remove via the autoDomain option. Thank you @bryan-hunter ([#356](https://github.com/amplify-education/serverless-domain-manager/pull/356))

## [4.1.1] - 2020-05-25

### Changed
- Fix support for TLS 1.0 regional domains which were broken in the 4.0.0 release. Discovered by @jufemaiz ([#348](https://github.com/amplify-education/serverless-domain-manager/pull/348))

## [4.1.0] - 2020-05-18

### Changed
- Fixed issue when there are multiple pages of base path mappings. Also refactored how paging is handled throughout the code. Thanks @kzhou57 for discovering this ([#345](https://github.com/amplify-education/serverless-domain-manager/pull/345))

## [4.0.1] - 2020-05-12

### Changed
- Fix issue updating domains that use a blank base path. Thanks @fabiancook ([#337](https://github.com/amplify-education/serverless-domain-manager/pull/337))

## [4.0.0] - 2020-05-06

### Breaking Changes
- Regional domains with TLS 1.0 no longer work. Fixed in 4.1.1

### Added
- Add support for WebSocket and HTTP APIs. A domain name can be created for each API type (Rest, WebSocket, HTTP) 
for up to 3 domain names in a single Serverless config. Thanks @TehNrd ([#319](https://github.com/amplify-education/serverless-domain-manager/pull/319))

## [3.3.2] - 2020-04-21

### Changed
- Fix CloudFormation stack's Outputs. Thanks @davidrosson ([#320](https://github.com/amplify-education/serverless-domain-manager/pull/320)) 
- Use pagination when there are too many certificates. Thanks @cbm-gplassard ([#315](https://github.com/amplify-education/serverless-domain-manager/pull/315))

## [3.3.1] - 2020-01-16

### Changed
- Fix AWS SDK initialization after internal change in serverless. Thanks @medikoo ([#307](https://github.com/amplify-education/serverless-domain-manager/pull/307))

## [3.3.0] - 2019-08-12

### Added
- Add ability to choose TLS version. Thanks @drexler ([#240](https://github.com/amplify-education/serverless-domain-manager/pull/240))

## [3.2.7] - 2019-08-02

### Added
- Add our own configuration for AWS SDK's built in retry mechanism, increasing it from per service default retries to 20 so that this plugin is more easily used in an automated environment.

## [3.2.6] - 2019-06-24

### Added
- Add hosted zone to domain summary

## [3.2.5] - 2019-06-24

### Added
- Add `iam:CreateServiceLinkedRole` to CloudFormation template

## [3.2.4] - 2019-06-24

### Changed
- Update the minimum required permissions to run the serverless domain manager plugin to include `apigateway:PATCH

## [3.2.3] - 2019-06-24

### Changed
- Fixed npm package security vulnerabilities

## [3.2.2] - 2019-05-15

### Changed
- Move chai-spies and node types to dev dependencies

## [3.2.1] - 2019-03-22

### Added
- Display error messages from AWS if SLS_DEBUG is set
- Updated README with behavior change and required permissions

## [3.2.0] - 2019-03-22

### Added
- Create AAAA Alias for IPv6 Support

## [3.1.0] - 2019-03-01

### Added
- Add Issue Templates
- Add PR Templates

### Changed
- Fixed issue where creating a domain was no longer idempotent in 3.0.4
- Fixed issue where deploying was no longer idempotent in 3.0.4 due to basepath mapping creation
- Fixed issue where deploying would break on occasion if more than 100 CloudFormation resources existed

## [3.0.2 - 3.0.4] - 2019-02-06
- Fix Travis configuration

## [3.0.1] - 2019-02-04
- Version bump to fix NPM versioning issue that occured while testing.

## [3.0.0] - 2019-02-04

### Changed
- Refactored from Javascript into Typescript
- Created BasePathMapping through API rather than through CloudFormation

### Removed
- Support for migrating CNAMEs to A Alias Records
  - In 1.0, we only created CNAME records. In 2.0 we deprecated CNAME creation and started creating A Alias records and migrated CNAME records to A Alias records. Now in 3.0, we only create A Alias records.


## [2.6.13] - 2019-01-25

### Added
- Created integration test for custom API field being set.


## [2.6.12] - 2019-01-18

### Changed
- Implemented a better hosted zone matching algorithm to break domain into parts.


## [2.6.11] - 2019-01-10

### Changed
- Fixes bug where having any custom data defined in provider data will trigger a ValidationError because the existing API id is null or undefined.


## [2.6.10] - 2018-12-17

### Added
- Integration test to replicate issue where basepath mapping is not set when recreating a domain.

### Changed
- Separated out `sls` commands in utility functions for integration tests.


## [2.6.9] - 2018-12-17

### Added
- Check to ensure plugin configuration exists and throw an error if it does not.

### Changed
- Updated unit tests.

## [2.6.7] - 2018-11-28

### Added
- Added integration tests.

## [2.6.6] - 2018-11-07

### Changed
- Updated certificate selection to only use unexpired certificates.

## [2.6.5] - 2018-08-27

### Changed
- Fixed security vulnerability by updated mocha@5.2.0.

## [2.6.4] - 2018-08-27

### Changed
- Allowed `enabled` option to accept strings as well as booleans.
- Updated unit tests.
- Updated README to reflect changes made to the `enabled` option.

## [2.6.3] - 2018-08-02

### Changed
- Updated README to reflect the current behavior of creating A Alias records instead of CNAMEs.

## [2.6.2] - 2018-07-25

### Added
- This CHANGELOG file to make it easier for future updates to be documented. Sadly, will not be going back to document changes made for previous versions.

## [2.6.1] - 2018-07-25

### Changed
- Added single quotes to `certificateName` in README

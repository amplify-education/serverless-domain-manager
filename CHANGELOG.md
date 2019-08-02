# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

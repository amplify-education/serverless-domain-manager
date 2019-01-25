# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

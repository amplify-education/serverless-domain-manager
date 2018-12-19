# serverless-domain-manager
[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)
[![Build Status](https://travis-ci.org/amplify-education/serverless-domain-manager.svg?branch=master)](https://travis-ci.org/amplify-education/serverless-domain-manager)
[![npm version](https://badge.fury.io/js/serverless-domain-manager.svg)](https://badge.fury.io/js/serverless-domain-manager)
[![MIT licensed](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/amplify-education/serverless-domain-manager/master/LICENSE)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/235fe249b8354a3db0cc5926dba47899)](https://www.codacy.com/app/CFER/serverless-domain-manager?utm_source=github.com&utm_medium=referral&utm_content=amplify-education/serverless-domain-manager&utm_campaign=badger)
[![npm downloads](https://img.shields.io/npm/dt/serverless-domain-manager.svg?style=flat)](https://www.npmjs.com/package/serverless-domain-manager)

Create custom domain names that your lambda can deploy to with serverless. Allows for base path mapping when deploying and deletion of domain names.

# About Amplify
Amplify builds innovative and compelling digital educational products that empower teachers and students across the country. We have a long history as the leading innovator in K-12 education - and have been described as the best tech company in education and the best education company in tech. While others try to shrink the learning experience into the technology, we use technology to expand what is possible in real classrooms with real students and teachers.

Learn more at https://www.amplify.com

# Getting Started

## Prerequisites
Make sure you have the following installed before starting:
* [nodejs](https://nodejs.org/en/download/)
* [npm](https://www.npmjs.com/get-npm?utm_source=house&utm_medium=homepage&utm_campaign=free%20orgs&utm_term=Install%20npm)
* [serverless](https://serverless.com/framework/docs/providers/aws/guide/installation/)

The IAM role that is deploying the lambda will need the following permissions:
```
acm:ListCertificates                *
apigateway:GET                      /domainnames/*
apigateway:DELETE                   /domainnames/*
apigateway:POST                     /domainnames
apigateway:POST                     /domainnames/*/basepathmappings
cloudfront:UpdateDistribution       *
route53:ListHostedZones             *
route53:ChangeResourceRecordSets    hostedzone/{HostedZoneId}
route53:GetHostedZone               hostedzone/{HostedZoneId}
route53:ListResourceRecordSets      hostedzone/{HostedZoneId}
```
### CloudFormation
Alternatively you can generate an least privileged IAM Managed Policy for deployment with this:

[deployment policy cloudformation template](scripts/cloudformation/serverless-domain-manager-deploy-policy.yaml)

## Installing
```
# From npm (recommended)
npm install serverless-domain-manager --save-dev
```

Then make the following edits to your serverless.yaml file:

Add the plugin.

```yaml
plugins:
  - serverless-domain-manager
```

Add the plugin configuration (example for `serverless.foo.com/api`).

```yaml
custom:
  customDomain:
    domainName: serverless.foo.com
    stage: ci
    basePath: api
    certificateName: '*.foo.com'
    createRoute53Record: true
    endpointType: 'regional'
```

| Parameter Name | Default Value | Description |
| --- | --- | --- |
| domainName _(Required)_ | | The domain name to be created in API Gateway and Route53 (if enabled) for this API. |
| basePath | `(none)` | The base path that will prepend all API endpoints. |
| stage | Value of `--stage`, or `provider.stage` (serverless will default to `dev` if unset) | The stage to create the domain name for. This parameter allows you to specify a different stage for the domain name than the stage specified for the serverless deployment. |
| certificateName | Closest match | The name of a specific certificate from Certificate Manager to use with this API. If not specified, the closest match will be used (i.e. for a given domain name `api.example.com`, a certificate for `api.example.com` will take precedence over a `*.example.com` certificate). <br><br> Note: Edge-optimized endpoints require that the certificate be located in `us-east-1` to be used with the CloudFront distribution. |
| certificateArn | `(none)` | The arn of a specific certificate from Certificate Manager to use with this API. |
| createRoute53Record | `true` | Toggles whether or not the plugin will create an A Alias record in Route53 mapping the `domainName` to the generated distribution domain name. If false, does not create a record. |
| endpointType | edge | Defines the endpoint type, accepts `regional` or `edge`. |
| hostedZoneId | | If hostedZoneId is set the route53 record set will be created in the matching zone, otherwise the hosted zone will be figured out from the domainName (hosted zone with matching domain). |
| hostedZonePrivate | | If hostedZonePrivate is set to `true` then only private hosted zones will be used for route 53 records. If it is set to `false` then only public hosted zones will be used for route53 records. Setting this parameter is specially useful if you have multiple hosted zones with the same domain name (e.g. a public and a private one) |
| enabled | true | Sometimes there are stages for which is not desired to have custom domain names. This flag allows the developer to disable the plugin for such cases. Accepts either `boolean` or `string` values and defaults to `true` for backwards compatibility. |

## Running

To create the custom domain:
```
serverless create_domain
```

To deploy with the custom domain:
```
serverless deploy
```

To remove the created custom domain:
```
serverless delete_domain
```
# How it works
Creating the custom domain takes advantage of Amazon's Certificate Manager to assign a certificate to the given domain name. Based on already created certificate names, the plugin will search for the certificate that resembles the custom domain's name the most and assign the ARN to that domain name. The plugin then creates the proper A Alias records for the domain through Route 53. Once the domain name is set it takes up to 40 minutes before it is initialized. After the certificate is initialized, `sls deploy` will create the base path mapping and assign the lambda to the custom domain name through CloudFront.

## Running Tests
To run unit tests:
```
npm test
```

To run integration tests, set an environment variable `TEST_DOMAIN` to the domain you will be testing for (i.e. `example.com` if creating a domain for `api.example.com`). Then, 
```
export TEST_DOMAIN=example.com
npm run integration-test
```

All tests should pass. All unit tests should pass before merging. Integration tests will take an extremely long time, as DNS records have to propogate for the resources created - therefore, integration tests will not be run on every commit.

If there is an error update the node_modules inside the serverless-domain-manager folder:
```
npm install
```

## Writing Integration Tests
Unit tests are found in `test/unit-tests`. Integration tests are found in `test/integration-tests`. Each folder in `tests/integration-tests` contains the serverless-domain-manager configuration being tested. To create a new integration test, create a new folder for the `handler.js` and `serverless.yml` with the same naming convention and update `integration.test.js`.


# Known Issues
* (5/23/2017) CloudFormation does not support changing the base path from empty to something or vice a versa. You must run `sls remove` to remove the base path mapping.
* (1/17/2018) The `create_domain` command provided by this plugin does not currently update an existing Custom Domain's configuration. Instead, it only supports updating the Route 53 record pointing to the Custom Domain. For example, one must delete and recreate a Custom Domain to migrate it from regional to edge or vice versa, or to modify the certificate.
* (8/22/2018) Creating a custom domain creates a CloudFront Distribution behind the scenes for fronting your API Gateway. This CloudFront Distribution is managed by AWS and cannot be viewed/managed by you. This is not a bug, but a quirk of how the Custom Domain feature works in API Gateway.
* (12/19/2018) Recreating a custom domain after deleting it does not work if the basePathMapping is not set. The workaround is to always run `sls remove` when running `sls delete_domain`.

# Responsible Disclosure
If you have any security issue to report, contact project maintainers privately.
You can reach us at <github@amplify.com>

# Contributing
We welcome pull requests! For your pull request to be accepted smoothly, we suggest that you:
1. For any sizable change, first open a GitHub issue to discuss your idea.
2. Create a pull request.  Explain why you want to make the change and what it’s for.
We’ll try to answer any PR’s promptly.

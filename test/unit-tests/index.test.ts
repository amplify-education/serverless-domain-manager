import * as aws from "aws-sdk";
import * as AWS from "aws-sdk-mock";
import { expect } from "chai";
import "mocha";
import DomainResponse = require("../../DomainResponse");
import ServerlessCustomDomain = require("../../index");
import { ServerlessInstance, ServerlessOptions } from "../../types";

const certTestData = {
  CertificateSummaryList: [
    {
      CertificateArn: "test_arn",
      DomainName: "test_domain",
    },
    {
      CertificateArn: "test_given_cert_name",
      DomainName: "cert_name",
    },
    {
      CertificateArn: "test_given_arn",
      DomainName: "other_cert_name",
    },
  ],
};

const testCreds = {
  accessKeyId: "test_key",
  secretAccessKey: "test_secret",
  sessionToken: "test_session",
};

const constructPlugin = (customDomainOptions) => {
  aws.config.update(testCreds);
  aws.config.region = "eu-west-1";

  const serverless = {
    cli: {
      log(str: string) { return str; },
      consoleLog(str: any) { return str; },
    },
    providers: {
      aws: {
        getCredentials: () => new aws.Credentials(testCreds),
        getRegion: () => "eu-west-1",
        sdk: {
          ACM: aws.ACM,
          APIGateway: aws.APIGateway,
          CloudFormation: aws.CloudFormation,
          Route53: aws.Route53,
        },
      },
    },
    service: {
      custom: {
        customDomain: {
          basePath: customDomainOptions.basePath,
          certificateArn: customDomainOptions.certificateArn,
          certificateName: customDomainOptions.certificateName,
          createRoute53Record: customDomainOptions.createRoute53Record,
          domainName: customDomainOptions.domainName,
          enabled: customDomainOptions.enabled,
          endpointType: customDomainOptions.endpointType,
          hostedZoneId: customDomainOptions.hostedZoneId,
          hostedZonePrivate: customDomainOptions.hostedZonePrivate,
          stage: customDomainOptions.stage,
        },
      },
      provider: {
        apiGateway: {
          restApiId: null,
        },
        compiledCloudFormationTemplate: {
          Outputs: null,
        },
        stackName: "custom-stage-name",
        stage: "test",
      },
      service: "test",
    },
  };
  const options = {
    stage: "test",
  };
  return new ServerlessCustomDomain(serverless, options);
};

describe("Custom Domain Plugin", () => {
  it("Checks aws config", () => {
    const plugin = constructPlugin({});
    expect(plugin.initialized).to.equal(false);

    plugin.initializeVariables();

    const returnedCreds = plugin.apigateway.config.credentials;
    expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
    expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
    expect(plugin.initialized).to.equal(true);
  });

  describe("Domain Endpoint types", () => {
    it("Unsupported endpoint types throw exception", () => {
      const plugin = constructPlugin({ endpointType: "notSupported" });
      expect(plugin.initialized).to.equal(false);

      let errored = false;
      try {
        plugin.initializeVariables();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal("notSupported is not supported endpointType, use edge or regional.");
      }
      expect(errored).to.equal(true);
    });
  });

  describe("Set Domain Name and Base Path", () => {
    it("Creates basepath mapping", async () => {
      AWS.mock("APIGateway", "createBasePathMapping", (params, callback) => {
        callback(null, params);
      });
      AWS.mock("CloudFormation", "describeStackResources", (params, callback) => {
        callback(null, {StackResources:
          [
            { LogicalResourceId: "ApiGatewayRestApi", PhysicalResourceId: "test_rest_api_id" },
          ],
        });
      });
      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
      });
      plugin.cloudformation = new aws.CloudFormation();
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;
      plugin.basePath = plugin.serverless.service.custom.customDomain.basePath;

      const result = await plugin.createBasePathMapping();
      // verify that api was called with right arguments
      expect(result.domainName).to.equal("test_domain");
      expect(result.restApiId).to.equal("test_rest_api_id");
      expect(result.basePath).to.equal("test_basepath");
    });

    it("Add Domain Name and HostedZoneId to stack output", () => {
      const plugin = constructPlugin({
        domainName: "test_domain",
      });
      plugin.addOutputs(new DomainResponse({
        distributionDomainName: "fake_dist_name",
        distributionHostedZoneId: "fake_zone_id",
        domainName: "fake_domain",
      }));
      const cfTemplat = plugin.serverless.service.provider.compiledCloudFormationTemplate.Outputs;
      expect(cfTemplat).to.not.equal(undefined);
    });

    it("(none) is added if basepath is an empty string", async () => {
      AWS.mock("APIGateway", "createBasePathMapping", (params, callback) => {
        callback(null, params);
      });
      AWS.mock("CloudFormation", "describeStackResources", (params, callback) => {
        callback(null, {
          StackResources:
            [
              { LogicalResourceId: "ApiGatewayRestApi", PhysicalResourceId: "test_rest_api_id" },
            ],
        });
      });

      const plugin = constructPlugin({
        basePath: "",
        domainName: "test_domain",
      });
      plugin.initializeVariables();
      plugin.cloudformation = new aws.CloudFormation();
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;

      const result = await plugin.createBasePathMapping();
      expect(result.basePath).to.equal("(none)");
    });

    it("(none) is added if no value is given for basepath (null)", async () => {
      AWS.mock("APIGateway", "createBasePathMapping", (params, callback) => {
        callback(null, params);
      });
      AWS.mock("CloudFormation", "describeStackResources", (params, callback) => {
        callback(null, {
          StackResources:
            [
              { LogicalResourceId: "ApiGatewayRestApi", PhysicalResourceId: "test_rest_api_id" },
            ],
        });
      });

      const plugin = constructPlugin({
        basePath: null,
        domainName: "test_domain",
      });
      plugin.initializeVariables();
      plugin.cloudformation = new aws.CloudFormation();
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;

      const result = await plugin.createBasePathMapping();
      expect(result.basePath).to.equal("(none)");
    });

    it("(none) is added if basepath attribute is missing (undefined)", async () => {
      AWS.mock("APIGateway", "createBasePathMapping", (params, callback) => {
        callback(null, params);
      });
      AWS.mock("CloudFormation", "describeStackResources", (params, callback) => {
        callback(null, {
          StackResources:
            [
              { LogicalResourceId: "ApiGatewayRestApi", PhysicalResourceId: "test_rest_api_id" },
            ],
        });
      });

      const plugin = constructPlugin({
        domainName: "test_domain",
      });
      plugin.initializeVariables();
      plugin.cloudformation = new aws.CloudFormation();
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;

      const result = await plugin.createBasePathMapping();
      expect(result.basePath).to.equal("(none)");
    });

    it("stage was not given", async () => {
      AWS.mock("APIGateway", "createBasePathMapping", (params, callback) => {
        callback(null, params);
      });
      AWS.mock("CloudFormation", "describeStackResources", (params, callback) => {
        callback(null, {
          StackResources:
            [
              { LogicalResourceId: "ApiGatewayRestApi", PhysicalResourceId: "test_rest_api_id" },
            ],
        });
      });

      const plugin = constructPlugin({
        domainName: "test_domain",
      });
      plugin.initializeVariables();
      plugin.cloudformation = new aws.CloudFormation();
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;

      const result = await plugin.createBasePathMapping();
      expect(result.stage).to.equal("test");
    });

    afterEach(() => {
      AWS.restore();
    });
  });

  describe("Create a New Domain Name", () => {
    it("Get a given certificate arn", async () => {
      AWS.mock("ACM", "listCertificates", certTestData);

      const options = {
        certificateArn: "test_given_arn",
        endpointType: "REGIONAL",
      };
      const plugin = constructPlugin(options);
      plugin.acm = new aws.ACM();

      const result = await plugin.getCertArn();

      expect(result).to.equal("test_given_arn");
    });

    it("Get a given certificate name", async () => {
      AWS.mock("ACM", "listCertificates", certTestData);

      const plugin = constructPlugin({ certificateName: "cert_name" });
      plugin.acm = new aws.ACM();

      const result = await plugin.getCertArn();

      expect(result).to.equal("test_given_cert_name");
    });

    it("Create a domain name", async () => {
      AWS.mock("APIGateway", "createDomainName", (params, callback) => {
        callback(null, { distributionDomainName: "foo" });
      });

      const plugin = constructPlugin({ domainName: "test_domain"});
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;

      const result = await plugin.createCustomDomain("fake_cert");

      expect(result.domainName).to.equal("foo");
    });

    it("Create a new A Alias Record", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, { HostedZones: [{ Name: "test_domain", Id: "test_id", Config: { PrivateZone: false } }] });
      });

      AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({ basePath: "test_basepath" });
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = "test_domain";

      const domain = new DomainResponse(
        {
          distributionDomainName: "test_distribution_name",
          distributionHostedZoneId: "test_id",
        },
      );

      const result = await plugin.changeResourceRecordSet("UPSERT", domain);
      const changes = result.ChangeBatch.Changes[0];
      expect(changes.Action).to.equal("UPSERT");
      expect(changes.ResourceRecordSet.Name).to.equal("test_domain");
      expect(changes.ResourceRecordSet.AliasTarget.DNSName).to.equal("test_distribution_name");
    });

    it("Do not create a Route53 record", async () => {
      const plugin = constructPlugin({
        createRoute53Record: false,
        domainName: "test_domain",
      });
      const result = await plugin.changeResourceRecordSet("UPSERT", new DomainResponse({}));
      expect(result).to.equal(false);
    });

    afterEach(() => {
      AWS.restore();
    });
  });

//   describe("Resource ApiGatewayStage overridden", () => {
//     const deploymentId = "";
//     it("serverless.yml doesn\"t define explicitly the resource ApiGatewayStage", () => {
//       const plugin = constructPlugin("");
//       plugin.addResources(deploymentId);
//       const cf = plugin.serverless.service.provider.compiledCloudFormationTemplate.Resources;

//       expect(cf.pathmapping.DependsOn).to.be.an("array").to.have.lengthOf(1);
//     });

//     it("serverless.yml defines explicitly the resource ApiGatewayStage", () => {
//       const plugin = constructPlugin("");
//       const cf = plugin.serverless.service.provider.compiledCloudFormationTemplate.Resources;

//       // Fake the property ApiGatewayStage
//       cf.ApiGatewayStage = {
//         Type: "AWS::ApiGateway::Stage",
//         Properties: {},
//       };

//       plugin.addResources(deploymentId);
//       expect(cf.pathmapping.DependsOn).to.be.an("array").to.have.lengthOf(2);
//       expect(cf.pathmapping.DependsOn).to.include("ApiGatewayStage");
//     });
//   });

  describe("Gets Rest API correctly", () => {
    it("Fetches restApiId correctly when no ApiGateway specified", async () =>{
      AWS.mock("CloudFormation", "describeStackResources", (params, callback) => {
        callback(null, {
          StackResources:
            [
              { LogicalResourceId: "ApiGatewayRestApi", PhysicalResourceId: "test_rest_api_id" },
              { LogicalResourceId: "LambdaPermission", PhysicalResourceId: "test_permission" },
              { LogicalResourceId: "ApiGatewayResourceHello", PhysicalResourceId: "test_api_resource" },
            ],
        });
      });
      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
      });
      plugin.cloudformation = new aws.CloudFormation();

      const result = await plugin.getRestApiId();
      expect(result).to.equal("test_rest_api_id");
    });

    it("serverless.yml defines explicitly the apiGateway", async () => {
      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
      });
      plugin.cloudformation = new aws.CloudFormation();
      plugin.serverless.service.provider.apiGateway.restApiId = "test_rest_api_id";
      const result = await plugin.getRestApiId();
      expect(result).to.equal("test_rest_api_id");
    });
  });

  describe("Delete the new domain", () => {
    it("Find available domains", async () => {
      AWS.mock("APIGateway", "getDomainName", (params, callback) => {
        callback(null, { distributionDomainName: "test_domain" });
      });

      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
      });
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;

      const result = await plugin.getDomainInfo();

      expect(result.domainName).to.equal("test_domain");
    });

    it("Delete A Alias Record", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, { HostedZones: [{ Name: "test_domain", Id: "test_id", Config: { PrivateZone: false } }] });
      });

      AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
      });
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;

      const domain = new DomainResponse({
        distributionDomainName: "test_distribution_name",
        distributionHostedZoneId: "test_id",
      });

      const result = await plugin.changeResourceRecordSet("DELETE", domain);
      const changes = result.ChangeBatch.Changes[0];
      expect(changes.Action).to.equal("DELETE");
      expect(changes.ResourceRecordSet.Name).to.equal("test_domain");
      expect(changes.ResourceRecordSet.AliasTarget.DNSName).to.equal("test_distribution_name");
    });

    it("Delete the domain name", async () => {
      AWS.mock("APIGateway", "deleteDomainName", (params, callback) => {
        callback(null, {});
      });

      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
      });
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;

      const result = await plugin.deleteCustomDomain();
      expect(result).to.eql({});
    });

    afterEach(() => {
      AWS.restore();
    });
  });

  describe("Hook Methods", () => {
    it("setupBasePathMapping", async () => {
      AWS.mock("APIGateway", "getDomainName", (params, callback) => {
        callback(null, { domainName: "fake_domain", distributionDomainName: "fake_dist_name" });
      });
      AWS.mock("APIGateway", "createBasePathMapping", (params, callback) => {
        callback(null, params);
      });
      AWS.mock("CloudFormation", "describeStackResources", (params, callback) => {
        callback(null, {
          StackResources:
            [
              { LogicalResourceId: "ApiGatewayRestApi", PhysicalResourceId: "test_rest_api_id" },
            ],
        });
      });
      const plugin = constructPlugin({ domainName: "test_domain"});
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();
      plugin.cloudformation = new aws.CloudFormation();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;

      const result = await plugin.setupBasePathMapping();
      expect(result).to.equal(true);
    });

    it("deleteDomain", async () => {
      AWS.mock("APIGateway", "getDomainName", (params, callback) => {
        callback(null, { distributionDomainName: "test_distribution", regionalHostedZoneId: "test_id" });
      });
      AWS.mock("APIGateway", "deleteDomainName", (params, callback) => {
        callback(null, {});
      });
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, { HostedZones: [{ Name: "test_domain", Id: "test_id", Config: { PrivateZone: false } }] });
      });
      AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({ domainName: "test_domain"});
      plugin.apigateway = new aws.APIGateway();
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;
      const results = await plugin.deleteDomain();
      expect(results).to.equal(true);
    });

    it("createDomain", async () => {
      AWS.mock("ACM", "listCertificates", certTestData);
      AWS.mock("APIGateway", "getDomainName", (params, callback) => {
        callback(new Error("domain doesn\"t exist"), {});
      });
      AWS.mock("APIGateway", "createDomainName", (params, callback) => {
        callback(null, { distributionDomainName: "foo", regionalHostedZoneId: "test_id" });
      });
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, { HostedZones: [{ Name: "test_domain", Id: "test_id", Config: { PrivateZone: false } }] });
      });
      AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({ domainName: "test_domain" });
      plugin.apigateway = new aws.APIGateway();
      plugin.route53 = new aws.Route53();
      plugin.acm = new aws.ACM();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;
      const result = await plugin.createDomain();
      expect(result).to.equal(true);
    });

    afterEach(() => {
      AWS.restore();
    });
  });

  describe("Select Hosted Zone", () => {
    it("Natural order", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: "aaa.com.", Id: "/hostedzone/test_id_0", Config: { PrivateZone: false } },
            { Name: "bbb.aaa.com.", Id: "/hostedzone/test_id_1", Config: { PrivateZone: false } },
            { Name: "ccc.bbb.aaa.com.", Id: "/hostedzone/test_id_2", Config: { PrivateZone: false } },
            { Name: "ddd.ccc.bbb.aaa.com.", Id: "/hostedzone/test_id_3", Config: { PrivateZone: false } },
          ],
        });
      });

      const plugin = constructPlugin({});
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = "ccc.bbb.aaa.com";

      const result = await plugin.getRoute53HostedZoneId();
      expect(result).to.equal("test_id_2");
    });

    it("Reverse order", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: "ddd.ccc.bbb.aaa.com.", Id: "/hostedzone/test_id_0", Config: { PrivateZone: false } },
            { Name: "ccc.bbb.aaa.com.", Id: "/hostedzone/test_id_1", Config: { PrivateZone: false } },
            { Name: "bbb.aaa.com.", Id: "/hostedzone/test_id_2", Config: { PrivateZone: false } },
            { Name: "aaa.com.", Id: "/hostedzone/test_id_3", Config: { PrivateZone: false } },
          ],
        });
      });

      const plugin = constructPlugin({});
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = "test.ccc.bbb.aaa.com";

      const result = await plugin.getRoute53HostedZoneId();
      expect(result).to.equal("test_id_1");
    });

    it("Random order", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: "bbb.aaa.com.", Id: "/hostedzone/test_id_0", Config: { PrivateZone: false } },
            { Name: "ddd.ccc.bbb.aaa.com.", Id: "/hostedzone/test_id_1", Config: { PrivateZone: false } },
            { Name: "ccc.bbb.aaa.com.", Id: "/hostedzone/test_id_2", Config: { PrivateZone: false } },
            { Name: "aaa.com.", Id: "/hostedzone/test_id_3", Config: { PrivateZone: false } },
          ],
        });
      });

      const plugin = constructPlugin({});
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = "test.ccc.bbb.aaa.com";

      const result = await plugin.getRoute53HostedZoneId();
      expect(result).to.equal("test_id_2");
    });

    it("Sub domain name - only root hosted zones", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: "aaa.com.", Id: "/hostedzone/test_id_0", Config: { PrivateZone: false } },
            { Name: "bbb.fr.", Id: "/hostedzone/test_id_1", Config: { PrivateZone: false } },
            { Name: "ccc.com.", Id: "/hostedzone/test_id_3", Config: { PrivateZone: false } },
          ],
        });
      });

      const plugin = constructPlugin({});
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = "bar.foo.bbb.fr";

      const result = await plugin.getRoute53HostedZoneId();
      expect(result).to.equal("test_id_1");
    });

    it("With matching root and sub hosted zone", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: "a.aaa.com.", Id: "/hostedzone/test_id_0", Config: { PrivateZone: false } },
            { Name: "aaa.com.", Id: "/hostedzone/test_id_1", Config: { PrivateZone: false } },
          ],
        });
      });

      const plugin = constructPlugin({});
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = "test.a.aaa.com";

      const result = await plugin.getRoute53HostedZoneId();
      expect(result).to.equal("test_id_0");
    });

    it("Sub domain name - natural order", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: "aaa.com.", Id: "/hostedzone/test_id_0", Config: { PrivateZone: false } },
            { Name: "bbb.fr.", Id: "/hostedzone/test_id_1", Config: { PrivateZone: false } },
            { Name: "foo.bbb.fr.", Id: "/hostedzone/test_id_3", Config: { PrivateZone: false } },
            { Name: "ccc.com.", Id: "/hostedzone/test_id_4", Config: { PrivateZone: false } },
          ],
        });
      });

      const plugin = constructPlugin({});
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = "bar.foo.bbb.fr";

      const result = await plugin.getRoute53HostedZoneId();
      expect(result).to.equal("test_id_3");
    });

    it("Sub domain name - reverse order", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: "foo.bbb.fr.", Id: "/hostedzone/test_id_3", Config: { PrivateZone: false } },
            { Name: "bbb.fr.", Id: "/hostedzone/test_id_1", Config: { PrivateZone: false } },
            { Name: "ccc.com.", Id: "/hostedzone/test_id_4", Config: { PrivateZone: false } },
            { Name: "aaa.com.", Id: "/hostedzone/test_id_0", Config: { PrivateZone: false } },
          ],
        });
      });

      const plugin = constructPlugin({});
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = "bar.foo.bbb.fr";

      const result = await plugin.getRoute53HostedZoneId();
      expect(result).to.equal("test_id_3");
    });

    it("Sub domain name - random order", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: "bbb.fr.", Id: "/hostedzone/test_id_1", Config: { PrivateZone: false } },
            { Name: "aaa.com.", Id: "/hostedzone/test_id_0", Config: { PrivateZone: false } },
            { Name: "foo.bbb.fr.", Id: "/hostedzone/test_id_3", Config: { PrivateZone: false } },
          ],
        });
      });

      const plugin = constructPlugin({});
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = "bar.foo.bbb.fr";

      const result = await plugin.getRoute53HostedZoneId();
      expect(result).to.equal("test_id_3");
    });

    it("Private zone domain name", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: "aaa.com.", Id: "/hostedzone/test_id_1", Config: { PrivateZone: false } },
            { Name: "aaa.com.", Id: "/hostedzone/test_id_0", Config: { PrivateZone: true } }],
        });
      });

      const plugin = constructPlugin({});
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = "aaa.com";
      plugin.hostedZonePrivate = true;

      const result = await plugin.getRoute53HostedZoneId();
      expect(result).to.equal("test_id_0");
    });

    it("Undefined hostedZonePrivate should still allow private domains", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, {
          HostedZones: [
            { Name: "aaa.com.", Id: "/hostedzone/test_id_0", Config: { PrivateZone: true } },
          ],
        });
      });

      const plugin = constructPlugin({});
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = "aaa.com";

      const result = await plugin.getRoute53HostedZoneId();
      expect(result).to.equal("test_id_0");
    });

    afterEach(() => {
      AWS.restore();
    });
  });

  describe("Error Catching", () => {
    it("If a certificate cannot be found when a name is given", async () => {
      AWS.mock("ACM", "listCertificates", certTestData);

      const options = {
        certificateName: "does_not_exist",
        domainName: "",
      };
      const plugin = constructPlugin(options);
      plugin.acm = new aws.ACM();

      return plugin.getCertArn().then(() => {
        throw new Error("Test has failed. getCertArn did not catch errors.");
      }).catch((err) => {
        const expectedErrorMessage = "Error: Could not find the certificate does_not_exist.";
        expect(err.message).to.equal(expectedErrorMessage);
      });
    });

    it("Fail getHostedZone", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, { HostedZones: [{ Name: "no_hosted_zone", Id: "test_id" }] });
      });

      const plugin = constructPlugin({ domainName: "test_domain"});
      plugin.route53 = new aws.Route53();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;

      return plugin.getRoute53HostedZoneId().then(() => {
        throw new Error("Test has failed, getHostedZone did not catch errors.");
      }).catch((err) => {
        const expectedErrorMessage = "Error: Could not find hosted zone \"test_domain\"";
        expect(err.message).to.equal(expectedErrorMessage);
      });
    });

    it("Domain summary failed", async () => {
      AWS.mock("APIGateway", "getDomainName", (params, callback) => {
        callback(null, null);
      });
      const plugin = constructPlugin({ domainName: "test_domain"});
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;

      return plugin.domainSummary().then(() => {
        // check if distribution domain name is printed
      }).catch((err) => {
        const expectedErrorMessage = `Error: Unable to fetch information about test_domain`;
        expect(err.message).to.equal(expectedErrorMessage);
      });
    });

    afterEach(() => {
      AWS.restore();
    });
  });

  describe("Summary Printing", () => {
    it("Prints Summary", async () => {
      AWS.mock("APIGateway", "getDomainName", (params, callback) => {
        callback(null, { domainName: params, distributionDomainName: "test_distributed_domain_name" });
      });
      const plugin = constructPlugin({domainName: "test_domain"});
      plugin.apigateway = new aws.APIGateway();
      plugin.givenDomainName = plugin.serverless.service.custom.customDomain.domainName;

      return plugin.domainSummary().then((data) => {
        expect(data).to.equal(true);
      }).catch(() => {
        throw new Error("Test has failed, domainSummary threw an error");
      });
    });

    afterEach(() => {
      AWS.restore();
    });
  });

  describe("Enable/disable functionality", () => {
    it("Should enable the plugin by default", () => {
      const plugin = constructPlugin({});

      plugin.initializeVariables();

      const returnedCreds = plugin.apigateway.config.credentials;
      expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
      expect(plugin.initialized).to.equal(true);
      expect(plugin.enabled).to.equal(true);
    });

    it("Should enable the plugin when passing a true parameter with type boolean", () => {
      const plugin = constructPlugin({ enabled: true });

      plugin.initializeVariables();

      const returnedCreds = plugin.apigateway.config.credentials;
      expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
      expect(plugin.initialized).to.equal(true);
      expect(plugin.enabled).to.equal(true);
    });

    it("Should enable the plugin when passing a true parameter with type string", () => {
      const plugin = constructPlugin({ enabled: "true" });

      plugin.initializeVariables();

      const returnedCreds = plugin.apigateway.config.credentials;
      expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
      expect(plugin.initialized).to.equal(true);
      expect(plugin.enabled).to.equal(true);
    });

    it("Should disable the plugin when passing a false parameter with type boolean", () => {
      const plugin = constructPlugin({ enabled: false });

      plugin.initializeVariables();

      expect(plugin.initialized).to.equal(true);
      expect(plugin.enabled).to.equal(false);
    });

    it("Should disable the plugin when passing a false parameter with type string", () => {
      const plugin = constructPlugin({ enabled: "false" });

      plugin.initializeVariables();

      expect(plugin.initialized).to.equal(true);
      expect(plugin.enabled).to.equal(false);
    });

    it("createDomain should do nothing when domain manager is disabled", async () => {
      const plugin = constructPlugin({ enabled: false });

      const result = await plugin.createDomain();

      expect(plugin.initialized).to.equal(true);
      expect(plugin.enabled).to.equal(false);
      expect(result).to.equal(undefined);
    });

    it("deleteDomain should do nothing when domain manager is disabled", async () => {
      const plugin = constructPlugin({ enabled: false });

      const result = await plugin.deleteDomain();

      expect(plugin.initialized).to.equal(true);
      expect(plugin.enabled).to.equal(false);
      expect(result).to.equal(undefined);
    });

    it("setUpBasePathMapping should do nothing when domain manager is disabled", async () => {
      const plugin = constructPlugin({ enabled: false });

      const result = await plugin.setupBasePathMapping();

      expect(plugin.initialized).to.equal(true);
      expect(plugin.enabled).to.equal(false);
      expect(result).to.equal(undefined);
    });

    it("domainSummary should do nothing when domain manager is disabled", async () => {
      const plugin = constructPlugin({ enabled: false });

      const result = await plugin.domainSummary();

      expect(plugin.initialized).to.equal(true);
      expect(plugin.enabled).to.equal(false);
      expect(result).to.equal(undefined);
    });

    it("Should throw an Error when passing a parameter that is not boolean", () => {
      const stringWithValueYes = "yes";
      const plugin = constructPlugin({ enabled: 0 });

      let errored = false;
      try {
        plugin.initializeVariables();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal("serverless-domain-manager: Ambiguous enablement boolean: \"0\"");
      }
      expect(errored).to.equal(true);
    });

    it("Should throw an Error when passing a parameter that cannot be converted to boolean", () => {
      const plugin = constructPlugin({ enabled: "yes" });

      let errored = false;
      try {
        plugin.initializeVariables();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal("serverless-domain-manager: Ambiguous enablement boolean: \"yes\"");
      }
      expect(errored).to.equal(true);
    });
  });

  describe("Missing plugin configuration", () => {
    it("Should thrown an Error when plugin customDomain configuration object is missing", () => {
      const plugin = constructPlugin({});
      delete plugin.serverless.service.custom.customDomain;

      let errored = false;
      try {
        plugin.initializeVariables();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal("serverless-domain-manager: Plugin configuration is missing.");
      }
      expect(errored).to.equal(true);
    });

    it("Should thrown an Error when Serverless custom configuration object is missing", () => {
      const plugin = constructPlugin({});
      delete plugin.serverless.service.custom;

      let errored = false;
      try {
        plugin.initializeVariables();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal("serverless-domain-manager: Plugin configuration is missing.");
      }
      expect(errored).to.equal(true);
    });
  });
});

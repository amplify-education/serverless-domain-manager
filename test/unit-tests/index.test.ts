import * as aws from "aws-sdk";
import * as AWS from "aws-sdk-mock";
import chai = require("chai");
import spies = require("chai-spies");
import "mocha";
import DomainInfo = require("../../DomainInfo");
import ServerlessCustomDomain = require("../../index");
import { ServerlessInstance, ServerlessOptions } from "../../types";

const expect = chai.expect;
chai.use(spies);

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
let consoleOutput = [];
const testCreds = {
  accessKeyId: "test_key",
  secretAccessKey: "test_secret",
  sessionToken: "test_session",
};

const constructPlugin = (customDomainOptions, multiple: boolean = false) => {
  aws.config.update(testCreds);
  aws.config.region = "eu-west-1";


  const custom = {
    basePath: customDomainOptions.basePath,
    certificateArn: customDomainOptions.certificateArn,
    certificateName: customDomainOptions.certificateName,
    createRoute53Record: customDomainOptions.createRoute53Record,
    domainName: customDomainOptions.domainName,
    enabled: customDomainOptions.enabled,
    endpointType: customDomainOptions.endpointType,
    hostedZoneId: customDomainOptions.hostedZoneId,
    hostedZonePrivate: customDomainOptions.hostedZonePrivate,
    securityPolicy: customDomainOptions.securityPolicy,
    stage: customDomainOptions.stage,
  }

  const serverless = {
    cli: {
      log(str: string) { consoleOutput.push(str); },
      consoleLog(str: any) { consoleOutput.push(str); },
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
          config: {
            update: (toUpdate: object) => null,
          },
        },
      },
    },
    service: {
      custom: {
        customDomain: multiple ? undefined : custom,
        customDomains: multiple ? [custom] : undefined,
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

    plugin.initializeVariables();

    const returnedCreds = plugin.apigateway.config.credentials;
    expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
    expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
  });

  describe("Domain Endpoint types", () => {
    it("Unsupported endpoint types throw exception", () => {
      const plugin = constructPlugin({ endpointType: "notSupported" });

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
      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
      });
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();
      const spy = chai.spy.on(plugin.apigateway, "createBasePathMapping");

      await plugin.createBasePathMapping("test_rest_api_id", plugin.domains[0]);
      expect(spy).to.have.been.called.with({
        basePath: "test_basepath",
        domainName: "test_domain",
        restApiId: "test_rest_api_id",
        stage: "test",
      });
    });

    it("Updates basepath mapping", async () => {
      AWS.mock("APIGateway", "updateBasePathMapping", (params, callback) => {
        callback(null, params);
      });
      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
      });
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();
      const spy = chai.spy.on(plugin.apigateway, "updateBasePathMapping");

      await plugin.updateBasePathMapping("old_basepath", plugin.domains[0]);
      expect(spy).to.have.been.called.with({
        basePath: "old_basepath",
        domainName: "test_domain",
        patchOperations: [
          {
            op: "replace",
            path: "/basePath",
            value: "test_basepath",
          },
        ],
      });
    });

    it("Add Distribution Domain Name, Domain Name, and HostedZoneId to stack output", () => {
      const plugin = constructPlugin({
        domainName: "test_domain",
      });
      plugin.initializeVariables();

      plugin.addOutputs(new DomainInfo({
        distributionDomainName: "fake_dist_name",
        distributionHostedZoneId: "fake_zone_id",
        domainName: "fake_domain",
      }), plugin.domains[0]);
      const cfTemplat = plugin.serverless.service.provider.compiledCloudFormationTemplate.Outputs;
      expect(cfTemplat).to.not.equal(undefined);
    });

    it("(none) is added if basepath is an empty string", async () => {
      AWS.mock("APIGateway", "createBasePathMapping", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        basePath: "",
        domainName: "test_domain",
      });
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();

      const spy = chai.spy.on(plugin.apigateway, "createBasePathMapping");

      await plugin.createBasePathMapping("test_rest_api_id", plugin.domains[0]);
      expect(spy).to.have.been.called.with({
        basePath: "(none)",
        domainName: "test_domain",
        restApiId: "test_rest_api_id",
        stage: "test",
      });
    });

    it("(none) is added if no value is given for basepath (null)", async () => {
      AWS.mock("APIGateway", "createBasePathMapping", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        basePath: null,
        domainName: "test_domain",
      });
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();
      const spy = chai.spy.on(plugin.apigateway, "createBasePathMapping");

      await plugin.createBasePathMapping("test_rest_api_id", plugin.domains[0]);
      expect(spy).to.have.been.called.with({
        basePath: "(none)",
        domainName: "test_domain",
        restApiId: "test_rest_api_id",
        stage: "test",
      });
    });

    it("(none) is added if basepath attribute is missing (undefined)", async () => {
      AWS.mock("APIGateway", "createBasePathMapping", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        domainName: "test_domain",
      });
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();
      const spy = chai.spy.on(plugin.apigateway, "createBasePathMapping");

      await plugin.createBasePathMapping("test_rest_api_id", plugin.domains[0]);
      expect(spy).to.have.been.called.with({
        basePath: "(none)",
        domainName: "test_domain",
        restApiId: "test_rest_api_id",
        stage: "test",
      });
    });

    it("stage was not given", async () => {
      AWS.mock("APIGateway", "createBasePathMapping", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        domainName: "test_domain",
      });
      plugin.initializeVariables();
      plugin.cloudformation = new aws.CloudFormation();
      plugin.apigateway = new aws.APIGateway();
      const spy = chai.spy.on(plugin.apigateway, "createBasePathMapping");

      await plugin.createBasePathMapping("test_rest_api_id", plugin.domains[0]);
      expect(spy).to.have.been.called.with({
        basePath: "(none)",
        domainName: "test_domain",
        restApiId: "test_rest_api_id",
        stage: "test",
      });
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
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
      plugin.initializeVariables();
      plugin.domains[0].acm = new aws.ACM();

      const result = await plugin.getCertArn(plugin.domains[0]);

      expect(result).to.equal("test_given_arn");
    });

    it("Get a given certificate name", async () => {
      AWS.mock("ACM", "listCertificates", certTestData);

      const plugin = constructPlugin({ certificateName: "cert_name" });
      plugin.initializeVariables();
      plugin.domains[0].acm = new aws.ACM();

      const result = await plugin.getCertArn(plugin.domains[0]);

      expect(result).to.equal("test_given_cert_name");
    });

    it("Create a domain name", async () => {
      AWS.mock("APIGateway", "createDomainName", (params, callback) => {
        callback(null, { distributionDomainName: "foo", securityPolicy: "TLS_1_2"});
      });

      const plugin = constructPlugin({ domainName: "test_domain", certificateArn: "fake_cert"});
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();

      const result = await plugin.createCustomDomain(plugin.domains[0]);

      expect(result.domainName).to.equal("foo");
      expect(result.securityPolicy).to.equal("TLS_1_2");
    });

    it("Create a new A Alias Record", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, { HostedZones: [{ Name: "test_domain", Id: "test_host_id", Config: { PrivateZone: false } }] });
      });

      AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({ basePath: "test_basepath", domainName: "test_domain" });
      plugin.initializeVariables();

      plugin.route53 = new aws.Route53();
      const spy = chai.spy.on(plugin.route53, "changeResourceRecordSets");

      const domain = new DomainInfo(
        {
          distributionDomainName: "test_distribution_name",
          distributionHostedZoneId: "test_id",
        },
      );

      await plugin.changeResourceRecordSet("UPSERT", domain, plugin.domains[0]);

      const expectedParams = {
        ChangeBatch: {
          Changes: [
            {
              Action: "UPSERT",
              ResourceRecordSet: {
                AliasTarget: {
                  DNSName: "test_distribution_name",
                  EvaluateTargetHealth: false,
                  HostedZoneId: "test_id",
                },
                Name: "test_domain",
                Type: "A",
              },
            },
            {
              Action: "UPSERT",
              ResourceRecordSet: {
                AliasTarget: {
                  DNSName: "test_distribution_name",
                  EvaluateTargetHealth: false,
                  HostedZoneId: "test_id",
                },
                Name: "test_domain",
                Type: "AAAA",
              },
            },
          ],
          Comment: "Record created by serverless-domain-manager",
        },
        HostedZoneId: "est_host_id", // getRoute53HostedZoneId strips first character
      };
      expect(spy).to.have.been.called.with(expectedParams);
    });

    it("Do not create a Route53 record", async () => {
      const plugin = constructPlugin({
        createRoute53Record: false,
        domainName: "test_domain",
      });
      plugin.initializeVariables();
      const result = await plugin.changeResourceRecordSet("UPSERT", new DomainInfo({}), plugin.domains[0]);
      expect(result).to.equal(undefined);
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
    });
  });

  describe("Gets existing basepath mappings correctly", () => {
    it("Returns undefined if no basepaths map to current restApiId", async () => {
      AWS.mock("APIGateway", "getBasePathMappings", (params, callback) => {
        callback(null, {
          items: [
            { basePath: "(none)", restApiId: "test_rest_api_id_one", stage: "test" },
          ],
        });
      });

      const plugin = constructPlugin({
        domainName: "test_domain",
      });
      plugin.initializeVariables();

      const result = await plugin.getBasePathMapping("test_rest_api_id_two", plugin.domains[0]);
      expect(result).to.equal(undefined);
    });

    it("Returns current api", async () => {
      AWS.mock("APIGateway", "getBasePathMappings", (params, callback) => {
        callback(null, {
          items: [
            { basePath: "api", restApiId: "test_rest_api_id", stage: "test" },
          ],
        });
      });

      const plugin = constructPlugin({
        basePath: "api",
        domainName: "test_domain",
      });
      plugin.initializeVariables();

      const result = await plugin.getBasePathMapping("test_rest_api_id", plugin.domains[0]);
      expect(result).to.equal("api");
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
    });
  });

  describe("Gets Rest API correctly", () => {
    it("Fetches restApiId correctly when no ApiGateway specified", async () => {
      AWS.mock("CloudFormation", "describeStackResource", (params, callback) => {
        callback(null, {
          StackResourceDetail:
            {
              LogicalResourceId: "ApiGatewayRestApi",
              PhysicalResourceId: "test_rest_api_id",
            },
        });
      });
      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
      });
      plugin.initializeVariables();
      plugin.cloudformation = new aws.CloudFormation();

      const result = await plugin.getRestApiId(plugin.domains[0]);
      expect(result).to.equal("test_rest_api_id");
    });

    it("serverless.yml defines explicitly the apiGateway", async () => {
      AWS.mock("CloudFormation", "describeStackResource", (params, callback) => {
        callback(null, {
          StackResourceDetail:
          {
            LogicalResourceId: "ApiGatewayRestApi",
            PhysicalResourceId: "test_rest_api_id",
          },
        });
      });

      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
      });
      plugin.initializeVariables();
      plugin.cloudformation = new aws.CloudFormation();
      plugin.serverless.service.provider.apiGateway.restApiId = "custom_test_rest_api_id";

      const result = await plugin.getRestApiId(plugin.domains[0]);
      expect(result).to.equal("custom_test_rest_api_id");
    });

    afterEach(() => {
      consoleOutput = [];
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
      plugin.initializeVariables();

      const result = await plugin.getDomainInfo(plugin.domains[0]);

      expect(result.domainName).to.equal("test_domain");
    });

    it("Delete A Alias Record", async () => {
      AWS.mock("Route53", "listHostedZones", (params, callback) => {
        callback(null, { HostedZones: [{ Name: "test_domain", Id: "test_host_id", Config: { PrivateZone: false } }] });
      });

      AWS.mock("Route53", "changeResourceRecordSets", (params, callback) => {
        callback(null, params);
      });

      const plugin = constructPlugin({
        basePath: "test_basepath",
        domainName: "test_domain",
      });
      plugin.route53 = new aws.Route53();
      plugin.initializeVariables();
      const spy = chai.spy.on(plugin.route53, "changeResourceRecordSets");

      const domain = new DomainInfo({
        distributionDomainName: "test_distribution_name",
        distributionHostedZoneId: "test_id",
      });

      await plugin.changeResourceRecordSet("DELETE", domain, plugin.domains[0]);
      const expectedParams = {
        ChangeBatch: {
          Changes: [
            {
              Action: "DELETE",
              ResourceRecordSet: {
                AliasTarget: {
                  DNSName: "test_distribution_name",
                  EvaluateTargetHealth: false,
                  HostedZoneId: "test_id",
                },
                Name: "test_domain",
                Type: "A",
              },
            },
            {
              Action: "DELETE",
              ResourceRecordSet: {
                AliasTarget: {
                  DNSName: "test_distribution_name",
                  EvaluateTargetHealth: false,
                  HostedZoneId: "test_id",
                },
                Name: "test_domain",
                Type: "AAAA",
              },
            },
          ],
          Comment: "Record created by serverless-domain-manager",
        },
        HostedZoneId: "est_host_id", // getRoute53HostedZoneId strips the first character
      };
      expect(spy).to.be.called.with(expectedParams);

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
      plugin.initializeVariables();
      const spy = chai.spy.on(plugin.apigateway, "deleteDomainName");

      await plugin.deleteCustomDomain(plugin.domains[0]);
      expect(spy).to.be.called.with({
        domainName: "test_domain",
      });
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
    });
  });

  describe("Hook Methods", () => {
    it("setupBasePathMapping", async () => {
      AWS.mock("APIGateway", "getDomainName", (params, callback) => {
        callback(null, { domainName: "fake_domain", distributionDomainName: "fake_dist_name" });
      });
      AWS.mock("APIGateway", "getBasePathMappings", (params, callback) => {
        callback(null, { items: [] });
      });
      AWS.mock("APIGateway", "createBasePathMapping", (params, callback) => {
        callback(null, params);
      });
      AWS.mock("CloudFormation", "describeStackResource", (params, callback) => {
        callback(null, {
          StackResourceDetail:
          {
            LogicalResourceId: "ApiGatewayRestApi",
            PhysicalResourceId: "test_rest_api_id",
          },
        });
      });
      const plugin = constructPlugin({ domainName: "test_domain"});
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();
      plugin.cloudformation = new aws.CloudFormation();
      const spy = chai.spy.on(plugin, "createBasePathMapping");

      await plugin.setupBasePathMapping(plugin.domains[0]);

      expect(spy).to.be.called();
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
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();
      plugin.route53 = new aws.Route53();

      await plugin.deleteDomain(plugin.domains[0]);
      expect(consoleOutput[0]).to.equal(`Custom domain ${plugin.domains[0].DomainName} was deleted.`);
    });

    it("createDomain if one does not exist before", async () => {
      AWS.mock("ACM", "listCertificates", certTestData);
      AWS.mock("APIGateway", "getDomainName", (params, callback) => {
        callback({ code: "NotFoundException" }, {});
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
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();
      plugin.route53 = new aws.Route53();
      plugin.domains[0].acm = new aws.ACM();

      await plugin.createDomain(plugin.domains[0]);
      expect(consoleOutput[0]).to.equal(`Custom domain ${plugin.domains[0].DomainName} was created.
            New domains may take up to 40 minutes to be initialized.`);
    });

    it("Does not create domain if one existed before", async () => {
      AWS.mock("ACM", "listCertificates", certTestData);
      AWS.mock("APIGateway", "getDomainName", (params, callback) => {
        callback(null, { distributionDomainName: "foo", regionalHostedZoneId: "test_id" });
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
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();
      plugin.route53 = new aws.Route53();
      plugin.domains[0].acm = new aws.ACM();
      await plugin.createDomain(plugin.domains[0]);
      expect(consoleOutput[0]).to.equal(`Custom domain ${plugin.domains[0].DomainName} already exists.`);
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
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

      const plugin = constructPlugin({domainName: "ccc.bbb.aaa.com"});
      plugin.initializeVariables();
      plugin.route53 = new aws.Route53();

      const result = await plugin.getRoute53HostedZoneId(plugin.domains[0]);
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

      const plugin = constructPlugin({domainName: "test.ccc.bbb.aaa.com"});
      plugin.initializeVariables();
      plugin.route53 = new aws.Route53();

      const result = await plugin.getRoute53HostedZoneId(plugin.domains[0]);
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

      const plugin = constructPlugin({domainName: "test.ccc.bbb.aaa.com"});
      plugin.initializeVariables();
      plugin.route53 = new aws.Route53();

      const result = await plugin.getRoute53HostedZoneId(plugin.domains[0]);
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

      const plugin = constructPlugin({domainName: "bar.foo.bbb.fr"});
      plugin.initializeVariables();
      plugin.route53 = new aws.Route53();

      const result = await plugin.getRoute53HostedZoneId(plugin.domains[0]);
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

      const plugin = constructPlugin({domainName: "test.a.aaa.com"});
      plugin.initializeVariables();
      plugin.route53 = new aws.Route53();

      const result = await plugin.getRoute53HostedZoneId(plugin.domains[0]);
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

      const plugin = constructPlugin({domainName: "bar.foo.bbb.fr"});
      plugin.initializeVariables();
      plugin.route53 = new aws.Route53();

      const result = await plugin.getRoute53HostedZoneId(plugin.domains[0]);
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

      const plugin = constructPlugin({domainName: "bar.foo.bbb.fr"});
      plugin.initializeVariables();
      plugin.route53 = new aws.Route53();

      const result = await plugin.getRoute53HostedZoneId(plugin.domains[0]);
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

      const plugin = constructPlugin({domainName: "bar.foo.bbb.fr"});
      plugin.initializeVariables();
      plugin.route53 = new aws.Route53();

      const result = await plugin.getRoute53HostedZoneId(plugin.domains[0]);
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

      const plugin = constructPlugin({domainName: "aaa.com", hostedZonePrivate: true});
      plugin.initializeVariables();
      plugin.route53 = new aws.Route53();

      const result = await plugin.getRoute53HostedZoneId(plugin.domains[0]);
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

      const plugin = constructPlugin({domainName: "aaa.com"});
      plugin.initializeVariables();
      plugin.route53 = new aws.Route53();

      const result = await plugin.getRoute53HostedZoneId(plugin.domains[0]);
      expect(result).to.equal("test_id_0");
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
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
      plugin.initializeVariables();
      plugin.domains[0].acm = new aws.ACM();

      return plugin.getCertArn(plugin.domains[0]).then(() => {
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
      plugin.initializeVariables();
      plugin.route53 = new aws.Route53();

      return plugin.getRoute53HostedZoneId(plugin.domains[0]).then(() => {
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
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();

      return plugin.domainSummary(plugin.domains[0]).then(() => {
        // check if distribution domain name is printed
      }).catch((err) => {
        const expectedErrorMessage = `Error: Unable to fetch information about test_domain`;
        expect(err.message).to.equal(expectedErrorMessage);
      });
    });

    it("Should log if SLS_DEBUG is set", async () => {
      const plugin = constructPlugin({});

      // set sls debug to true
      process.env.SLS_DEBUG = "True";
      plugin.logIfDebug("test message");
      expect(consoleOutput).to.contain("test message");
    });

    it("Should not log if SLS_DEBUG is not set", async () => {
      const plugin = constructPlugin({});

      plugin.logIfDebug("test message");
      expect(consoleOutput).to.not.contain("test message");
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
      process.env.SLS_DEBUG = "";
    });
  });

  describe("Summary Printing", () => {
    it("Prints Summary", async () => {
      AWS.mock("APIGateway", "getDomainName", (params, callback) => {
        callback(null, { domainName: params, distributionDomainName: "test_distributed_domain_name" });
      });
      const plugin = constructPlugin({domainName: "test_domain"});
      plugin.initializeVariables();
      plugin.apigateway = new aws.APIGateway();

      await plugin.domainSummary(plugin.domains[0]);
      expect(consoleOutput[0]).to.contain("Serverless Domain Manager Summary");
      expect(consoleOutput[1]).to.contain("Domain Name");
      expect(consoleOutput[2]).to.contain("test_domain");
      expect(consoleOutput[3]).to.contain("Distribution Domain Name");
      expect(consoleOutput[4]).to.contain("test_distributed_domain_name");
    });

    afterEach(() => {
      AWS.restore();
      consoleOutput = [];
    });
  });

  describe("Enable/disable functionality", () => {
    it("Should enable the plugin by default", () => {
      const plugin = constructPlugin({});

      plugin.initializeVariables();

      const returnedCreds = plugin.apigateway.config.credentials;
      expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
      expect(plugin.evaluateEnabled()).to.equal(true);
    });

    it("Should enable the plugin when passing a true parameter with type boolean", () => {
      const plugin = constructPlugin({ enabled: true });

      plugin.initializeVariables();

      const returnedCreds = plugin.apigateway.config.credentials;
      expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
      expect(plugin.domains[0].evaluateEnabled()).to.equal(true);
    });

    it("Should enable the plugin when passing a true parameter with type string", () => {
      const plugin = constructPlugin({ enabled: "true" });

      plugin.initializeVariables();

      const returnedCreds = plugin.apigateway.config.credentials;
      expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
      expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
      expect(plugin.domains[0].evaluateEnabled()).to.equal(true);
    });

    it("Should disable the plugin when passing a false parameter with type boolean", () => {
      const plugin = constructPlugin({ enabled: false });

      plugin.initializeVariables();

      expect(plugin.domains[0].evaluateEnabled()).to.equal(false);
    });

    it("Should disable the plugin when passing a false parameter with type string", () => {
      const plugin = constructPlugin({ enabled: "false" });

      plugin.initializeVariables();

      expect(plugin.domains[0].evaluateEnabled()).to.equal(false);
    });

    it("createDomain should do nothing when domain manager is disabled", async () => {
      const plugin = constructPlugin({ enabled: false });

      const result = await plugin.hookWrapper(plugin.createDomain);

      expect(plugin.domains[0].evaluateEnabled()).to.equal(false);
      expect(result).to.equal(undefined);
    });

    it("deleteDomain should do nothing when domain manager is disabled", async () => {
      const plugin = constructPlugin({ enabled: false });

      const result = await plugin.hookWrapper(plugin.deleteDomain);

      expect(plugin.domains[0].evaluateEnabled()).to.equal(false);
      expect(result).to.equal(undefined);
    });

    it("setUpBasePathMapping should do nothing when domain manager is disabled", async () => {
      const plugin = constructPlugin({ enabled: false });

      const result = await plugin.hookWrapper(plugin.setupBasePathMapping);

      expect(plugin.domains[0].evaluateEnabled()).to.equal(false);
      expect(result).to.equal(undefined);
    });

    it("removeBasePathMapping should do nothing when domain manager is disabled", async () => {
      const plugin = constructPlugin({ enabled: false });

      const result = await plugin.hookWrapper(plugin.removeBasePathMapping);

      expect(plugin.domains[0].evaluateEnabled()).to.equal(false);
      expect(result).to.equal(undefined);
    });

    it("domainSummary should do nothing when domain manager is disabled", async () => {
      const plugin = constructPlugin({ enabled: false });

      const result = await plugin.hookWrapper(plugin.domainSummary);

      expect(plugin.domains[0].evaluateEnabled()).to.equal(false);
      expect(result).to.equal(undefined);
    });

    it("Should throw an Error when passing a parameter that is not boolean", () => {
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

    afterEach(() => {
      consoleOutput = [];
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

    it("Should thrown an Error when Serverless custom configuration object is missing for multiple domains", () => {
      const plugin = constructPlugin({}, true);
      delete plugin.serverless.service.custom.customDomains;

      let errored = false;
      try {
        plugin.initializeVariables();
      } catch (err) {
        errored = true;
        expect(err.message).to.equal("serverless-domain-manager: Plugin configuration is missing.");
      }
      expect(errored).to.equal(true);
    });

    afterEach(() => {
      consoleOutput = [];
    });
  });
});

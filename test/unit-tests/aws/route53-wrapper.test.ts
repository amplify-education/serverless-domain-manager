import { consoleOutput, expect, getDomainConfig } from "../base";
import Globals from "../../../src/globals";
import Route53Wrapper = require("../../../src/aws/route53-wrapper");
import { mockClient } from "aws-sdk-client-mock";
import {
  ChangeAction,
  ChangeResourceRecordSetsCommand,
  ListHostedZonesCommand, ResourceRecordSetRegion,
  Route53Client, RRType
} from "@aws-sdk/client-route-53";
import DomainConfig = require("../../../src/models/domain-config");

describe("Route53 wrapper checks", () => {
  beforeEach(() => {
    consoleOutput.length = 0;
  });

  it("Initialization", () => {
    const route53Wrapper = new Route53Wrapper();
    const actualResult = route53Wrapper.route53.config[0].region;
    expect(actualResult).to.equal(Globals.currentRegion);
  });

  it("Initialization profile", () => {
    const credentials = {
      accessKeyId: "test_key_id",
      secretAccessKey: "test_access_key",
      sessionToken: "test_token"
    };
    const regionName = "test-region";
    const route53Wrapper = new Route53Wrapper(credentials, regionName);

    const actualRegion = route53Wrapper.route53.config[0].region;
    expect(actualRegion).to.equal(regionName);

    const actualCredentials = route53Wrapper.route53.config[0].credentials;
    expect(actualCredentials).to.equal(credentials);
  });

  it("get route53 hosted zone id", async () => {
    const testId = "test_host_id";
    const Route53Mock = mockClient(Route53Client);
    Route53Mock.on(ListHostedZonesCommand).resolves({
      HostedZones: [
        {
          CallerReference: "1",
          Config: { PrivateZone: false },
          Id: testId,
          Name: "test_domain"
        }, {
          CallerReference: "2",
          Config: { PrivateZone: false },
          Id: testId,
          Name: "dummy_test_domain"
        }, {
          CallerReference: "3",
          Config: { PrivateZone: false },
          Id: testId,
          Name: "domain"
        }
      ]
    });

    const dc = new DomainConfig(getDomainConfig({
      domainName: "test_domain"
    }));

    let actualId = await new Route53Wrapper().getRoute53HostedZoneId(dc);
    expect(actualId).to.equal(testId);

    const commandCalls = Route53Mock.commandCalls(ListHostedZonesCommand, {});
    expect(commandCalls.length).to.equal(1);

    dc.hostedZoneId = "test_id";
    actualId = await new Route53Wrapper().getRoute53HostedZoneId(dc);
    expect(actualId).to.equal(dc.hostedZoneId);
  });

  it("get route53 hosted zone id paginated", async () => {
    const testId = "test_host_id";
    const Route53Mock = mockClient(Route53Client);
    Route53Mock.on(ListHostedZonesCommand).resolvesOnce({
      HostedZones: [
        {
          CallerReference: "1",
          Config: { PrivateZone: false },
          Id: testId,
          Name: "test_domain"
        }, {
          CallerReference: "2",
          Config: { PrivateZone: false },
          Id: testId,
          Name: "dummy_test_domain"
        }, {
          CallerReference: "3",
          Config: { PrivateZone: false },
          Id: testId,
          Name: "domain"
        }
      ],
      NextMarker: "NextMarker"
    })
      .resolvesOnce({
        HostedZones: [
          {
            CallerReference: "4",
            Config: { PrivateZone: false },
            Id: testId,
            Name: "test_domain2"
          }, {
            CallerReference: "5",
            Config: { PrivateZone: false },
            Id: testId,
            Name: "dummy_test_domain2"
          }, {
            CallerReference: "6",
            Config: { PrivateZone: false },
            Id: testId,
            Name: "domain2"
          }
        ],
        NextMarker: "NextMarker"
      })
      .resolves({
        HostedZones: [
          {
            CallerReference: "7",
            Config: { PrivateZone: false },
            Id: testId,
            Name: "test_domain3"
          }, {
            CallerReference: "8",
            Config: { PrivateZone: false },
            Id: testId,
            Name: "dummy_test_domain3"
          }, {
            CallerReference: "9",
            Config: { PrivateZone: false },
            Id: testId,
            Name: "domain3"
          }
        ]
      });

    const dc = new DomainConfig(getDomainConfig({
      domainName: "test_domain"
    }));

    let actualId = await new Route53Wrapper().getRoute53HostedZoneId(dc);
    expect(actualId).to.equal(testId);

    const commandCalls = Route53Mock.commandCalls(ListHostedZonesCommand, {});
    expect(commandCalls.length).to.equal(3);

    dc.hostedZoneId = "test_id";
    actualId = await new Route53Wrapper().getRoute53HostedZoneId(dc);
    expect(actualId).to.equal(dc.hostedZoneId);
  });

  it("get route53 hosted zone id public", async () => {
    const testId = "test_host_id";
    const Route53Mock = mockClient(Route53Client);
    Route53Mock.on(ListHostedZonesCommand).resolves({
      HostedZones: [
        {
          CallerReference: "",
          Config: { PrivateZone: false },
          Id: "no_valid",
          Name: "api.test_domain"
        }, {
          CallerReference: "",
          Config: { PrivateZone: false },
          Id: testId,
          Name: "devapi.test_domain"
        }, {
          CallerReference: "",
          Config: { PrivateZone: false },
          Id: "dummy_host_id",
          Name: "test_domain"
        }
      ]
    });

    const dc = new DomainConfig(getDomainConfig({
      domainName: "devapi.test_domain"
    }));

    const actualId = await new Route53Wrapper().getRoute53HostedZoneId(dc, false);
    expect(actualId).to.equal(testId);

    const commandCalls = Route53Mock.commandCalls(ListHostedZonesCommand, {});
    expect(commandCalls.length).to.equal(1);
  });

  it("get route53 hosted zone id private", async () => {
    const testId = "test_host_id";
    const Route53Mock = mockClient(Route53Client);
    Route53Mock.on(ListHostedZonesCommand).resolves({
      HostedZones: [
        {
          CallerReference: "",
          Config: { PrivateZone: false },
          Id: "dummy_host_id",
          Name: "test_domain"
        }, {
          CallerReference: "",
          Config: { PrivateZone: true },
          Id: testId,
          Name: "test_domain"
        }
      ]
    });

    const dc = new DomainConfig(getDomainConfig({
      domainName: "test_domain"
    }));

    const actualId = await new Route53Wrapper().getRoute53HostedZoneId(dc, true);
    expect(actualId).to.equal(testId);

    const commandCalls = Route53Mock.commandCalls(ListHostedZonesCommand, {});
    expect(commandCalls.length).to.equal(1);
  });

  it("get route53 hosted zone id failure", async () => {
    const Route53Mock = mockClient(Route53Client);
    Route53Mock.on(ListHostedZonesCommand).rejects(null);

    const dc = new DomainConfig(getDomainConfig({
      domainName: "test_domain"
    }));

    let errored = false;
    try {
      await new Route53Wrapper().getRoute53HostedZoneId(dc);
    } catch (err) {
      errored = true;
      expect(err.message).to.contains("Unable to list hosted zones in Route53");
    }
    expect(errored).to.equal(true);
  });

  it("get route53 hosted zone not found", async () => {
    const Route53Mock = mockClient(Route53Client);
    Route53Mock.on(ListHostedZonesCommand).resolves({
      HostedZones: [
        {
          CallerReference: "1",
          Config: { PrivateZone: false },
          Id: "test_host_id",
          Name: "test_domain"
        }
      ]
    });

    const dc = new DomainConfig(getDomainConfig({
      domainName: "dummy_domain"
    }));

    let errored = false;
    try {
      await new Route53Wrapper().getRoute53HostedZoneId(dc);
    } catch (err) {
      errored = true;
      expect(err.message).to.contains("Could not find hosted zone");
    }
    expect(errored).to.equal(true);
  });

  it("change resource record set skip", async () => {
    const dc = new DomainConfig(getDomainConfig({
      domainName: "test_domain",
      createRoute53Record: false
    }));

    const actualResult = await new Route53Wrapper().changeResourceRecordSet(ChangeAction.UPSERT, dc);
    expect(actualResult).to.equal(undefined);
  });

  it("change resource record set", async () => {
    const Route53Mock = mockClient(Route53Client);
    Route53Mock.on(ListHostedZonesCommand).resolves({
      HostedZones: [{
        CallerReference: "",
        Config: { PrivateZone: false },
        Id: "test_host_id",
        Name: "test_domain"
      }]
    });
    Route53Mock.on(ChangeResourceRecordSetsCommand).resolves(null);

    const dc = new DomainConfig(getDomainConfig({
      domainName: "test_domain"
    }));

    await new Route53Wrapper().changeResourceRecordSet(ChangeAction.UPSERT, dc);

    const expectedParams = {
      ChangeBatch: {
        Changes: [
          {
            Action: ChangeAction.UPSERT,
            ResourceRecordSet: {
              AliasTarget: {
                DNSName: "test_domain",
                EvaluateTargetHealth: false,
                HostedZoneId: "test_host_id"
              },
              Name: "test_domain",
              Type: RRType.A
            }
          },
          {
            Action: ChangeAction.UPSERT,
            ResourceRecordSet: {
              AliasTarget: {
                DNSName: "test_domain",
                EvaluateTargetHealth: false,
                HostedZoneId: "test_host_id"
              },
              Name: "test_domain",
              Type: RRType.AAAA
            }
          }
        ],
        Comment: `Record created by "${Globals.pluginName}"`
      },
      HostedZoneId: "test_host_id"
    };
    const commandCalls = Route53Mock.commandCalls(ChangeResourceRecordSetsCommand, expectedParams);
    expect(commandCalls.length).to.equal(1);
  });

  it("change resource record set routing policy latency", async () => {
    const Route53Mock = mockClient(Route53Client);
    Route53Mock.on(ListHostedZonesCommand).resolves({
      HostedZones: [{
        CallerReference: "",
        Config: { PrivateZone: false },
        Id: "test_host_id",
        Name: "test_domain"
      }]
    });
    Route53Mock.on(ChangeResourceRecordSetsCommand).resolves(null);

    const dc = new DomainConfig(getDomainConfig({
      domainName: "test_domain",
      endpointType: Globals.endpointTypes.regional,
      route53Params: {
        routingPolicy: Globals.routingPolicies.latency
      }
    }));

    await new Route53Wrapper().changeResourceRecordSet(ChangeAction.UPSERT, dc);

    const expectedParams = {
      ChangeBatch: {
        Changes: [
          {
            Action: ChangeAction.UPSERT,
            ResourceRecordSet: {
              AliasTarget: {
                DNSName: "test_domain",
                EvaluateTargetHealth: false,
                HostedZoneId: "test_host_id"
              },
              Name: "test_domain",
              Type: RRType.A,
              Region: ResourceRecordSetRegion.us_east_1,
              SetIdentifier: "test_domain"
            }
          },
          {
            Action: ChangeAction.UPSERT,
            ResourceRecordSet: {
              AliasTarget: {
                DNSName: "test_domain",
                EvaluateTargetHealth: false,
                HostedZoneId: "test_host_id"
              },
              Name: "test_domain",
              Type: RRType.AAAA,
              Region: ResourceRecordSetRegion.us_east_1,
              SetIdentifier: "test_domain"
            }
          }
        ],
        Comment: `Record created by "${Globals.pluginName}"`
      },
      HostedZoneId: "test_host_id"
    };
    const commandCalls = Route53Mock.commandCalls(ChangeResourceRecordSetsCommand, expectedParams);
    expect(commandCalls.length).to.equal(1);
  });

  it("change resource record set routing policy weighted", async () => {
    const Route53Mock = mockClient(Route53Client);
    Route53Mock.on(ListHostedZonesCommand).resolves({
      HostedZones: [{
        CallerReference: "",
        Config: { PrivateZone: false },
        Id: "test_host_id",
        Name: "test_domain"
      }]
    });
    Route53Mock.on(ChangeResourceRecordSetsCommand).resolves(null);

    const dc = new DomainConfig(getDomainConfig({
      domainName: "test_domain",
      endpointType: Globals.endpointTypes.regional,
      route53Params: {
        routingPolicy: Globals.routingPolicies.weighted,
        weight: 1
      }
    }));

    await new Route53Wrapper().changeResourceRecordSet(ChangeAction.UPSERT, dc);

    const expectedParams = {
      ChangeBatch: {
        Changes: [
          {
            Action: ChangeAction.UPSERT,
            ResourceRecordSet: {
              AliasTarget: {
                DNSName: "test_domain",
                EvaluateTargetHealth: false,
                HostedZoneId: "test_host_id"
              },
              Name: "test_domain",
              Type: RRType.A,
              Weight: 1,
              SetIdentifier: "test_domain"
            }
          },
          {
            Action: ChangeAction.UPSERT,
            ResourceRecordSet: {
              AliasTarget: {
                DNSName: "test_domain",
                EvaluateTargetHealth: false,
                HostedZoneId: "test_host_id"
              },
              Name: "test_domain",
              Type: RRType.AAAA,
              Weight: 1,
              SetIdentifier: "test_domain"
            }
          }
        ],
        Comment: `Record created by "${Globals.pluginName}"`
      },
      HostedZoneId: "test_host_id"
    };
    const commandCalls = Route53Mock.commandCalls(ChangeResourceRecordSetsCommand, expectedParams);
    expect(commandCalls.length).to.equal(1);
  });

  it("change resource record set split horizon dns", async () => {
    const privateZone = "private_host_id";
    const publicZone = "public_host_id";
    const Route53Mock = mockClient(Route53Client);
    Route53Mock.on(ListHostedZonesCommand).resolves({
      HostedZones: [{
        CallerReference: "",
        Config: { PrivateZone: false },
        Id: publicZone,
        Name: "test_domain"
      }, {
        CallerReference: "",
        Config: { PrivateZone: true },
        Id: privateZone,
        Name: "test_domain"
      }
      ]
    });
    Route53Mock.on(ChangeResourceRecordSetsCommand).resolves(null);

    const dc = new DomainConfig(getDomainConfig({
      domainName: "test_domain",
      endpointType: Globals.endpointTypes.regional,
      splitHorizonDns: true
    }));

    await new Route53Wrapper().changeResourceRecordSet(ChangeAction.UPSERT, dc);

    const expectedParams1 = {
      ChangeBatch: {
        Changes: [
          {
            Action: ChangeAction.UPSERT,
            ResourceRecordSet: {
              AliasTarget: {
                DNSName: "test_domain",
                EvaluateTargetHealth: false,
                HostedZoneId: publicZone
              },
              Name: "test_domain",
              Type: RRType.A
            }
          },
          {
            Action: ChangeAction.UPSERT,
            ResourceRecordSet: {
              AliasTarget: {
                DNSName: "test_domain",
                EvaluateTargetHealth: false,
                HostedZoneId: publicZone
              },
              Name: "test_domain",
              Type: RRType.AAAA
            }
          }
        ],
        Comment: `Record created by "${Globals.pluginName}"`
      },
      HostedZoneId: publicZone
    };
    const commandCalls1 = Route53Mock.commandCalls(ChangeResourceRecordSetsCommand, expectedParams1, true);
    expect(commandCalls1.length).to.equal(1);

    const expectedParams2 = {
      ChangeBatch: {
        Changes: [
          {
            Action: ChangeAction.UPSERT,
            ResourceRecordSet: {
              AliasTarget: {
                DNSName: "test_domain",
                EvaluateTargetHealth: false,
                HostedZoneId: publicZone
              },
              Name: "test_domain",
              Type: RRType.A
            }
          },
          {
            Action: ChangeAction.UPSERT,
            ResourceRecordSet: {
              AliasTarget: {
                DNSName: "test_domain",
                EvaluateTargetHealth: false,
                HostedZoneId: publicZone
              },
              Name: "test_domain",
              Type: RRType.AAAA
            }
          }
        ],
        Comment: `Record created by "${Globals.pluginName}"`
      },
      HostedZoneId: privateZone
    };
    const commandCalls2 = Route53Mock.commandCalls(ChangeResourceRecordSetsCommand, expectedParams2, true);
    expect(commandCalls2.length).to.equal(1);
  });

  it("change resource record set failure", async () => {
    const privateZone = "private_host_id";
    const publicZone = "public_host_id";
    const Route53Mock = mockClient(Route53Client);
    Route53Mock.on(ListHostedZonesCommand).resolves({
      HostedZones: [{
        CallerReference: "",
        Config: { PrivateZone: false },
        Id: publicZone,
        Name: "test_domain"
      }, {
        CallerReference: "",
        Config: { PrivateZone: true },
        Id: privateZone,
        Name: "test_domain"
      }]
    });
    Route53Mock.on(ChangeResourceRecordSetsCommand).rejects(null);

    const dc = new DomainConfig(getDomainConfig({
      domainName: "test_domain",
      endpointType: Globals.endpointTypes.regional
    }));

    let errored = false;
    try {
      await new Route53Wrapper().changeResourceRecordSet("UPSERT", dc);
    } catch (err) {
      errored = true;
      expect(err.message).to.contains("Failed to UPSERT");
    }
    expect(errored).to.equal(true);
  });
});

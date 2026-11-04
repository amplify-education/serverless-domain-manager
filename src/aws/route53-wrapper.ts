import Globals from "../globals";
import DomainConfig = require("../models/domain-config");
import Logging from "../logging";
import {
  ChangeResourceRecordSetsCommand,
  HostedZone,
  ListHostedZonesCommand,
  ListHostedZonesCommandInput,
  ListHostedZonesCommandOutput,
  Route53Client, RRType, ChangeAction
} from "@aws-sdk/client-route-53";
import { getAWSPagedResults } from "../utils";

class Route53Wrapper {
  public route53: Route53Client;
  private readonly region: string;
  private hostedZones?: Promise<HostedZone[]>;

  constructor (credentials?: any, region?: string) {
    // not null and not undefined
    const serviceEndpoint = Globals.getServiceEndpoint("route53");
    if (credentials) {
      this.region = region || Globals.getRegion();
      this.route53 = new Route53Client({
        credentials,
        region: this.region,
        retryStrategy: Globals.getRetryStrategy(),
        requestHandler: Globals.getRequestHandler(),
        endpoint: serviceEndpoint
      });
    } else {
      this.region = Globals.getRegion();
      this.route53 = new Route53Client({
        region: this.region,
        retryStrategy: Globals.getRetryStrategy(),
        requestHandler: Globals.getRequestHandler(),
        endpoint: serviceEndpoint
      });
    }
  }

  /**
   * Lists all hosted zones once per wrapper instance; a record change may need the
   * zone lookup several times (e.g. public and private zones for split-horizon DNS)
   */
  private listHostedZones (): Promise<HostedZone[]> {
    if (!this.hostedZones) {
      this.hostedZones = getAWSPagedResults<HostedZone, ListHostedZonesCommandInput, ListHostedZonesCommandOutput>(
        this.route53,
        "HostedZones",
        "Marker",
        "NextMarker",
        new ListHostedZonesCommand({})
      ).then((hostedZones) => {
        Logging.logInfo(`Found hosted zones list: ${hostedZones.map((zone) => zone.Name)}.`);
        return hostedZones;
      });
    }
    return this.hostedZones;
  }

  /**
   * Gets Route53 HostedZoneId from user or from AWS
   */
  public async getRoute53HostedZoneId (domain: DomainConfig, isHostedZonePrivate?: boolean): Promise<string> {
    if (domain.hostedZoneId) {
      Logging.logInfo(`Selected specific hostedZoneId ${domain.hostedZoneId}`);
      return domain.hostedZoneId;
    }

    const isPrivateDefined = typeof isHostedZonePrivate !== "undefined";
    if (isPrivateDefined) {
      const zoneTypeString = isHostedZonePrivate ? "private" : "public";
      Logging.logInfo(`Filtering to only ${zoneTypeString} zones.`);
    }

    let hostedZones: HostedZone[];
    try {
      hostedZones = await this.listHostedZones();
    } catch (err) {
      throw new Error(`Unable to list hosted zones in Route53.\n${err.message}`, { cause: err });
    }

    // DNS names are case-insensitive; match whole labels so api.myexample.com never lands in example.com
    const domainName = domain.givenDomainName.toLowerCase();
    const targetHostedZone = hostedZones
      .filter((hostedZone) => {
        return !isPrivateDefined || isHostedZonePrivate === hostedZone.Config.PrivateZone;
      })
      .filter((hostedZone) => {
        const hostedZoneName = hostedZone.Name.replace(/\.$/, "").toLowerCase();
        return domainName === hostedZoneName || domainName.endsWith(`.${hostedZoneName}`);
      })
      .sort((zone1, zone2) => zone2.Name.length - zone1.Name.length)
      .shift();

    if (targetHostedZone) {
      return targetHostedZone.Id.replace("/hostedzone/", "");
    } else {
      throw new Error(`Could not find hosted zone '${domain.givenDomainName}'`);
    }
  }

  /**
   * Change A Alias record through Route53 based on given action
   * @param action: String descriptor of change to be made. Valid actions are ['UPSERT', 'DELETE']
   * @param domain: DomainInfo object containing info about custom domain
   */
  public async changeResourceRecordSet (action: ChangeAction, domain: DomainConfig): Promise<void> {
    if (domain.createRoute53Record === false) {
      Logging.logInfo(`Skipping ${action === ChangeAction.DELETE ? "removal" : "creation"} of Route53 record.`);
      return;
    }
    Logging.logInfo(
      `${action === ChangeAction.DELETE ? "Removing" : "Creating/updating"} route53 record for '${domain.givenDomainName}'.`
    );
    // Set up parameters
    const route53HostedZoneId = await this.getRoute53HostedZoneId(domain, domain.hostedZonePrivate);
    const route53Params = domain.route53Params;
    const route53healthCheck = route53Params.healthCheckId ? { HealthCheckId: route53Params.healthCheckId } : {};
    const domainInfo = domain.domainInfo ?? {
      domainName: domain.givenDomainName,
      hostedZoneId: route53HostedZoneId
    };

    let routingOptions = {};
    if (route53Params.routingPolicy === Globals.routingPolicies.latency) {
      routingOptions = {
        Region: this.region,
        SetIdentifier: route53Params.setIdentifier ?? domainInfo.domainName,
        ...route53healthCheck
      };
    }

    if (route53Params.routingPolicy === Globals.routingPolicies.weighted) {
      routingOptions = {
        Weight: route53Params.weight,
        SetIdentifier: route53Params.setIdentifier ?? domainInfo.domainName,
        ...route53healthCheck
      };
    }

    let hostedZoneIds: string[];
    if (domain.splitHorizonDns) {
      hostedZoneIds = await Promise.all([
        this.getRoute53HostedZoneId(domain, false),
        this.getRoute53HostedZoneId(domain, true)
      ]);
    } else {
      hostedZoneIds = [route53HostedZoneId];
    }

    const recordsToCreate = domain.createRoute53IPv6Record ? [RRType.A, RRType.AAAA] : [RRType.A];
    for (const hostedZoneId of hostedZoneIds) {
      const changes = recordsToCreate.map((Type) => ({
        Action: action,
        ResourceRecordSet: {
          AliasTarget: {
            DNSName: domainInfo.domainName,
            EvaluateTargetHealth: false,
            HostedZoneId: domainInfo.hostedZoneId
          },
          Name: domain.givenDomainName,
          Type,
          ...routingOptions
        }
      }));

      const params = {
        ChangeBatch: {
          Changes: changes,
          Comment: `Record created by "${Globals.pluginName}"`
        },
        HostedZoneId: hostedZoneId
      };
      // Make API call
      try {
        await this.route53.send(new ChangeResourceRecordSetsCommand(params));
      } catch (err) {
        throw new Error(
          `Failed to ${action} ${recordsToCreate.join(",")} Alias for '${domain.givenDomainName}':\n
                    ${err.message}`,
          { cause: err }
        );
      }
    }
  }
}

export = Route53Wrapper;

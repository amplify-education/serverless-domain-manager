import { expect } from "./base";
import { getAWSPagedResults } from "../../src/utils";
import { mockClient } from "aws-sdk-client-mock";
import { ACMClient, ListCertificatesCommand } from "@aws-sdk/client-acm";
import { Client } from "@aws-sdk/smithy-client";
import {
  APIGatewayClient,
  GetBasePathMappingsCommand,
} from "@aws-sdk/client-api-gateway";
import {
  ApiGatewayV2Client,
  GetApiMappingsCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  CloudFormationClient,
  ListExportsCommand,
} from "@aws-sdk/client-cloudformation";
import {
  ListHostedZonesCommand,
  Route53Client,
} from "@aws-sdk/client-route-53";

describe("Utils checks", () => {
  describe("acm-wrapper", () => {
    it("get all certificates", async () => {
      const ACMCMock = mockClient(ACMClient);
      ACMCMock.on(ListCertificatesCommand)
        .resolvesOnce({
          CertificateSummaryList: [
            {
              CertificateArn: "test_certificate_arn",
              DomainName: "test_domain",
              Status: "ISSUED",
            },
          ],
          NextToken:
            '{"CertificateArn": "test_certificate_arn2","DomainName": "test_domain2","Status": "ISSUED"}',
        })
        .resolves({
          CertificateSummaryList: [
            {
              CertificateArn: "test_certificate_arn2",
              DomainName: "test_domain2",
              Status: "ISSUED",
            },
          ],
        });

      const certStatuses = ["PENDING_VALIDATION", "ISSUED", "INACTIVE"];

      const certs = await getAWSPagedResults(
        ACMCMock as unknown as Client<any, any, any, any>,
        "CertificateSummaryList",
        "NextToken",
        "NextToken",
        new ListCertificatesCommand({ CertificateStatuses: certStatuses })
      );
      expect(certs.length).to.equal(2);
      expect(ACMCMock.calls().length).to.equal(2);
    });
  });

  describe("api-gateway-v1-wrapper", () => {
    it("get all base path mappings", async () => {
      const APIGatewayCMock = mockClient(APIGatewayClient);
      APIGatewayCMock.on(GetBasePathMappingsCommand)
        .resolvesOnce({
          items: [
            {
              restApiId: "1",
              basePath: "test_domain",
              stage: "mock",
            },
          ],
          position: "position",
        })
        .resolves({
          items: [
            {
              restApiId: "2",
              basePath: "test_domain2",
              stage: "mock",
            },
          ],
        });

      const items = await getAWSPagedResults(
        APIGatewayCMock as unknown as Client<any, any, any, any>,
        "items",
        "position",
        "position",
        new GetBasePathMappingsCommand({
          domainName: "domain",
        })
      );
      expect(items.length).to.equal(2);
      expect(APIGatewayCMock.calls().length).to.equal(2);
    });
  });

  describe("api-gateway-v2-wrapper", () => {
    it("get all api mappings", async () => {
      const APIGatewayV2CMock = mockClient(ApiGatewayV2Client);
      APIGatewayV2CMock.on(GetApiMappingsCommand)
        .resolvesOnce({
          Items: [
            {
              ApiId: "ApiId",
              ApiMappingKey: "ApiMappingKey",
              Stage: "mock",
              ApiMappingId: "ApiMappingId",
            },
          ],
          NextToken: 'NextToken',
        })
        .resolvesOnce({
          Items: [
            {
              ApiId: "ApiId4",
              ApiMappingKey: "ApiMappingKey4",
              Stage: "mock",
              ApiMappingId: "ApiMappingId4",
            },
          ],
          NextToken: 'NextToken',
        })
        .resolves({
          Items: [
            {
              ApiId: "ApiId2",
              ApiMappingKey: "ApiMappingKey2",
              Stage: "mock",
              ApiMappingId: "ApiMappingId2",
            },
            {
              ApiId: "ApiId3",
              ApiMappingKey: "ApiMappingKey3",
              Stage: "mock",
              ApiMappingId: "ApiMappingId3",
            },
          ],
        });

      const items = await getAWSPagedResults(
        APIGatewayV2CMock as unknown as Client<any, any, any, any>,
        "Items",
        "NextToken",
        "NextToken",
        new GetApiMappingsCommand({
          DomainName: "domain",
        })
      );
      expect(items.length).to.equal(4);
      expect(APIGatewayV2CMock.calls().length).to.equal(3);
    });
  });

  describe("cloud-formation-wrapper", () => {
    it("get all exports", async () => {
      const CloudFormationCMock = mockClient(CloudFormationClient);
      CloudFormationCMock.on(ListExportsCommand)
        .resolvesOnce({
          Exports: [
            {
              Name: "Name1",
            },
            {
              Name: "Name4",
            },
          ],
          NextToken: 'NextToken',
        })
        .resolves({
          Exports: [
            {
              Name: "Name2",
            },
            {
              Name: "Name3",
            },
          ],
        });

      const items = await getAWSPagedResults(
        CloudFormationCMock as unknown as Client<any, any, any, any>,
        "Exports",
        "NextToken",
        "NextToken",
        new ListExportsCommand({})
      );
      expect(items.length).to.equal(4);
      expect(CloudFormationCMock.calls().length).to.equal(2);
    });      
  });

  describe("route53-wrapper", () => {
    it("get all hosted zones", async () => {
      const Route53CMock = mockClient(Route53Client);
      Route53CMock.on(ListHostedZonesCommand)
        .resolvesOnce({
          HostedZones: [
            {
              Id: "Id1",
              Name: "Name1",
              CallerReference: "CallerReference1",
            },
            {
              Id: "Id2",
              Name: "Name2",
              CallerReference: "CallerReference2",
            },
          ],
          NextMarker: 'NextMarker',
        })
        .resolves({
          HostedZones: [
            {
              Id: "Id3",
              Name: "Name3",
              CallerReference: "CallerReference3",
            },
            {
              Id: "Id4",
              Name: "Name4",
              CallerReference: "CallerReference4",
            },
          ],
        });

      const items = await getAWSPagedResults(
        Route53CMock as unknown as Client<any, any, any, any>,
        "HostedZones",
        "Marker",
        "NextMarker",
        new ListHostedZonesCommand({})
      );
      expect(items.length).to.equal(4);
      expect(Route53CMock.calls().length).to.equal(2);
    });
  });
});

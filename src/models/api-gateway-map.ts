class ApiGatewayMap {
  public apiId: string;
  public basePath: string;
  public stage: string;
  public apiMappingId: string | null;

  constructor (apiId: string, basePath: string, stage: string, apiMappingId: string | null) {
    this.apiId = apiId;
    this.basePath = basePath;
    this.stage = stage;
    this.apiMappingId = apiMappingId;
  }
}

export = ApiGatewayMap;

import { ServerlessInstance, ServerlessOptions } from "./types";

export default class Globals {

    public static serverless: ServerlessInstance;
    public static options: ServerlessOptions;

    public static endpointTypes = {
        edge: "EDGE",
        regional: "REGIONAL",
    };

    public static apiTypes = {
        http: "HTTP",
        rest: "REST",
        websocket: "WEBSOCKET",
    };

    public static tlsVersions = {
        tls_1_0: "TLS_1_0",
        tls_1_2: "TLS_1_2",
    };
}

import DomainInfo = require("./domain-info");
import ApiGatewayMap = require("./api-gateway-map");
import DomainConfig = require("./domain-config");
import Globals from "../globals";
import Logging from "../logging";

abstract class APIGatewayBase {
    protected abstract readonly versionPrefix: string;

    abstract createCustomDomain(domain: DomainConfig): Promise<DomainInfo>;

    abstract getCustomDomain(domain: DomainConfig, silent?: boolean): Promise<DomainInfo>;

    abstract deleteCustomDomain(domain: DomainConfig): Promise<void>;

    abstract createBasePathMapping(domain: DomainConfig): Promise<void>;

    abstract getBasePathMappings(domain: DomainConfig): Promise<ApiGatewayMap[]>;

    abstract updateBasePathMapping(domain: DomainConfig): Promise<void>;

    abstract deleteBasePathMapping(domain: DomainConfig): Promise<void>;

    /**
     * Gets the domainNameId for a private custom domain.
     * Returns undefined for non-private domains or if not found.
     */
    protected async getDomainNameIdForPrivateDomain (domain: DomainConfig): Promise<string | undefined> {
        if (domain.endpointType !== Globals.endpointTypes.private) {
            return undefined;
        }
        if (domain.domainInfo?.domainNameId) {
            return domain.domainInfo.domainNameId;
        }
        return this.fetchPrivateDomainNameId(domain);
    }

    /**
     * Resolves domainNameId for private domains used in getCustomDomain.
     * Returns the domainNameId, or undefined if not private.
     * Returns null to signal the caller should return early (not found).
     */
    protected async resolvePrivateDomainNameId (
        domain: DomainConfig, silent: boolean
    ): Promise<string | undefined | null> {
        if (domain.endpointType !== Globals.endpointTypes.private) {
            return undefined;
        }
        const domainNameId = await this.getDomainNameIdForPrivateDomain(domain);
        if (!domainNameId) {
            if (!silent) {
                throw new Error(
                    `${this.versionPrefix} - Unable to find domainNameId for private domain '${domain.givenDomainName}'`
                );
            }
            Logging.logWarning(
                `${this.versionPrefix} - '${domain.givenDomainName}' does not exist or is not a private domain.`
            );
            return null;
        }
        return domainNameId;
    }

    /**
     * Version-specific: lists domains via API to find the domainNameId for a private domain.
     */
    protected abstract fetchPrivateDomainNameId(domain: DomainConfig): Promise<string | undefined>;
}

export = APIGatewayBase;

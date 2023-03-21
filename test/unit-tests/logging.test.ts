import {consoleOutput, expect, getDomainConfig} from "./base";
import Logging from "../../src/logging";
import Globals from "../../src/globals";
import DomainConfig = require("../../src/models/domain-config");
import DomainInfo = require("../../src/models/domain-info");

describe("Logging checks", () => {
    beforeEach(() => {
        consoleOutput.length = 0;
    });

    it("cliLog", () => {
        Logging.cliLog("test", "message");
        expect(consoleOutput[0]).to.equal("test message");
    });

    describe("V2 logging", () => {
        it("logging test", () => {
            Logging.logError("message");
            expect(consoleOutput[0]).to.equal("[Error] message");
            Logging.logInfo("message");
            expect(consoleOutput[1]).to.equal("[Info] message");
            Logging.logWarning("message");
            expect(consoleOutput[2]).to.equal("[WARNING] message");

            const dc = new DomainConfig(getDomainConfig({
                domainName: "test_domain"
            }));
            dc.domainInfo = new DomainInfo({
                domainName: "dummy_domain",
                hostedZoneId: "test_hosted_zone"
            })

            Logging.printDomainSummary([dc]);

            expect(consoleOutput[3]).to.equal("[Summary] Distribution Domain Name");
        });
    });

    describe("V3 logging", () => {
        before(() => {
            Globals.v3Utils = {
                writeText: (message: string) => {
                    consoleOutput.push(message);
                },
                log: {
                    error(message: string) {
                        consoleOutput.push("V3 [Error] " + message);
                    },
                    verbose(message: string) {
                        consoleOutput.push("V3 [Info] " + message);
                    },
                    warning(message: string) {
                        consoleOutput.push("V3 [WARNING] " + message);
                    }
                },
                progress: null
            }
            Globals.serverless.addServiceOutputSection = (name: string, data: string[]) => {
                consoleOutput.push(name);

                data.map((item) => {
                    consoleOutput.push(item);
                })
            }
        });
        it("logging test", () => {
            Logging.logError("message");
            expect(consoleOutput[0]).to.equal("V3 [Error] message");
            Logging.logInfo("message");
            expect(consoleOutput[1]).to.equal("V3 [Info] message");
            Logging.logWarning("message");
            expect(consoleOutput[2]).to.equal("V3 [WARNING] message");

            const dc = new DomainConfig(getDomainConfig({
                domainName: "test_domain"
            }));
            dc.domainInfo = new DomainInfo({
                domainName: "dummy_domain",
                hostedZoneId: "test_hosted_zone"
            })

            Logging.printDomainSummary([dc]);
            expect(consoleOutput[3]).to.equal("Serverless Domain Manager");
        });
    });
});

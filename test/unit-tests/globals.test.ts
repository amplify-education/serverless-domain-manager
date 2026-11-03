import { consoleOutput, expect } from "./base";
import Globals from "../../src/globals";

describe("Globals checks", () => {
  describe("getMaxAttempts", () => {
    const envName = "SLS_DOMAIN_MANAGER_MAX_RETRIES";
    let original: string | undefined;

    beforeEach(() => {
      original = process.env[envName];
      consoleOutput.length = 0;
      Globals.maxRetriesWarnedValue = undefined;
    });

    afterEach(() => {
      if (original === undefined) {
        delete process.env[envName];
      } else {
        process.env[envName] = original;
      }
    });

    it("defaults to 5 attempts when the variable is unset", () => {
      delete process.env[envName];
      expect(Globals.getMaxAttempts()).to.equal(5);
      expect(consoleOutput).to.have.length(0);
    });

    it("defaults to 5 attempts without a warning when the variable is empty", () => {
      process.env[envName] = " ";
      expect(Globals.getMaxAttempts()).to.equal(5);
      expect(consoleOutput).to.have.length(0);
    });

    it("adds one attempt to the configured retries", () => {
      process.env[envName] = "10";
      expect(Globals.getMaxAttempts()).to.equal(11);
      expect(consoleOutput).to.have.length(0);
    });

    it("allows the limit of 20 retries", () => {
      process.env[envName] = "20";
      expect(Globals.getMaxAttempts()).to.equal(21);
      expect(consoleOutput).to.have.length(0);
    });

    it("allows zero retries", () => {
      process.env[envName] = "0";
      expect(Globals.getMaxAttempts()).to.equal(1);
    });

    it("caps the retries at the limit of 20 with a warning", () => {
      process.env[envName] = "100";
      expect(Globals.getMaxAttempts()).to.equal(21);
      expect(consoleOutput).to.have.length(1);
      expect(consoleOutput[0]).to.contain(`${envName}='100' must be a whole number from 0 to 20, using 20 retries.`);
    });

    for (const value of ["abc", "2.5", "-1", "3abc", "1e1", "0x10"]) {
      it(`defaults to 5 attempts with a warning for the invalid value '${value}'`, () => {
        process.env[envName] = value;
        expect(Globals.getMaxAttempts()).to.equal(5);
        expect(consoleOutput).to.have.length(1);
        expect(consoleOutput[0]).to.contain(`${envName}='${value}' must be a whole number from 0 to 20, using 4 retries.`);
      });
    }

    it("warns only once for the same invalid value", () => {
      process.env[envName] = "abc";
      Globals.getMaxAttempts();
      Globals.getMaxAttempts();
      expect(consoleOutput).to.have.length(1);
    });

    it("passes the configured retries to the retry strategy", async () => {
      process.env[envName] = "9";
      // zero delays: newer SDK versions wait out the backoff inside refreshRetryTokenForRetry
      const strategy = Globals.getRetryStrategy(undefined, 0, 0);
      let token = await strategy.acquireInitialRetryToken("test");
      let retries = 0;
      try {
        for (;;) {
          token = await strategy.refreshRetryTokenForRetry(token, { errorType: "THROTTLING" });
          retries++;
        }
      } catch {
        // The strategy throws once it runs out of attempts.
      }
      expect(retries).to.equal(9);
    });
  });
});

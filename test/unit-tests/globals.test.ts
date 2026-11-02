import { expect } from "./base";
import Globals from "../../src/globals";

describe("Globals checks", () => {
  describe("getMaxAttempts", () => {
    const envName = "SLS_DOMAIN_MANAGER_MAX_RETRIES";
    let original: string | undefined;

    beforeEach(() => {
      original = process.env[envName];
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
    });

    it("adds one attempt to the configured retries", () => {
      process.env[envName] = "20";
      expect(Globals.getMaxAttempts()).to.equal(21);
    });

    it("allows zero retries", () => {
      process.env[envName] = "0";
      expect(Globals.getMaxAttempts()).to.equal(1);
    });

    it("defaults to 5 attempts for an invalid value", () => {
      for (const value of ["", "abc", "2.5", "-1", "3abc"]) {
        process.env[envName] = value;
        expect(Globals.getMaxAttempts(), value).to.equal(5);
      }
    });

    it("passes the configured retries to the retry strategy", async () => {
      process.env[envName] = "9";
      const strategy = Globals.getRetryStrategy();
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

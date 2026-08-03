import { describe, expect, it } from "vitest";
import { selfHostDomain, selfHostWorkerRouting } from "../../alchemy.access";

describe("selfHostDomain", () => {
  it("uses the configured custom domain for the Worker and Access boundary", () => {
    expect(
      selfHostDomain({
        stage: "selfhost",
        workersSubdomain: "account.workers.dev",
        customDomain: "openseo.ighenatt.es",
      }),
    ).toBe("openseo.ighenatt.es");
  });

  it("preserves the workers.dev hostname when no custom domain is configured", () => {
    expect(
      selfHostDomain({
        stage: "selfhost",
        workersSubdomain: "account.workers.dev",
        customDomain: "",
      }),
    ).toBe("open-seo-selfhost.account.workers.dev");
  });

  it.each(["https://openseo.ighenatt.es", "openseo.ighenatt.es/path"])(
    "rejects a custom domain that is not a bare hostname: %s",
    (customDomain) => {
      expect(() =>
        selfHostDomain({
          stage: "selfhost",
          workersSubdomain: "account.workers.dev",
          customDomain,
        }),
      ).toThrow("bare hostname");
    },
  );
});

describe("selfHostWorkerRouting", () => {
  it("disables the public workers.dev route when a custom domain is configured", () => {
    expect(selfHostWorkerRouting("openseo.ighenatt.es")).toEqual({
      domain: ["openseo.ighenatt.es"],
      url: false,
    });
  });

  it("preserves the default workers.dev route without a custom domain", () => {
    expect(selfHostWorkerRouting("")).toEqual({
      domain: undefined,
      url: undefined,
    });
  });
});

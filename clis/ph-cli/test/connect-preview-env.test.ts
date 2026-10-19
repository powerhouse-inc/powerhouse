import { describe, expect, it } from "vitest";
import { overrideFromEnv } from "../src/services/connect-preview.js";

describe("overrideFromEnv (the supervisor env contract, P5.7)", () => {
  it("returns undefined when neither variable is set", () => {
    expect(overrideFromEnv({})).toBeUndefined();
  });

  it("builds the drives override from comma-separated urls", () => {
    const override = overrideFromEnv({
      PH_CONNECT_DEFAULT_DRIVES_URL:
        "http://localhost:4001/d/a, http://localhost:4001/d/b",
    });
    expect(override?.connect?.drives).toEqual({
      defaultDrives: [
        { url: "http://localhost:4001/d/a", name: null, icon: null },
        { url: "http://localhost:4001/d/b", name: null, icon: null },
      ],
      preserveStrategy: "preserve-all",
    });
    expect(override?.cspRegistrySync).toBeUndefined();
  });

  it("registry env turns on the CSP sync and overrides the served registry", () => {
    const override = overrideFromEnv({
      PH_CONNECT_PACKAGES_REGISTRY: "https://registry.vetra.io",
    });
    expect(override?.packageRegistryUrl).toBe("https://registry.vetra.io");
    expect(override?.cspRegistrySync).toBe(true);
  });

  it("honors an explicit preserve strategy", () => {
    const override = overrideFromEnv({
      PH_CONNECT_DEFAULT_DRIVES_URL: "http://x/d/y",
      PH_CONNECT_DRIVES_PRESERVE_STRATEGY: "preserve-by-url",
    });
    expect(override?.connect?.drives?.preserveStrategy).toBe("preserve-by-url");
  });
});

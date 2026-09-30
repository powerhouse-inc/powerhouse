import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { initFeatureFlags } from "../src/feature-flags.js";
import { MCP_ENABLED, resolveMcpEnabled } from "../src/mcp-flag.mjs";
import type { BooleanFlagSource } from "../src/workflow-runtime.mjs";

describe("resolveMcpEnabled", () => {
  let featureFlags: BooleanFlagSource;

  beforeAll(async () => {
    featureFlags = await initFeatureFlags();
  });

  afterEach(() => {
    delete process.env[MCP_ENABLED];
  });

  it("defaults to on", async () => {
    await expect(resolveMcpEnabled({ featureFlags })).resolves.toBe(true);
    await expect(
      resolveMcpEnabled({ featureFlags, option: true }),
    ).resolves.toBe(true);
  });

  it('is turned off by MCP_ENABLED="false"', async () => {
    process.env[MCP_ENABLED] = "false";

    await expect(resolveMcpEnabled({ featureFlags })).resolves.toBe(false);
  });

  // `ph vetra` passes `mcp: true` explicitly; the env var still wins.
  it("turns off a host that asked for MCP", async () => {
    process.env[MCP_ENABLED] = "false";

    await expect(
      resolveMcpEnabled({ featureFlags, option: true }),
    ).resolves.toBe(false);
  });

  it("never turns on a host that switched MCP off", async () => {
    process.env[MCP_ENABLED] = "true";

    await expect(
      resolveMcpEnabled({ featureFlags, option: false }),
    ).resolves.toBe(false);
  });

  it("leaves MCP on for any value but the string false", async () => {
    for (const raw of ["true", "0", "no", ""]) {
      process.env[MCP_ENABLED] = raw;
      await expect(
        resolveMcpEnabled({ featureFlags }),
        `MCP_ENABLED=${JSON.stringify(raw)}`,
      ).resolves.toBe(true);
    }
  });
});

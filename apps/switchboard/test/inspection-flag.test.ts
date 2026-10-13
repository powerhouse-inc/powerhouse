import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { initFeatureFlags } from "../src/feature-flags.js";
import {
  INSPECTION_ENABLED,
  resolveInspectionEnabled,
} from "../src/inspection-flag.mjs";
import type { BooleanFlagSource } from "../src/workflow-runtime.mjs";

describe("resolveInspectionEnabled", () => {
  let featureFlags: BooleanFlagSource;

  beforeAll(async () => {
    featureFlags = await initFeatureFlags();
  });

  afterEach(() => {
    delete process.env[INSPECTION_ENABLED];
  });

  it("defaults to on", async () => {
    await expect(resolveInspectionEnabled({ featureFlags })).resolves.toBe(
      true,
    );
    await expect(
      resolveInspectionEnabled({ featureFlags, option: true }),
    ).resolves.toBe(true);
  });

  it('is turned off by INSPECTION_ENABLED="false"', async () => {
    process.env[INSPECTION_ENABLED] = "false";

    await expect(resolveInspectionEnabled({ featureFlags })).resolves.toBe(
      false,
    );
  });

  it("turns off a host that asked for inspection", async () => {
    process.env[INSPECTION_ENABLED] = "false";

    await expect(
      resolveInspectionEnabled({ featureFlags, option: true }),
    ).resolves.toBe(false);
  });

  it("never turns on a host that switched inspection off", async () => {
    process.env[INSPECTION_ENABLED] = "true";

    await expect(
      resolveInspectionEnabled({ featureFlags, option: false }),
    ).resolves.toBe(false);
  });

  it("leaves inspection on for any value but the string false", async () => {
    for (const raw of ["true", "0", "no", ""]) {
      process.env[INSPECTION_ENABLED] = raw;
      await expect(
        resolveInspectionEnabled({ featureFlags }),
        `INSPECTION_ENABLED=${JSON.stringify(raw)}`,
      ).resolves.toBe(true);
    }
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { classicSwitchboardArgs } from "../src/services/classic-args.js";
import {
  switchboardConfigOf,
  type StartSwitchboardOptions,
} from "../src/services/switchboard.js";

// The parsed CLI defaults, so every required option is present.
async function configFor(overrides: Partial<StartSwitchboardOptions>) {
  const args = await classicSwitchboardArgs([]);
  return switchboardConfigOf({ ...args, remoteDrives: [], ...overrides })
    .config;
}

describe("ph switchboard default drive", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("builds the default drive from switchboard.drive and PH_DEFAULT_DRIVE_*", async () => {
    vi.stubEnv("PH_DEFAULT_DRIVE_NAME", "Tenant");
    const config = await configFor({
      fileDrive: { id: "acme", preferredEditor: "acme-app" },
    });
    expect(config.drive).toMatchObject({
      id: "acme",
      slug: "acme",
      global: { name: "Tenant" },
      preferredEditor: "acme-app",
    });
  });

  it("still creates no default drive when remote drives are given", async () => {
    vi.stubEnv("PH_DEFAULT_DRIVE_ID", "tenant");
    const config = await configFor({
      remoteDrives: ["https://remote/d/x"],
    });
    expect(config.drive).toBeUndefined();
  });

  it("leaves ph vetra's drive alone", async () => {
    vi.stubEnv("PH_DEFAULT_DRIVE_ID", "tenant");
    const config = await configFor({
      useVetraDrive: true,
      vetraDriveId: "vetra-123",
    });
    expect(config.drive).toMatchObject({
      id: "vetra-123",
      global: { name: "Vetra" },
    });
  });

  it("creates no default drive when the host declares drives", async () => {
    const config = await configFor({
      drive: undefined,
      fileDrive: { id: "acme" },
    });
    expect(config.drive).toBeUndefined();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { switchboardConfigOf } from "../src/services/switchboard.js";

describe("ph switchboard default drive", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("builds the default drive from switchboard.drive and PH_DEFAULT_DRIVE_*", () => {
    vi.stubEnv("PH_DEFAULT_DRIVE_NAME", "Tenant");
    const { config } = switchboardConfigOf({
      remoteDrives: [],
      fileDrive: { id: "acme", preferredEditor: "acme-app" },
    } as Parameters<typeof switchboardConfigOf>[0]);
    expect(config.drive).toMatchObject({
      id: "acme",
      slug: "acme",
      global: { name: "Tenant" },
      preferredEditor: "acme-app",
    });
  });

  it("still creates no default drive when remote drives are given", () => {
    vi.stubEnv("PH_DEFAULT_DRIVE_ID", "tenant");
    const { config } = switchboardConfigOf({
      remoteDrives: ["https://remote/d/x"],
    } as Parameters<typeof switchboardConfigOf>[0]);
    expect(config.drive).toBeUndefined();
  });

  it("leaves ph vetra's drive alone", () => {
    vi.stubEnv("PH_DEFAULT_DRIVE_ID", "tenant");
    const { config } = switchboardConfigOf({
      remoteDrives: [],
      useVetraDrive: true,
      vetraDriveId: "vetra-123",
    } as Parameters<typeof switchboardConfigOf>[0]);
    expect(config.drive).toMatchObject({
      id: "vetra-123",
      global: { name: "Vetra" },
    });
  });
});

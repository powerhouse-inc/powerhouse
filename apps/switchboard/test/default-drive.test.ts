import {
  DEFAULT_DRIVE_ICON,
  type PHSwitchboardDriveConfig,
} from "@powerhousedao/shared/clis";
import { describe, expect, it } from "vitest";
import { defaultDrive } from "../src/config/default-drive.js";

describe("defaultDrive", () => {
  it("is today's drive when nothing is set", () => {
    expect(defaultDrive({})).toEqual({
      id: "powerhouse",
      slug: "powerhouse",
      global: { name: "Powerhouse", icon: DEFAULT_DRIVE_ICON },
      local: {
        availableOffline: true,
        listeners: [],
        sharingType: "public",
        triggers: [],
      },
    });
  });

  it("ignores non-string file fields", () => {
    const fileDrive = { id: 123 } as unknown as PHSwitchboardDriveConfig;
    expect(defaultDrive({ PH_DEFAULT_DRIVE_ID: "env-id" }, fileDrive).id).toBe(
      "env-id",
    );
    expect(defaultDrive({}, fileDrive).id).toBe("powerhouse");
  });

  it("takes powerhouse.config.json over today's values", () => {
    const drive = defaultDrive(
      {},
      {
        id: "acme",
        name: "Acme",
        icon: "https://x/icon.png",
        preferredEditor: "acme-app",
      },
    );
    expect(drive).toMatchObject({
      id: "acme",
      slug: "acme",
      global: { name: "Acme", icon: "https://x/icon.png" },
      preferredEditor: "acme-app",
    });
  });

  it("takes the env over powerhouse.config.json", () => {
    const drive = defaultDrive(
      {
        PH_DEFAULT_DRIVE_ID: "tenant",
        PH_DEFAULT_DRIVE_SLUG: "tenant-drive",
        PH_DEFAULT_DRIVE_NAME: "Tenant",
        PH_DEFAULT_DRIVE_ICON: "https://t/icon.png",
        PH_DEFAULT_DRIVE_PREFERRED_EDITOR: "tenant-app",
      },
      {
        id: "acme",
        slug: "acme",
        name: "Acme",
        icon: "https://x/icon.png",
        preferredEditor: "acme-app",
      },
    );
    expect(drive).toMatchObject({
      id: "tenant",
      slug: "tenant-drive",
      global: { name: "Tenant", icon: "https://t/icon.png" },
      preferredEditor: "tenant-app",
    });
  });

  it("gives the slug the resolved id unless a layer sets one", () => {
    expect(defaultDrive({ PH_DEFAULT_DRIVE_ID: "tenant" }).slug).toBe("tenant");
    expect(
      defaultDrive({ PH_DEFAULT_DRIVE_ID: "tenant" }, { slug: "file-slug" })
        .slug,
    ).toBe("file-slug");
  });

  it("ignores empty and blank values", () => {
    const drive = defaultDrive(
      { PH_DEFAULT_DRIVE_ID: "", PH_DEFAULT_DRIVE_NAME: "   " },
      { id: "acme", name: "" },
    );
    expect(drive).toMatchObject({
      id: "acme",
      slug: "acme",
      global: { name: "Powerhouse" },
    });
    expect(drive).not.toHaveProperty("preferredEditor");
  });
});

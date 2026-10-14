import { describe, expect, it } from "vitest";
import {
  driveDeclarationSchema,
  explainDrivePlan,
  mergeDrivePlan,
  projectDriveId,
  resolveDriveDeclaration,
  seedDrives,
  type DriveDeclaration,
  type DriveSeederClient,
  type ResolvedDrive,
} from "../src/drives.js";

/* ------------------------------------------------------------------ schema */

describe("driveDeclarationSchema", () => {
  it("accepts a valid minimal declaration", () => {
    expect(driveDeclarationSchema.safeParse({ slug: "vetra" }).success).toBe(
      true,
    );
  });

  it("rejects unknown keys (strict object)", () => {
    const result = driveDeclarationSchema.safeParse({
      slug: "vetra",
      bogus: true,
    });
    expect(result.success).toBe(false);
  });

  it("remote requires a url", () => {
    expect(
      driveDeclarationSchema.safeParse({ slug: "vetra", remote: {} }).success,
    ).toBe(false);
    expect(
      driveDeclarationSchema.safeParse({
        slug: "vetra",
        remote: { url: "https://example.com" },
      }).success,
    ).toBe(true);
  });
});

/* -------------------------------------------------------------- projectDriveId */

describe("projectDriveId", () => {
  it("is deterministic: `${slug}-` + 8 hex chars", () => {
    const id = projectDriveId("/proj/root", "vetra");
    expect(id).toMatch(/^vetra-[0-9a-f]{8}$/);
    expect(projectDriveId("/proj/root", "vetra")).toBe(id);
  });

  it("different projectRoot gives a different hash", () => {
    const idA = projectDriveId("/proj/a", "vetra");
    const idB = projectDriveId("/proj/b", "vetra");
    expect(idA).not.toBe(idB);
  });
});

/* ----------------------------------------------------------- resolveDriveDeclaration */

describe("resolveDriveDeclaration", () => {
  it("projectHash sets BOTH id and slug to the hashed value", () => {
    const resolved = resolveDriveDeclaration("/proj/root", {
      slug: "vetra",
      projectHash: true,
    });
    const expectedId = projectDriveId("/proj/root", "vetra");
    expect(resolved.id).toBe(expectedId);
    expect(resolved.slug).toBe(expectedId);
  });

  it("applies defaults: name=slug, sharingType public, availableOffline true", () => {
    const resolved = resolveDriveDeclaration("/proj/root", { slug: "studio" });
    expect(resolved.name).toBe("studio");
    expect(resolved.sharingType).toBe("public");
    expect(resolved.availableOffline).toBe(true);
    expect(resolved.kind).toBe("local");
    expect(resolved.id).toBe("studio");
  });

  it("remote kind carries remoteUrl and ignores local-only fields", () => {
    const resolved = resolveDriveDeclaration("/proj/root", {
      slug: "remote-drive",
      remote: { url: "https://example.com/d/remote-drive" },
    });
    expect(resolved.kind).toBe("remote");
    expect(resolved.remoteUrl).toBe("https://example.com/d/remote-drive");
  });

  it("honors explicit overrides", () => {
    const resolved = resolveDriveDeclaration("/proj/root", {
      slug: "custom",
      id: "fixed-id",
      name: "Custom Drive",
      sharingType: "private",
      availableOffline: false,
      preferredEditor: "my-editor",
    });
    expect(resolved).toMatchObject({
      id: "fixed-id",
      slug: "custom",
      name: "Custom Drive",
      sharingType: "private",
      availableOffline: false,
      preferredEditor: "my-editor",
    });
  });
});

/* --------------------------------------------------------------------- seedDrives */

class StubDriveSeederClient implements DriveSeederClient {
  locals = new Map<string, string>(); // slug -> id
  remotesAttached: string[] = [];

  findDriveBySlug(slug: string): Promise<string | undefined> {
    return Promise.resolve(this.locals.get(slug));
  }
  createDrive(drive: ResolvedDrive): Promise<void> {
    this.locals.set(drive.slug, drive.id);
    return Promise.resolve();
  }
  attachRemoteDrive(url: string): Promise<void> {
    this.remotesAttached.push(url);
    return Promise.resolve();
  }
}

describe("seedDrives", () => {
  it("creates missing locals, attaches remotes, reports result arrays", async () => {
    const client = new StubDriveSeederClient();
    const drives: ResolvedDrive[] = [
      {
        kind: "local",
        id: "vetra",
        slug: "vetra",
        name: "Vetra",
        sharingType: "public",
        availableOffline: true,
      },
      {
        kind: "remote",
        id: "remote-1",
        slug: "remote-1",
        name: "Remote",
        remoteUrl: "https://example.com/d/remote-1",
        sharingType: "public",
        availableOffline: true,
      },
    ];
    const result = await seedDrives(client, drives);
    expect(result.created).toEqual(["vetra"]);
    expect(result.existing).toEqual([]);
    expect(result.attached).toEqual(["remote-1"]);
    expect(client.locals.has("vetra")).toBe(true);
    expect(client.remotesAttached).toEqual(["https://example.com/d/remote-1"]);
  });

  it("is idempotent: a second run creates nothing new for existing locals", async () => {
    const client = new StubDriveSeederClient();
    const drives: ResolvedDrive[] = [
      {
        kind: "local",
        id: "vetra",
        slug: "vetra",
        name: "Vetra",
        sharingType: "public",
        availableOffline: true,
      },
    ];
    const first = await seedDrives(client, drives);
    expect(first.created).toEqual(["vetra"]);

    const second = await seedDrives(client, drives);
    expect(second.created).toEqual([]);
    expect(second.existing).toEqual(["vetra"]);
  });

  it("attaches remotes every time (not idempotency-gated like locals)", async () => {
    const client = new StubDriveSeederClient();
    const drive: ResolvedDrive = {
      kind: "remote",
      id: "remote-1",
      slug: "remote-1",
      name: "Remote",
      remoteUrl: "https://example.com/d/remote-1",
      sharingType: "public",
      availableOffline: true,
    };
    await seedDrives(client, [drive]);
    await seedDrives(client, [drive]);
    expect(client.remotesAttached).toEqual([
      "https://example.com/d/remote-1",
      "https://example.com/d/remote-1",
    ]);
  });
});

/* --------------------------------------------------------------------- mergeDrivePlan */

describe("mergeDrivePlan", () => {
  it("host declarations WIN over plugin contributions on the same slug", () => {
    const hostDeclared: DriveDeclaration[] = [
      { slug: "vetra", name: "Host Vetra" },
    ];
    const contributed: { declaration: DriveDeclaration; source: string }[] = [
      {
        declaration: { slug: "vetra", name: "Plugin Vetra" },
        source: "my-plugin",
      },
    ];
    const plan = mergeDrivePlan("/proj/root", hostDeclared, contributed);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.source).toBe("host");
    expect(plan[0]?.drive.name).toBe("Host Vetra");
  });

  it("records plugin source for non-conflicting contributions", () => {
    const plan = mergeDrivePlan(
      "/proj/root",
      [],
      [{ declaration: { slug: "studio" }, source: "my-plugin" }],
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].source).toBe("my-plugin");
    expect(plan[0].drive.slug).toBe("studio");
  });
});

describe("explainDrivePlan", () => {
  it("renders slug/kind/id/editor/source lines", () => {
    const plan = mergeDrivePlan(
      "/proj/root",
      [{ slug: "vetra", preferredEditor: "vetra-editor" }],
      [],
    );
    const explained = explainDrivePlan(plan);
    expect(explained).toContain("drives:");
    expect(explained).toContain("vetra");
    expect(explained).toContain("local");
    expect(explained).toContain("id=vetra");
    expect(explained).toContain("editor=vetra-editor");
    expect(explained).toContain("[host]");
  });

  it('renders "(no drives declared)" when empty', () => {
    expect(explainDrivePlan([])).toBe("(no drives declared)");
  });
});

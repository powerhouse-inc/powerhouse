import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import {
  provisionInProcess,
  type ManagedInProcessReactor,
  type ManagedReactor,
} from "@powerhousedao/reactor-monitor";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CrossBackendRelationshipError,
  RoutingReactorClient,
  withOwnershipGuard,
  type ReactorBackend,
} from "../src/index.js";

/**
 * A provisioned `ManagedReactor` IS a {@link ReactorBackend}: the router's
 * backend type is a structural subset of the monitor handle, so no adapter
 * exists to drift. Compile-time proof, checked by `tsc` over this file.
 */
const managedIsABackend: (reactor: ManagedReactor) => ReactorBackend = (
  reactor,
) => reactor;

/**
 * The router over REAL reactors: two in-process reactors, each with its own
 * PGlite store, its own document models and the stage-2 capability row derived
 * at provision time.
 *
 * Everything the stub suites assert about target selection is asserted here
 * against reactors that actually execute the operations -- including the
 * invariant: with the table pointed at the WRONG reactor, the write still lands
 * on the right one, exactly once, and the misrouted attempt leaves no trace.
 */
describe("routing over real in-process reactors", () => {
  let alpha: ManagedInProcessReactor;
  let beta: ManagedInProcessReactor;
  let backends: ReactorBackend[];
  let driveA = "";
  let driveB = "";

  /** The handle's own client, wrapped in the backend-side ownership check. */
  function guarded(reactor: ManagedInProcessReactor): ReactorBackend {
    return {
      name: reactor.name,
      capabilities: reactor.capabilities,
      client: withOwnershipGuard(reactor.client, {
        backendName: reactor.name,
      }),
    };
  }

  function router(options: Record<string, unknown> = {}): RoutingReactorClient {
    return new RoutingReactorClient(backends, {
      onDiagnostic: () => {},
      ...options,
    });
  }

  beforeAll(async () => {
    alpha = await provisionInProcess({
      kind: "in-process",
      name: "router-alpha",
      storage: { kind: "memory" },
    });
    beta = await provisionInProcess({
      kind: "in-process",
      name: "router-beta",
      storage: { kind: "memory" },
    });
    backends = [guarded(alpha), guarded(beta)];
    // Each reactor gets one drive, created on it directly. The reference
    // DriveClient mints the drive id itself (it ignores DriveInput.id), so the
    // ids the router has to route on are only knowable after creation -- which
    // is the realistic starting point for a router anyway: a topology it did
    // not create.
    const createdA = await alpha.client.drives.create({
      global: { name: "Alpha" },
    });
    const createdB = await beta.client.drives.create({
      global: { name: "Beta" },
    });
    driveA = createdA.header.id;
    driveB = createdB.header.id;
    await alpha.client.drives.addFolder(driveA, "alpha-folder");
    await beta.client.drives.addFolder(driveB, "beta-folder");
  });

  afterAll(async () => {
    // Serially: each kill closes a PGlite in this realm.
    await alpha.kill();
    await beta.kill();
  });

  it("is handed provisioned reactors with no adapter", () => {
    expect(managedIsABackend(alpha).name).toBe("router-alpha");
    expect(managedIsABackend(alpha).capabilities.hosting).toBe("in-process");
    // The capability row that decides workflow placement, read off the real
    // provisioned handle rather than constructed for the test.
    expect(managedIsABackend(beta).capabilities.workflows).toBe(false);
    expect(managedIsABackend(beta).capabilities.processors).toBe(true);
  });

  it("keeps each drive's operations on the reactor that holds it", async () => {
    const client = router({
      collections: { [driveA]: "router-alpha", [driveB]: "router-beta" },
    });

    await client.drives.addFolder(driveA, "routed-into-alpha");
    await client.drives.addFolder(driveB, "routed-into-beta");

    const onAlpha = await alpha.client.get<DocumentDriveDocument>(driveA);
    const onBeta = await beta.client.get<DocumentDriveDocument>(driveB);
    expect(onAlpha.state.global.nodes.map((node) => node.name).sort()).toEqual([
      "alpha-folder",
      "routed-into-alpha",
    ]);
    expect(onBeta.state.global.nodes.map((node) => node.name).sort()).toEqual([
      "beta-folder",
      "routed-into-beta",
    ]);
    // Neither reactor holds the other's drive at all.
    await expect(beta.client.get(driveA)).rejects.toThrow();
    await expect(alpha.client.get(driveB)).rejects.toThrow();
  });

  it("serves both drives through one client, routed and cached", async () => {
    const client = router();

    const a = await client.get<DocumentDriveDocument>(driveA);
    const b = await client.get<DocumentDriveDocument>(driveB);

    expect(a.state.global.name).toBe("Alpha");
    expect(b.state.global.name).toBe("Beta");
    expect(client.describeRouting().documents).toEqual(
      expect.arrayContaining([
        { identifier: driveA, backend: "router-alpha" },
        { identifier: driveB, backend: "router-beta" },
      ]),
    );
  });

  it("merges a find across both reactors", async () => {
    const client = router();

    const page = await client.find({ type: "powerhouse/document-drive" });

    expect(page.results.map((document) => document.header.id).sort()).toEqual(
      [driveA, driveB].sort(),
    );
  });

  it("learns the owner of a drive it was told nothing about", async () => {
    const client = router();

    await client.drives.addFolder(driveB, "learned-into-beta");

    const onBeta = await beta.client.get<DocumentDriveDocument>(driveB);
    expect(onBeta.state.global.nodes.map((node) => node.name)).toContain(
      "learned-into-beta",
    );
    expect(
      client.describeRouting().collections.map((entry) => entry.backend),
    ).toContain("router-beta");
  });

  it("lands a write on the owning reactor from a WRONG table, exactly once", async () => {
    const reported: string[] = [];
    const client = new RoutingReactorClient(backends, {
      // Both entries inverted on purpose.
      collections: { [driveA]: "router-beta", [driveB]: "router-alpha" },
      onDiagnostic: (message) => reported.push(message),
    });
    const before = await alpha.client.get<DocumentDriveDocument>(driveA);

    await client.drives.addFolder(driveA, "recovered-folder");

    const after = await alpha.client.get<DocumentDriveDocument>(driveA);
    const names = after.state.global.nodes.map((node) => node.name);
    // Applied exactly once, on the owner.
    expect(names.filter((name) => name === "recovered-folder")).toHaveLength(1);
    expect(after.state.global.nodes).toHaveLength(
      before.state.global.nodes.length + 1,
    );
    // The reactor it was MISROUTED to still does not hold drive A at all, so
    // nothing partial was written there.
    await expect(beta.client.get(driveA)).rejects.toThrow();
    expect(reported.join()).toMatch(/is stale/);
    expect(
      client
        .describeRouting()
        .collections.filter((entry) => entry.source === "corrected"),
    ).toHaveLength(1);
  });

  it("recovers a READ aimed at the wrong reactor", async () => {
    const client = router({
      documents: { [driveA]: "router-beta" },
    });

    const drive = await client.get<DocumentDriveDocument>(driveA);

    expect(drive.state.global.name).toBe("Alpha");
    expect(client.describeRouting().documents).toEqual(
      expect.arrayContaining([{ identifier: driveA, backend: "router-alpha" }]),
    );
  });

  it("refuses a relationship write that would cross reactors", async () => {
    const client = router();

    await expect(
      client.addRelationship(driveA, driveB, "child"),
    ).rejects.toThrow(CrossBackendRelationshipError);
  });

  it("creates a child on the parent drive's reactor and routes it afterwards", async () => {
    const client = router();

    const created = await client.createEmpty("powerhouse/document-drive", {
      parentIdentifier: driveB,
    });
    const read = await client.get(created.header.id);

    expect(read.header.id).toBe(created.header.id);
    await expect(beta.client.get(created.header.id)).resolves.toBeTruthy();
    await expect(alpha.client.get(created.header.id)).rejects.toThrow();
  });
});

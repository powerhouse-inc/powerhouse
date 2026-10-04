import { REACTOR_SCHEMA } from "@powerhousedao/reactor";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ReactorMonitorRegistry,
  type LocalSyncHandle,
  type ManagedInProcessReactor,
  type ManagedReactor,
} from "../src/index.js";
import { descriptor, nodeChannel } from "./helpers.js";

/**
 * Stage-2 mixed topology (docs/plans/2026-10-03-multi-reactor.md): three
 * reactors, A <-> B <-> C, linked on ONE drive, with C standing in for the
 * no-worker-support fallback actor. The hosting kinds are all `in-process`
 * here because a SharedWorker does not exist outside a browser; what this file
 * proves is that `linkLocalSync` COMPOSES -- a reactor holding two brokered
 * local remotes is not a case the stage-1 pair ever exercised -- and what the
 * sync layer does with an operation that arrived from one peer when a second
 * peer is attached.
 *
 * ## Echo suppression, and why a relay is not a loop
 *
 * Verified by reading `packages/reactor` (no changes made there):
 *
 * 1. A sync load job stamps its provenance onto every operation it writes.
 *    `SimpleJobExecutor.executeLoadJob` (simple-job-executor.ts, the
 *    `effectiveSourceRemote` assignment) sets each written operation's
 *    `sourceRemote` to `job.meta.sourceRemote` -- the NAME OF THE REMOTE the
 *    operation arrived on -- for a trivial append. (A load that had to
 *    reshuffle clears it instead, so a reorder is re-sent to everyone
 *    including the source; that is deliberate and commented there.)
 * 2. `SyncManager.deriveOutbox` asks the operation index for the collection's
 *    operations with `excludeSourceRemote: remote.meta.name`, which
 *    `KyselyOperationIndex` renders as `WHERE oi."sourceRemote" != ?`.
 *    `backfillDocument` applies the same exclusion by hand, and
 *    `delivery-tracking.ts` skips the same rows when reporting pending
 *    deliveries.
 *
 * So the suppression is keyed on the REMOTE NAME, not on "came from sync".
 * That is what makes A <-> B terminate (B never offers A's own operation back
 * to the remote it arrived on) and, by the same mechanism, predicts that a
 * relay DOES happen: B's remote for C has a different name, so an operation
 * whose `sourceRemote` is B's remote-for-A is NOT excluded from the
 * remote-for-C outbox. The relay and the loop-freedom are two readings of one
 * rule.
 *
 * VERDICT (asserted below): transitive relay works. An operation created on A
 * reaches C through B with no A <-> C link, and the counts stabilise equal on
 * all three rather than growing -- C's copy carries `sourceRemote` =
 * C's-remote-for-B, so C offers it to nobody, and B's copy is already excluded
 * from the A outbox, which is where a cycle would have had to start.
 */

type OpCounts = { a: number; b: number; c: number };

const PROPAGATION_TIMEOUT_MS = 20_000;

async function folderNames(
  reactor: ManagedReactor,
  driveId: string,
): Promise<string[]> {
  try {
    const drive = await reactor.client.get<DocumentDriveDocument>(driveId);
    return drive.state.global.nodes.map((node) => node.name);
  } catch {
    return [];
  }
}

/** Distinct from "the drive is here but empty", which `folderNames` cannot tell apart. */
async function hasDrive(
  reactor: ManagedReactor,
  driveId: string,
): Promise<boolean> {
  try {
    await reactor.client.get(driveId);
    return true;
  } catch {
    return false;
  }
}

/** `Operation` rows for the drive, read through each reactor's own dbQuery. */
async function operationCount(
  reactor: ManagedReactor,
  driveId: string,
): Promise<number> {
  const rows = await reactor.dbQuery.queryDb(
    `SELECT COUNT(*)::int AS count FROM "${REACTOR_SCHEMA}"."Operation" WHERE "documentId" = $1`,
    [driveId],
  );
  const row = rows[0] as { count?: unknown } | undefined;
  return typeof row?.count === "number" ? row.count : Number(row?.count ?? 0);
}

async function countAll(
  reactors: readonly [ManagedReactor, ManagedReactor, ManagedReactor],
  driveId: string,
): Promise<OpCounts> {
  const [a, b, c] = await Promise.all(
    reactors.map((reactor) => operationCount(reactor, driveId)),
  );
  return { a, b, c };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("three-reactor mixed topology (A <-> B <-> C on one drive)", () => {
  const registry = new ReactorMonitorRegistry();
  const links: LocalSyncHandle[] = [];

  afterEach(async () => {
    // Unlink before killing: removing a sync peer still needs both sides'
    // storage alive (same ordering the load harness teardown documents).
    for (const link of links.splice(0)) {
      await link.unlink().catch(() => undefined);
    }
    await registry.killAll();
  });

  it("relays an op from A to C through B, with no echo storm and all three inspectable", async () => {
    const a = (await registry.provision(
      descriptor("trio-a", { sync: { local: true } }),
    )) as ManagedInProcessReactor;
    const b = (await registry.provision(
      descriptor("trio-b", { sync: { local: true } }),
    )) as ManagedInProcessReactor;
    // The stage-2 fallback actor: the reactor a host with no worker support
    // gets. Here it is the same hosting kind as the others, but it is the one
    // whose capabilities say `inspection: "direct"` and `processors: true`.
    const c = (await registry.provision(
      descriptor("trio-c", { sync: { local: true } }),
    )) as ManagedInProcessReactor;
    const trio = [a, b, c] as const;

    const drive = await a.client.drives.create({ global: { name: "Trio" } });
    const driveId = drive.header.id;

    // B is the hub: two brokered local remotes on one reactor, which is the
    // composition stage 1 never exercised.
    links.push(
      await registry.linkLocalSync("trio-a", "trio-b", {
        driveId,
        createChannel: nodeChannel,
      }),
      await registry.linkLocalSync("trio-b", "trio-c", {
        driveId,
        createChannel: nodeChannel,
      }),
    );

    const channelName = links[0].channelName;
    expect(
      b.syncManager
        ?.list()
        .map((remote) => remote.meta.name)
        .sort(),
    ).toEqual([`local:trio-a:${channelName}`, `local:trio-c:${channelName}`]);
    // There is deliberately NO A <-> C link: anything C learns about A's
    // operations, it learned through B.
    expect(a.syncManager?.list().map((remote) => remote.meta.name)).toEqual([
      `local:trio-b:${channelName}`,
    ]);
    expect(c.syncManager?.list().map((remote) => remote.meta.name)).toEqual([
      `local:trio-b:${channelName}`,
    ]);

    // The drive document itself relays: A created it, C ends up holding it,
    // and the only path there is through B.
    await vi.waitFor(
      async () => expect(await hasDrive(c, driveId)).toBe(true),
      {
        timeout: PROPAGATION_TIMEOUT_MS,
      },
    );

    // THE RELAY VERDICT. An op created on A, with A linked only to B, reaches
    // C: B's load writes it with sourceRemote = B's-remote-for-A, and B's
    // outbox for C excludes only C's own name, so the op is offered onward.
    await a.client.drives.addFolder(driveId, "fromA");
    await vi.waitFor(
      async () => expect(await folderNames(c, driveId)).toContain("fromA"),
      { timeout: PROPAGATION_TIMEOUT_MS },
    );

    // The relay is symmetric: C -> B -> A over the same two links.
    await c.client.drives.addFolder(driveId, "fromC");
    await vi.waitFor(
      async () => expect(await folderNames(a, driveId)).toContain("fromC"),
      { timeout: PROPAGATION_TIMEOUT_MS },
    );

    // And the hub's own writes reach both arms.
    await b.client.drives.addFolder(driveId, "fromB");
    await vi.waitFor(
      async () => {
        expect(await folderNames(a, driveId)).toContain("fromB");
        expect(await folderNames(c, driveId)).toContain("fromB");
      },
      { timeout: PROPAGATION_TIMEOUT_MS },
    );

    // Full convergence: every reactor holds every folder, exactly once each.
    for (const reactor of trio) {
      expect((await folderNames(reactor, driveId)).sort()).toEqual([
        "fromA",
        "fromB",
        "fromC",
      ]);
    }

    // NO ECHO STORM. Operation counts converge to the same number on all
    // three and then stop moving: a loop would show as unbounded growth, and
    // a duplicate relay as unequal counts.
    await vi.waitFor(
      async () => {
        const counts = await countAll(trio, driveId);
        expect(counts.b).toBe(counts.a);
        expect(counts.c).toBe(counts.a);
      },
      { timeout: PROPAGATION_TIMEOUT_MS },
    );
    const settled = await countAll(trio, driveId);
    expect(settled.a).toBeGreaterThan(0);
    // Long enough for several outbox derivations and inbox drains to run; a
    // cycle created by the relay would have added rows by now.
    await sleep(2_000);
    expect(await countAll(trio, driveId)).toEqual(settled);

    // All three are inspectable, which is the other half of stage 2: the
    // topology grew without the lab bench losing sight of any member.
    for (const reactor of trio) {
      const queue = await reactor.inspector.getQueueState();
      expect(queue.isPaused).toBe(false);
      // Everything has settled, so nothing is still queued anywhere.
      expect(queue.totalPending).toBe(0);
      expect(await reactor.inspector.getStorageHealth()).toMatchObject({
        healthy: true,
        recreateCount: 0,
      });
      const [inspection] = await reactor.syncManager!.inspectRemotes();
      expect(inspection.remoteName).toContain("local:");
    }

    // Each reactor's capability contract is the one the router would read.
    for (const reactor of trio) {
      expect(reactor.capabilities.syncChannels).toEqual(["local"]);
      expect(reactor.capabilities.hosting).toBe("in-process");
    }
  }, 120_000);

  it("keeps the other arm alive when one link is unlinked", async () => {
    const a = await registry.provision(
      descriptor("cut-a", { sync: { local: true } }),
    );
    const b = await registry.provision(
      descriptor("cut-b", { sync: { local: true } }),
    );
    const c = await registry.provision(
      descriptor("cut-c", { sync: { local: true } }),
    );

    const drive = await a.client.drives.create({ global: { name: "Cut" } });
    const driveId = drive.header.id;
    const ab = await registry.linkLocalSync("cut-a", "cut-b", {
      driveId,
      createChannel: nodeChannel,
    });
    const bc = await registry.linkLocalSync("cut-b", "cut-c", {
      driveId,
      createChannel: nodeChannel,
    });
    links.push(bc);

    await a.client.drives.addFolder(driveId, "beforeCut");
    await vi.waitFor(
      async () => expect(await folderNames(c, driveId)).toContain("beforeCut"),
      { timeout: PROPAGATION_TIMEOUT_MS },
    );

    // Cut A <-> B. B <-> C must be untouched: the remotes are independent.
    await ab.unlink();
    expect(a.syncManager?.list()).toEqual([]);
    expect(b.syncManager?.list()).toHaveLength(1);

    await b.client.drives.addFolder(driveId, "afterCut");
    await vi.waitFor(
      async () => expect(await folderNames(c, driveId)).toContain("afterCut"),
      { timeout: PROPAGATION_TIMEOUT_MS },
    );
    // A is isolated now, so it never hears about it.
    expect(await folderNames(a, driveId)).toEqual(["beforeCut"]);
  }, 120_000);
});

import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  Action,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  appliedOperations,
  createActionIdGenerator,
  positionalOperations,
  redo,
  retract,
  retractedActionIds,
  stateReducerOf,
  undo,
  withSignaturePolicy,
} from "@powerhousedao/shared/document-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DriveCollectionId } from "../../src/cache/operation-index-types.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { InProcessReactorModule } from "../../src/core/types.js";
import { synthesizedActionId } from "../../src/executor/synthesized-signing.js";
import { JobStatus } from "../../src/shared/types.js";
import type { ISyncCursorStorage } from "../../src/storage/interfaces.js";
import type { IChannelFactory } from "../../src/sync/interfaces.js";
import { SyncBuilder } from "../../src/sync/sync-builder.js";
import type { ChannelConfig, SyncEnvelope } from "../../src/sync/types.js";
import {
  assertOneRuleAgreement,
  storedRows,
} from "../executor/one-rule-agreement.js";
import { undoV3Flags } from "../factories.js";
import { TestChannel } from "./channels/test-channel.js";

// retraction.property.test.ts's generator, over reactors joined by TestChannels.

const FILTER = { documentId: [], scope: [], branch: "main" };
const NODE_NAMES = ["A", "B", "C"];

type Node = { name: string; module: InProcessReactorModule };

/** Envelopes wait on their link for the generator, unless `immediate`. */
class Network {
  immediate = false;
  readonly channels = new Map<string, TestChannel>();
  readonly peerOf = new Map<string, string>();
  readonly pending = new Map<string, SyncEnvelope[]>();
  readonly delivered = new Map<string, SyncEnvelope[]>();

  factory(): IChannelFactory {
    return {
      instance: (
        remoteId: string,
        remoteName: string,
        _config: ChannelConfig,
        cursorStorage: ISyncCursorStorage,
      ): TestChannel => {
        const channel = new TestChannel(
          remoteId,
          remoteName,
          cursorStorage,
          (envelope) => {
            if (this.immediate) {
              this.receive(remoteName, envelope);
              return;
            }
            const queue = this.pending.get(remoteName) ?? [];
            queue.push(envelope);
            this.pending.set(remoteName, queue);
          },
          { peer: () => this.channels.get(this.peerOf.get(remoteName)!) },
        );
        this.channels.set(remoteName, channel);
        return channel;
      },
    } as IChannelFactory;
  }

  private receive(remoteName: string, envelope: SyncEnvelope): void {
    this.channels.get(this.peerOf.get(remoteName)!)!.receive(envelope);
    const delivered = this.delivered.get(remoteName) ?? [];
    delivered.push(envelope);
    this.delivered.set(remoteName, delivered);
  }

  /** The first `count` envelopes waiting on `remoteName`, in order. */
  deliver(remoteName: string, count = Infinity): number {
    const queue = this.pending.get(remoteName) ?? [];
    const batch = queue.splice(0, count);
    for (const envelope of batch) this.receive(remoteName, envelope);
    return batch.length;
  }

  redeliver(remoteName: string, pick: (n: number) => number): boolean {
    const delivered = this.delivered.get(remoteName) ?? [];
    if (delivered.length === 0) return false;
    this.receive(remoteName, delivered[pick(delivered.length)]);
    return true;
  }

  waiting(): string[] {
    return [...this.pending]
      .filter(([, queue]) => queue.length > 0)
      .map(([name]) => name);
  }
}

const network = new Network();
const nodes: Node[] = [];

async function buildNode(name: string): Promise<Node> {
  const module = await new ReactorBuilder()
    .withDocumentModelSources([driveDocumentModelModule as never])
    .withExecutorConfig({
      featureFlags: undoV3Flags({ documentDecisions: true }),
    })
    .withWriteCacheConfig({ keyframeInterval: 2 })
    .withSync(new SyncBuilder().withChannelFactory(network.factory()))
    .buildModule();
  return { name, module };
}

function baseReducer3Drive(): PHDocument {
  return withSignaturePolicy(
    driveDocumentModelModule.utils.createDocument(),
    "legacy",
    { protocolVersions: { "base-reducer": 3 } },
  );
}

const remoteName = (id: string, from: Node, to: Node) =>
  `${id}:${from.name}->${to.name}`;

async function link(id: string, replicas: Node[]): Promise<string[]> {
  const names: string[] = [];
  const collection = DriveCollectionId.forDrive(id);
  const config = { type: "internal", parameters: {} };
  for (const [i, a] of replicas.entries()) {
    for (const b of replicas.slice(i + 1)) {
      const toB = remoteName(id, a, b);
      const toA = remoteName(id, b, a);
      network.peerOf.set(toB, toA);
      network.peerOf.set(toA, toB);
      await a.module.syncModule!.syncManager.add(
        toB,
        collection,
        config,
        FILTER,
      );
      await b.module.syncModule!.syncManager.add(
        toA,
        collection,
        config,
        FILTER,
      );
      names.push(toB, toA);
    }
  }
  return names;
}

async function unlink(replicas: Node[], names: string[]): Promise<void> {
  for (const node of replicas) {
    for (const name of names) {
      if (name.split(":")[1].startsWith(`${node.name}->`)) {
        await node.module.syncModule!.syncManager.remove(name);
      }
    }
  }
}

async function settled(node: Node, jobId: string) {
  for (;;) {
    const job = await node.module.reactor.getJobStatus(jobId);
    if (job.status === JobStatus.READ_READY || job.status === JobStatus.FAILED)
      return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function execute(
  node: Node,
  id: string,
  action: Action,
): Promise<string | undefined> {
  const info = await node.module.reactor.execute(id, "main", [action]);
  const job = await settled(node, info.id);
  return job.status === JobStatus.FAILED ? job.error?.message : undefined;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Until mailboxes are empty and streams and links stop changing. */
async function settle(id: string, replicas: Node[]): Promise<void> {
  let last = "";
  let quiet = 0;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    let busy = false;
    for (const channel of network.channels.values()) {
      if (channel.inbox.items.length > 0 || channel.outbox.items.length > 0) {
        busy = true;
      }
    }
    const snapshot = JSON.stringify([
      [...network.pending].map(([name, queue]) => [name, queue.length]),
      await Promise.all(
        replicas.map(async (node) =>
          (await storedRows(node.module, id)).map((row) => row.action.id),
        ),
      ),
    ]);
    quiet = !busy && snapshot === last ? quiet + 1 : 0;
    if (quiet >= 3) return;
    last = snapshot;
    await sleep(15);
  }
  throw new Error("the fleet did not settle");
}

/** A base-reducer 3 drive, created on the first replica and delivered. */
async function opened(
  replicas: Node[],
): Promise<{ drive: PHDocument; id: string; links: string[] }> {
  const drive = baseReducer3Drive();
  const id = drive.header.id;
  const links = await link(id, replicas);
  const info = await replicas[0].module.reactor.create(drive);
  const job = await settled(replicas[0], info.id);
  expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
  await quiesce(id, replicas, links);
  return { drive, id, links };
}

async function quiesce(
  id: string,
  replicas: Node[],
  links: string[],
): Promise<void> {
  await settle(id, replicas);
  for (let round = 0; network.waiting().length > 0; round++) {
    if (round > 20) throw new Error("the fleet did not quiesce");
    for (const name of links) network.deliver(name);
    await settle(id, replicas);
  }
}

async function positional(node: Node, id: string): Promise<string[]> {
  return positionalOperations(await storedRows(node.module, id)).map(
    (row) => row.action.id,
  );
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Variant = {
  /** Clock skew, backdated writes, and partial and repeated delivery. */
  adversarial: boolean;
  /** Writes often reuse the previous stamp, on the same node or another. */
  ties?: boolean;
  /** Each node draws action ids from its own generator on a frozen clock. */
  generatedIds?: boolean;
};

const reducer = driveDocumentModelModule.reducer;
const reducerFor = () => stateReducerOf(reducer) as never;

function label(row: Operation): string {
  const target = (row.action.input as { target?: string }).target;
  return `${row.action.type}${target ? `(${target.slice(0, 8)})` : ""}#${row.action.id.slice(0, 8)}`;
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)),
        )
      : inner,
  );
}

/** The derivation paths an agreement failure names, with any error they hit. */
function disagreeing(error: unknown): string[] {
  const { actual, expected } = error as {
    actual?: unknown;
    expected?: unknown;
  };
  if (typeof actual !== "object" || typeof expected !== "object") {
    return [(error as Error).message.split("\n")[0]];
  }
  const got = actual as Record<string, unknown>;
  const want = expected as Record<string, unknown>;
  return Object.keys(want)
    .filter((key) => canonical(got[key]) !== canonical(want[key]))
    .map((key) => {
      const failed = (got[key] as { error?: string } | undefined)?.error;
      if (!failed) return key;
      const message = failed.match(/"error": "([^"]*)"/)?.[1] ?? failed;
      return `${key} (${message.replace(/\s+/g, " ").slice(0, 100)})`;
    });
}

/** A refusal's reducer message, without the retry log. */
function reason(message: string): string {
  const original = message.match(/Original error: (.*)/);
  return (original?.[1] ?? message.split("\n")[0]).slice(0, 120);
}

async function runCase(
  seed: number,
  variant: Variant,
  trace: string[],
): Promise<void> {
  const random = mulberry32(seed);
  const int = (n: number) => Math.floor(random() * n);
  const pick = <T>(items: readonly T[]): T => items[int(items.length)];
  // Seeded, so a tie breaks the same way when a seed is replayed.
  const hex = (n: number) =>
    Array.from({ length: n }, () => int(16).toString(16)).join("");
  const replicas = nodes.slice(0, 2 + int(2));
  const generators = new Map(
    replicas.map((node) => [
      node.name,
      createActionIdGenerator({
        now: () => 0,
        random: (bytes) => bytes.forEach((_, i) => (bytes[i] = int(256))),
      }),
    ]),
  );
  const seeded = <T extends Action>(node: Node, action: T): T => ({
    ...action,
    id: variant.generatedIds
      ? generators.get(node.name)!()
      : `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`,
  });

  const skew = new Map(
    replicas.map((node) => [node.name, variant.adversarial ? int(9) - 4 : 0]),
  );
  const steps = 8 + int(13);
  network.immediate = !variant.adversarial;
  const { drive, id, links } = await opened(replicas);
  trace.push(`${replicas.map((node) => node.name).join("")} ${id}`);
  try {
    let writes = 0;
    const known: string[] = [];
    const accepted: Array<{ node: string; id: string; at: string }> = [];
    // A synthesized RETRACT is stamped when executed, so stamps follow the clock.
    let previous: string | undefined;
    const stamp = async (node: Node) => {
      writes++;
      if (variant.ties && previous !== undefined && random() < 0.4) {
        return previous;
      }
      await sleep(2);
      const jitter = variant.adversarial && random() < 0.2 ? -int(4) : 0;
      previous = new Date(
        Date.now() + (skew.get(node.name)! + jitter) * 1000,
      ).toISOString();
      return previous;
    };
    const write = async (node: Node, action: Action, label: string) => {
      const refused = await execute(node, id, action);
      trace.push(
        `${node.name} ${label} ${action.id.slice(0, 8)}@${action.timestampUtcMs.slice(14, 23)}${refused ? ` refused: ${reason(refused)}` : ""}`,
      );
      if (refused) return;
      known.push(action.id);
      accepted.push({
        node: node.name,
        id:
          action.type === "UNDO" || action.type === "REDO"
            ? synthesizedActionId(action.id, "suffixed")
            : action.id,
        at: action.timestampUtcMs,
      });
    };

    for (let step = 0; step < steps; step++) {
      const node = pick(replicas);
      const roll = random();
      if (roll < 0.4) {
        const timestampUtcMs = await stamp(node);
        const action =
          random() < 0.75
            ? driveDocumentModelModule.actions.addFolder({
                id: `f${writes}`,
                name: `f${writes}`,
                parentFolder: null,
              })
            : driveDocumentModelModule.actions.setDriveName({
                name: `n${writes}`,
              });
        await write(
          node,
          seeded(node, { ...action, timestampUtcMs }),
          action.type,
        );
      } else if (roll < 0.55) {
        const isUndo = random() < 0.55;
        const action = seeded(node, isUndo ? undo() : redo());
        await write(node, action, action.type);
      } else if (roll < 0.65) {
        const rows = await storedRows(node.module, id);
        const present = rows.map((row) => row.action.id);
        const retracted = [...retractedActionIds(positionalOperations(rows))];
        const kind = random();
        const target =
          kind < 0.6 && present.length > 0
            ? pick(present)
            : kind < 0.8 && retracted.length > 0
              ? pick(retracted)
              : known.length > 0
                ? pick(known)
                : undefined;
        if (target === undefined) continue;
        await write(
          node,
          seeded(node, {
            ...retract(target),
            timestampUtcMs: await stamp(node),
          }),
          `RETRACT(${target.slice(0, 8)})`,
        );
      } else if (variant.adversarial) {
        const waiting = network.waiting();
        if (waiting.length === 0) continue;
        const name = pick(waiting);
        const queued = network.pending.get(name)!.length;
        const count = 1 + int(queued);
        network.deliver(name, count);
        const repeat = random() < 0.3 && network.redeliver(name, int);
        trace.push(
          `deliver ${name.split(":")[1]} ${count}/${queued}${repeat ? " +repeat" : ""}`,
        );
      } else {
        continue;
      }
      await settle(id, replicas);
    }

    trace.push("quiesce");
    await quiesce(id, replicas, links);

    for (const node of replicas) {
      trace.push(
        `${node.name} rows ${(await storedRows(node.module, id))
          .map(
            (row) =>
              `${row.index}/${row.skip}:${label(row)}~${row.hash.slice(0, 4)}`,
          )
          .join(" ")}`,
      );
    }
    const observed = await Promise.all(
      replicas.map(async (node) => {
        const rows = await storedRows(node.module, id);
        const served = await node.module.reactor.get<PHDocument>(id, {
          branch: "main",
        });
        return {
          node: node.name,
          live: appliedOperations(rows)
            .map((row) => row.action.id)
            .sort(),
          positional: await positional(node, id),
          applied: appliedOperations(rows).map((row) => row.action.id),
          state: (served.state as Record<string, unknown>).global,
        };
      }),
    );
    for (const each of observed) {
      trace.push(
        `${each.node} applied ${each.applied.map((id) => id.slice(0, 8)).join(" ")}`,
      );
    }
    const [first, ...rest] = observed;
    for (const other of rest) {
      expect(
        { ...other, node: first.node },
        `${other.node} vs ${first.node}`,
      ).toEqual(first);
    }
    if (variant.generatedIds) {
      const position = new Map(first.positional.map((id, i) => [id, i]));
      for (const [i, earlier] of accepted.entries()) {
        for (const later of accepted.slice(i + 1)) {
          if (later.node !== earlier.node || later.at !== earlier.at) continue;
          expect(
            position.get(earlier.id)! < position.get(later.id)!,
            `${earlier.node}'s ${earlier.id.slice(0, 13)} before ${later.id.slice(0, 13)} at ${later.at}`,
          ).toBe(true);
        }
      }
    }
    for (const node of replicas) {
      try {
        await assertOneRuleAgreement({
          module: node.module,
          document: drive,
          reducer: reducer as never,
          reducerFor,
          expectKeyframe: false,
        });
      } catch (error) {
        throw new Error(
          `one-rule agreement on ${node.name}: ${disagreeing(error).join(", ")}`,
          { cause: error },
        );
      }
    }
  } finally {
    network.immediate = false;
    await unlink(replicas, links);
  }
}

function seeds(base: number): number[] {
  const only = process.env.PROPERTY_SEED;
  if (only !== undefined) return [Number(only)];
  const cases = Number(process.env.PROPERTY_CASES ?? 5);
  return Array.from({ length: cases }, (_, i) => base + i);
}

/** Runs every seed; reports each failing seed and the first one's trace. */
async function runSeeds(base: number, variant: Variant): Promise<void> {
  const failures: Array<{ seed: number; error: Error; trace: string[] }> = [];
  for (const seed of seeds(base)) {
    const trace: string[] = [];
    try {
      await runCase(seed, variant, trace);
    } catch (error) {
      failures.push({ seed, error: error as Error, trace });
    }
  }
  if (failures.length === 0) return;
  const [first] = failures;
  throw new Error(
    [
      ...failures.map(
        ({ seed, error }) =>
          `seed ${seed} (PROPERTY_SEED=${seed}): ${error.message.split("\n")[0]}`,
      ),
      `trace of seed ${first.seed}:`,
      ...first.trace,
    ].join("\n"),
    { cause: first.error },
  );
}

describe("base-reducer 3, reactor-level differential property", () => {
  beforeAll(async () => {
    for (const name of NODE_NAMES) nodes.push(await buildNode(name));
  });

  afterAll(() => {
    for (const node of nodes.splice(0)) node.module.reactor.kill();
  });

  // Every load is a trivial append of skip-0 rows: the harness on its own.
  it("replicas agree without skew or delayed delivery", async () => {
    await runSeeds(0x4c0, { adversarial: false });
  }, 300_000);

  it("replicas agree under skew, backdated writes, and partial and repeated delivery", async () => {
    await runSeeds(0x4c1, { adversarial: true });
  }, 300_000);

  // Same-node and cross-node ties, under the adversarial schedule.
  it("replicas agree when writes share timestamps", async () => {
    await runSeeds(0x4c2, { adversarial: true, ties: true });
  }, 300_000);

  // Each node's same-millisecond writes keep their creation order.
  it("replicas agree and keep each node's order when its ids sort in creation order", async () => {
    await runSeeds(0x4c3, {
      adversarial: true,
      ties: true,
      generatedIds: true,
    });
  }, 300_000);

  // selectLoadWrites leaves out receiver rows below the sender's lowest index.
  it("orders rows by timestamp when the sender's indexes run ahead of the receiver's", async () => {
    const [a, b] = nodes;
    const replicas = [a, b];
    const { id, links } = await opened(replicas);
    try {
      const base = Date.now() - 10_000;
      const at = (ms: number) => new Date(base + ms).toISOString();
      const folder = (name: string, ms: number): Action => ({
        ...driveDocumentModelModule.actions.addFolder({
          id: name,
          name,
          parentFolder: null,
        }),
        timestampUtcMs: at(ms),
      });
      const x = folder("x", 3000);
      const a1 = folder("a1", 5000);
      const a0 = folder("a0", 1000);
      expect(await execute(b, id, x)).toBeUndefined();
      expect(await execute(a, id, a1)).toBeUndefined();
      // Backdated: A re-appends a1 after a0, at A indexes 1 and 2.
      expect(await execute(a, id, a0)).toBeUndefined();

      // B appends a1 at its index 1; [a0, a1] arrives from A indexes 1 and 2.
      network.deliver(remoteName(id, a, b));
      await settle(id, replicas);
      await quiesce(id, replicas, links);

      const order = [a0.id, x.id, a1.id];
      expect({
        a: await positional(a, id),
        b: await positional(b, id),
      }).toEqual({ a: order, b: order });
    } finally {
      await unlink(replicas, links);
    }
  });
});

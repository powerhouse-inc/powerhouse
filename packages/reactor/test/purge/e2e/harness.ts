import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  deriveOperationId,
  isPurgeMarker,
  localPeerManifest,
  PEER_CAPABILITIES,
  withSignaturePolicy,
  type ActionSigner,
  type AuthSubject,
  type DocumentModelModule,
  type Operation,
  type OperationWithContext,
  type PeerCapability,
  type PeerManifest,
  type PurgeMarkerOperation,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { expect, vi } from "vitest";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import type { ReactorClient } from "../../../src/client/reactor-client.js";
import { ReactorBuilder } from "../../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../../src/core/reactor-client-builder.js";
import type {
  Database,
  InProcessReactorModule,
  IReactor,
} from "../../../src/core/types.js";
import {
  BareReadGate,
  ModelReadGate,
  readDecisionModel,
} from "../../../src/decision/read-gate.js";
import { SyncScopeGate } from "../../../src/decision/sync-scope-gate.js";
import { ReactorEventTypes } from "../../../src/events/types.js";
import type { ReactorFeatureFlags } from "../../../src/executor/types.js";
import type { DocumentViewDatabase } from "../../../src/read-models/types.js";
import { JobStatus, type JobInfo } from "../../../src/shared/types.js";
import type { SignatureTrustPolicy } from "../../../src/signer/types.js";
import type { ISyncCursorStorage } from "../../../src/storage/interfaces.js";
import type {
  DocumentIndexerDatabase,
  DocumentPurgeRow,
  Database as StorageDatabase,
} from "../../../src/storage/kysely/types.js";
import { GqlResponseChannel } from "../../../src/sync/channels/gql-res-channel.js";
import { ChannelError } from "../../../src/sync/errors.js";
import type {
  IChannel,
  IChannelFactory,
  ISyncManager,
} from "../../../src/sync/interfaces.js";
import { SyncBuilder } from "../../../src/sync/sync-builder.js";
import { SyncOperation } from "../../../src/sync/sync-operation.js";
import {
  ChannelErrorSource,
  type ChannelConfig,
  type RemoteOptions,
  type SyncEnvelope,
} from "../../../src/sync/types.js";
import { DroppingEventBus, holdIndexCommit } from "../../catch-up/helpers.js";
import { createMockLogger } from "../../factories.js";
import {
  TestChannel,
  type TestChannelOptions,
} from "../../sync/channels/test-channel.js";
import { TestP256Signer } from "../../utils/p256-signer.js";

export const PG_URL =
  process.env.REACTOR_TEST_PG_URL ??
  "postgres://postgres:postgres@localhost:5433/reactor";

export const PURGE_NS = 1_347_571_013;

/** The reactor schema, as the purge and every read model see it. */
export type ReactorDb = Kysely<
  StorageDatabase & DocumentViewDatabase & DocumentIndexerDatabase
>;

/** One database per reactor: the builder hardcodes the `reactor` schema. */
export class PgDatabase {
  private constructor(
    readonly name: string,
    private readonly admin: Pool,
    readonly base: Kysely<Database>,
  ) {}

  static async create(name: string): Promise<PgDatabase> {
    const admin = new Pool({ connectionString: PG_URL });
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${name}"`);
    const url = new URL(PG_URL);
    url.pathname = `/${name}`;
    const pool = new Pool({
      connectionString: url.toString(),
      max: 12,
      application_name: name,
    });
    // Dropping the database terminates whatever is still connected to it.
    pool.on("error", (error: Error & { code?: string }) => {
      if (error.code !== "57P01") throw error;
    });
    const base = new Kysely<Database>({
      dialect: new PostgresDialect({ pool }),
    });
    return new PgDatabase(name, admin, base);
  }

  /** Backends anywhere in the cluster holding an xid, oldest first. */
  async openXids(): Promise<unknown[]> {
    const result = await this.admin.query(
      `select datname, application_name, backend_xid::text as xid, state,
        round(extract(epoch from now() - xact_start)::numeric, 2) as age_s,
        left(query, 120) as query
      from pg_stat_activity where backend_xid is not null
      order by xact_start`,
    );
    return result.rows;
  }

  get reactor(): ReactorDb {
    return this.base.withSchema("reactor") as unknown as ReactorDb;
  }

  async destroy(): Promise<void> {
    try {
      await this.base.destroy();
    } finally {
      await this.admin.query(
        `DROP DATABASE IF EXISTS "${this.name}" WITH (FORCE)`,
      );
      await this.admin.end();
    }
  }
}

/** Accepts a key only for the address a credential binds it to, as Renown does. */
export class BindingTrustPolicy implements SignatureTrustPolicy {
  private readonly bindings = new Set<string>();
  readonly asked: Array<{ address: string; key: string; verdict: boolean }> =
    [];

  bind(address: string, key: string): this {
    this.bindings.add(`${address.toLowerCase()}|${key}`);
    return this;
  }

  authorizeSigner(signer: ActionSigner, key: string): Promise<boolean> {
    const address = signer.user?.address ?? "";
    const verdict = this.bindings.has(`${address.toLowerCase()}|${key}`);
    this.asked.push({ address, key, verdict });
    return Promise.resolve(verdict);
  }
}

export type NodeOptions = {
  name: string;
  db: PgDatabase;
  mesh?: Mesh;
  address?: string;
  trustPolicy?: SignatureTrustPolicy;
  featureFlags?: Partial<ReactorFeatureFlags>;
  peerCapabilities?: PeerCapability[];
  channelFactory?: IChannelFactory;
  /** Sweeps and watermark probes; sync derivation waits on the probe. */
  catchUpIntervalMs?: number;
  /** Default legacy: tests write unsigned through the reactor. */
  createSignaturePolicy?: "legacy" | "v2-required";
  /** Executors; a probe that holds one job open while another runs needs 2. */
  maxConcurrency?: number;
};

export type Node = {
  name: string;
  address: string;
  db: ReactorDb;
  pg: PgDatabase;
  bus: DroppingEventBus;
  key: TestP256Signer;
  client: ReactorClient;
  module: InProcessReactorModule;
  reactor: IReactor;
  sync: ISyncManager | undefined;
};

export async function buildNode(options: NodeOptions): Promise<Node> {
  const bus = new DroppingEventBus();
  const key = await TestP256Signer.create();
  const address = options.address ?? `0x${options.name}host`;
  const signer = key.asISigner([], {
    address,
    networkId: "eip155",
    chainId: 1,
  });

  let builder = new ReactorBuilder()
    .withLogger(createMockLogger())
    .withKysely(options.db.base)
    .withEventBus(bus)
    .withCatchUp({ intervalMs: options.catchUpIntervalMs ?? 3_600_000 })
    .withDocumentModelSources([
      documentModelDocumentModelModule as unknown as DocumentModelModule,
      driveDocumentModelModule as unknown as DocumentModelModule,
    ])
    .withExecutorConfig({
      featureFlags: options.featureFlags ?? {},
      maxConcurrency: options.maxConcurrency,
    });
  if (options.peerCapabilities) {
    builder = builder.withPeerCapabilities(options.peerCapabilities);
  }
  const channelFactory =
    options.channelFactory ?? options.mesh?.factory(options.name);
  if (channelFactory) {
    builder = builder.withSync(
      new SyncBuilder().withChannelFactory(channelFactory),
    );
  }

  const built = await new ReactorClientBuilder()
    .withReactorBuilder(builder)
    .withSigner({ signer, trustPolicy: options.trustPolicy })
    .withCreateSignaturePolicy(options.createSignaturePolicy ?? "legacy")
    .buildModule();
  const module = built.reactorModule!;
  const node: Node = {
    name: options.name,
    address,
    db: options.db.reactor,
    pg: options.db,
    bus,
    key,
    client: built.client,
    module,
    reactor: module.reactor,
    sync: module.syncModule?.syncManager,
  };
  options.mesh?.register(node);
  return node;
}

export async function stopNode(node: Node | undefined): Promise<void> {
  if (!node) return;
  await node.module.reactor.kill().completed;
  await node.module.syncModule?.syncManager.shutdown().completed;
}

export const TERMINAL = [JobStatus.READ_READY, JobStatus.FAILED];

export async function waitForJob(
  reactor: IReactor,
  jobId: string,
  statuses: JobStatus[] = TERMINAL,
  timeout = 15_000,
): Promise<JobInfo> {
  let last: JobInfo | undefined;
  try {
    await vi.waitUntil(
      async () => {
        last = await reactor.getJobStatus(jobId);
        return statuses.includes(last.status);
      },
      { timeout, interval: 10 },
    );
  } catch {
    throw new Error(
      `job ${jobId} never reached ${statuses.join("|")}; last ${last?.status} ${last?.error?.message ?? ""}`,
    );
  }
  return last!;
}

export async function succeeded(
  reactor: IReactor,
  submitted: JobInfo | Promise<JobInfo>,
): Promise<JobInfo> {
  const info = await waitForJob(reactor, (await submitted).id);
  if (info.status !== JobStatus.READ_READY) {
    throw new Error(`job ${info.id} failed: ${info.error?.message}`);
  }
  return info;
}

export function legacyDrive(id: string) {
  return withSignaturePolicy(
    driveDocumentModelModule.utils.createDocument(),
    "legacy",
    { id },
  );
}

let requestCounter = 0;

export async function enqueuePurge(
  node: Node,
  id: string,
  opts: { requestId?: string; allowLarge?: boolean } = {},
): Promise<JobInfo> {
  const service = node.module.documentPurgeService;
  const requestId = opts.requestId ?? `e2e-request-${++requestCounter}`;
  const jobs = await service.enqueuePurge([id], requestId, {
    allowLarge: opts.allowLarge,
  });
  expect(jobs).toHaveLength(1);
  return jobs[0]!;
}

export async function tombstone(
  db: ReactorDb,
  id: string,
): Promise<DocumentPurgeRow | undefined> {
  return db
    .selectFrom("document_purges")
    .selectAll()
    .where("documentId", "=", id)
    .executeTakeFirst();
}

/** Waits for the tombstone: the purge's success signal, event or not. */
export async function waitForTombstone(
  db: ReactorDb,
  id: string,
  timeout = 15_000,
): Promise<DocumentPurgeRow> {
  let row: DocumentPurgeRow | undefined;
  try {
    await vi.waitUntil(
      async () => {
        row = await tombstone(db, id);
        return row !== undefined;
      },
      { timeout, interval: 20 },
    );
  } catch {
    throw new Error(`no document_purges row for ${id} after ${timeout}ms`);
  }
  return row!;
}

/** Purges `id` and waits for its tombstone; fails if the job fails. */
export async function purge(
  node: Node,
  id: string,
  opts: { requestId?: string; allowLarge?: boolean } = {},
): Promise<{ job: JobInfo; ordinal: number }> {
  const job = await enqueuePurge(node, id, opts);
  let failed: JobInfo | undefined;
  await vi.waitUntil(
    async () => {
      const status = await node.reactor.getJobStatus(job.id);
      if (status.status === JobStatus.FAILED) {
        failed = status;
        return true;
      }
      return (await tombstone(node.db, id)) !== undefined;
    },
    { timeout: 15_000, interval: 20 },
  );
  if (failed) {
    throw new Error(
      `purge of ${id} failed: ${failed.error?.name ?? ""} ${failed.error?.message}`,
    );
  }
  const row = await waitForTombstone(node.db, id);
  return { job, ordinal: Number(row.ordinal) };
}

type RowCheck = {
  table: string;
  count: (db: ReactorDb, id: string) => Promise<number>;
};

async function countOf(query: {
  executeTakeFirst(): Promise<{ n: string | number | bigint } | undefined>;
}): Promise<number> {
  return Number((await query.executeTakeFirst())?.n ?? 0);
}

/** Every table the purge deletes from, with the predicate it deletes by. */
export const DELETE_LIST: RowCheck[] = [
  {
    table: "Operation",
    count: (db, id) =>
      countOf(
        db
          .selectFrom("Operation")
          .select((eb) => eb.fn.countAll<number>().as("n"))
          .where("documentId", "=", id)
          .where(sql<boolean>`action->>'type' <> 'PURGE_DOCUMENT'`),
      ),
  },
  {
    table: "operation_index_operations",
    count: (db, id) =>
      countOf(
        db
          .selectFrom("operation_index_operations")
          .select((eb) => eb.fn.countAll<number>().as("n"))
          .where("documentId", "=", id)
          .where(sql<boolean>`action->>'type' <> 'PURGE_DOCUMENT'`),
      ),
  },
  {
    table: "Keyframe",
    count: (db, id) =>
      countOf(
        db
          .selectFrom("Keyframe")
          .select((eb) => eb.fn.countAll<number>().as("n"))
          .where("documentId", "=", id),
      ),
  },
  {
    table: "DocumentSnapshot",
    count: (db, id) =>
      countOf(
        db
          .selectFrom("DocumentSnapshot")
          .select((eb) => eb.fn.countAll<number>().as("n"))
          .where("documentId", "=", id),
      ),
  },
  {
    table: "SlugMapping",
    count: (db, id) =>
      countOf(
        db
          .selectFrom("SlugMapping")
          .select((eb) => eb.fn.countAll<number>().as("n"))
          .where("documentId", "=", id),
      ),
  },
  {
    table: "Document",
    count: (db, id) =>
      countOf(
        db
          .selectFrom("Document")
          .select((eb) => eb.fn.countAll<number>().as("n"))
          .where("id", "=", id),
      ),
  },
  {
    table: "DocumentRelationship",
    count: (db, id) =>
      countOf(
        db
          .selectFrom("DocumentRelationship")
          .select((eb) => eb.fn.countAll<number>().as("n"))
          .where((eb) =>
            eb.or([eb("sourceId", "=", id), eb("targetId", "=", id)]),
          ),
      ),
  },
  {
    // Rows whose groupId is the purged id key survivors and stay.
    table: "group_references",
    count: (db, id) =>
      countOf(
        db
          .selectFrom("group_references")
          .select((eb) => eb.fn.countAll<number>().as("n"))
          .where("documentId", "=", id),
      ),
  },
  {
    table: "sync_dead_letters",
    count: (db, id) =>
      countOf(
        db
          .selectFrom("sync_dead_letters")
          .select((eb) => eb.fn.countAll<number>().as("n"))
          .where("document_id", "=", id),
      ),
  },
  {
    // A hold the marker itself earns is a new row, and stays.
    table: "sync_holds",
    count: (db, id) =>
      countOf(
        db
          .selectFrom("sync_holds")
          .select((eb) => eb.fn.countAll<number>().as("n"))
          .where("document_id", "=", id)
          .where("protocol", "<>", "document-purge"),
      ),
  },
];

/** Kept on purpose, or keyed by something other than a document. */
export const KEPT_TABLES = [
  "document_collections",
  "document_purges",
  "sync_remotes",
  "ProcessorCursor",
  // Holds only markers, each removed by its own load's outcome.
  "sync_received_markers",
  // Payload-free: which remote refused the marker, for the erasure's report.
  "sync_purge_refusals",
];

/** No row about `id` in any table of the delete list, bar the marker. */
export async function expectNoRowsFor(
  db: ReactorDb,
  id: string,
): Promise<void> {
  const counts: Record<string, number> = {};
  for (const check of DELETE_LIST) {
    counts[check.table] = await check.count(db, id);
  }
  const expected = Object.fromEntries(DELETE_LIST.map((c) => [c.table, 0]));
  expect(counts, `rows left for purged ${id}`).toEqual(expected);
}

export type PurgedState = {
  marker: PurgeMarkerOperation;
  ordinal: number;
  tombstone: DocumentPurgeRow;
};

/** The marker alone, its twin at the tombstone ordinal, memberships reopened. */
export async function expectPurged(
  db: ReactorDb,
  id: string,
  opts: { documentType?: string; signerKey?: string; requestId?: string } = {},
): Promise<PurgedState> {
  await expectNoRowsFor(db, id);

  const row = await tombstone(db, id);
  expect(row, `document_purges row for ${id}`).toBeDefined();
  const ordinal = Number(row!.ordinal);
  if (opts.requestId) expect(row!.requestId).toBe(opts.requestId);

  const operations = await db
    .selectFrom("Operation")
    .selectAll()
    .where("documentId", "=", id)
    .execute();
  expect(operations, `Operation rows for ${id}`).toHaveLength(1);
  const stored = operations[0]!;
  const action = stored.action as PurgeMarkerOperation["action"];
  expect(isPurgeMarker({ action })).toBe(true);
  expect(stored).toMatchObject({
    scope: "document",
    branch: "main",
    index: 0,
    skip: 0,
    hash: "",
    opId: deriveOperationId(id, "document", "main", action.id),
  });
  expect(new Date(stored.timestampUtcMs).toISOString()).toBe(
    new Date(action.timestampUtcMs).toISOString(),
  );
  expect(action.input.documentId).toBe(id);
  expect(action.input.purgedAtUtcIso).toBe(
    new Date(action.timestampUtcMs).toISOString(),
  );
  const signatures = action.context?.signer?.signatures ?? [];
  expect(signatures.length, "the marker is signed").toBeGreaterThan(0);
  if (opts.signerKey) {
    expect(action.context?.signer?.app?.key).toBe(opts.signerKey);
  }

  const indexed = await db
    .selectFrom("operation_index_operations")
    .selectAll()
    .where("documentId", "=", id)
    .execute();
  expect(indexed, `index rows for ${id}`).toHaveLength(1);
  expect(Number(indexed[0]!.ordinal)).toBe(ordinal);
  expect(indexed[0]!.opId).toBe(stored.opId);
  if (opts.documentType) {
    expect(indexed[0]!.documentType).toBe(opts.documentType);
    expect(action.input.documentType).toBe(opts.documentType);
  }

  const memberships = await db
    .selectFrom("document_collections")
    .selectAll()
    .where("documentId", "=", id)
    .execute();
  for (const membership of memberships) {
    expect(
      {
        collection: membership.collectionId,
        joined: Number(membership.joinedOrdinal),
        left: membership.leftOrdinal,
      },
      "memberships reopened at the marker ordinal",
    ).toEqual({
      collection: membership.collectionId,
      joined: ordinal,
      left: null,
    });
  }

  const marker: PurgeMarkerOperation = {
    id: stored.opId,
    index: 0,
    skip: 0,
    hash: "",
    timestampUtcMs: action.timestampUtcMs,
    action,
  } as PurgeMarkerOperation;
  return { marker, ordinal, tombstone: row! };
}

export async function memberships(
  db: ReactorDb,
  id: string,
): Promise<
  Array<{ collectionId: string; joined: number; left: number | null }>
> {
  const rows = await db
    .selectFrom("document_collections")
    .selectAll()
    .where("documentId", "=", id)
    .orderBy("collectionId")
    .execute();
  return rows.map((row) => ({
    collectionId: row.collectionId,
    joined: Number(row.joinedOrdinal),
    left: row.leftOrdinal === null ? null : Number(row.leftOrdinal),
  }));
}

/** The operations the store holds for `id`, as the peer would be served them. */
export async function storedOperations(
  node: Node,
  id: string,
  scope = "document",
): Promise<Operation[]> {
  const page = await node.reactor.getOperations(id, {
    branch: "main",
    scopes: [scope],
  });
  return page[scope]?.results ?? [];
}

/** Backends of this database waiting on any heavyweight lock. */
export async function lockWaiters(db: ReactorDb): Promise<number> {
  const result = await sql<{ n: string }>`
    select count(*) as n from pg_stat_activity
    where datname = current_database() and wait_event_type = 'Lock'
  `.execute(db);
  return Number(result.rows[0]!.n);
}

/** Backends waiting on a purge advisory lock (either mode). */
export async function purgeLockWaiters(db: ReactorDb): Promise<number> {
  const result = await sql<{ n: string }>`
    select count(*) as n from pg_locks
    where locktype = 'advisory' and not granted
      and classid = ${PURGE_NS} and objsubid = 2
      and database = (select oid from pg_database where datname = current_database())
  `.execute(db);
  return Number(result.rows[0]!.n);
}

export async function until(
  what: string,
  predicate: () => Promise<boolean> | boolean,
  timeout = 10_000,
  diagnose: () => Promise<unknown> = Mesh.liveState,
): Promise<void> {
  try {
    await vi.waitUntil(predicate, { timeout, interval: 20 });
  } catch (error) {
    let state: string;
    try {
      state = JSON.stringify(await diagnose(), null, 1);
    } catch (diagnoseError) {
      state = `(diagnosis failed: ${String(diagnoseError)})`;
    }
    throw new Error(
      `timed out waiting until ${what}: ${String(error)}\n${state}`,
      {
        cause: error,
      },
    );
  }
}

/** What a stalled sync wait needs: watermarks, sweeps, wires, cluster xids. */
export async function syncState(nodes: Node[], mesh: Mesh): Promise<unknown> {
  return {
    nodes: await Promise.all(
      nodes.map(async (node) => ({
        name: node.name,
        watermark: node.module.settledWatermark.status(),
        catchUp: node.module.catchUp.status().consumers,
        cursors: await node.db
          .selectFrom("sync_cursors")
          .select(["remote_name", "cursor_type", "cursor_ordinal"])
          .execute()
          .catch(String),
      })),
    ),
    wires: [...mesh.wires].map(([name, wire]) => ({
      name,
      paused: wire.paused,
      queued: wire.queued.length,
      delivered: wire.delivered.length,
      withheld: wire.withheld.length,
      gateErrors: wire.gateErrors.map(String),
      deliveryErrors: wire.deliveryErrors.map(String),
    })),
    channels: [...mesh.channels].map(([name, channel]) => ({
      name,
      inbox: channel.inbox.items.map((i) => `${i.documentId}:${i.status}`),
      outbox: channel.outbox.items.map((i) => `${i.documentId}:${i.status}`),
      deadLetter: channel.deadLetter.items.map(
        (i) =>
          `${i.documentId}:${i.error?.errorType}:${i.error?.error.message}`,
      ),
    })),
    openXids: await nodes[0]?.pg.openXids(),
  };
}

/** Lets in-flight work settle before asserting that something did not happen. */
export const quiesce = (ms = 300) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export type ServingGate = {
  gate: SyncScopeGate;
  subject: AuthSubject;
};

type Wire = {
  paused: boolean;
  queued: SyncEnvelope[];
  delivered: SyncEnvelope[];
  withheld: SyncEnvelope[];
  gateErrors: unknown[];
  deliveryErrors: unknown[];
  chain: Promise<void>;
  serving?: ServingGate;
};

export type MeshLinkOptions = {
  tag?: string;
  a?: TestChannelOptions;
  b?: TestChannelOptions;
  remote?: RemoteOptions;
  /** Emulates reactor-api's serving gate on `a`'s outbound wire. */
  servingA?: ServingGate;
  servingB?: ServingGate;
};

const FILTER = { documentId: [], scope: [], branch: "main" };

/** Reactors joined pairwise; a remote is named `from->to[#tag]`. */
export class Mesh {
  readonly channels = new Map<string, TestChannel>();
  readonly wires = new Map<string, Wire>();
  private readonly options = new Map<string, TestChannelOptions>();
  private readonly nodes = new Map<string, Node>();
  private generation = 0;

  factory(owner: string): IChannelFactory {
    return {
      instance: (
        remoteId: string,
        remoteName: string,
        config: ChannelConfig,
        cursorStorage: ISyncCursorStorage,
      ): IChannel => {
        if (config.type === "polling") {
          return new GqlResponseChannel(
            createMockLogger(),
            remoteId,
            remoteName,
            cursorStorage,
          );
        }
        const peerName = Mesh.reverse(remoteName);
        const wire = this.wire(remoteName);
        const channel = new TestChannel(
          remoteId,
          remoteName,
          cursorStorage,
          (envelope) => this.transmit(remoteName, peerName, wire, envelope),
          {
            ...this.options.get(remoteName),
            peer: () => this.channels.get(peerName),
          },
        );
        void owner;
        this.channels.set(remoteName, channel);
        return channel;
      },
    } as IChannelFactory;
  }

  register(node: Node): void {
    this.nodes.set(node.name, node);
    Mesh.live.add(this);
  }

  private static readonly live = new Set<Mesh>();

  /** syncState of every mesh with registered nodes, for a timed-out wait. */
  static async liveState(): Promise<unknown> {
    const states = [];
    for (const mesh of Mesh.live) {
      states.push(await syncState([...mesh.nodes.values()], mesh));
    }
    return states;
  }

  static reverse(remoteName: string): string {
    const [pair, tag] = remoteName.split("#");
    return pair!.split("->").reverse().join("->") + (tag ? `#${tag}` : "");
  }

  static names(a: Node, b: Node, tag?: string): [string, string] {
    const suffix = tag ? `#${tag}` : "";
    return [`${a.name}->${b.name}${suffix}`, `${b.name}->${a.name}${suffix}`];
  }

  wire(remoteName: string): Wire {
    let wire = this.wires.get(remoteName);
    if (!wire) {
      wire = {
        paused: false,
        queued: [],
        delivered: [],
        withheld: [],
        gateErrors: [],
        deliveryErrors: [],
        chain: Promise.resolve(),
      };
      this.wires.set(remoteName, wire);
    }
    return wire;
  }

  /** Both directions of a channel for `driveId`'s collection. */
  async link(
    a: Node,
    b: Node,
    driveId: string,
    options: MeshLinkOptions = {},
  ): Promise<[string, string]> {
    const [toB, toA] = Mesh.names(a, b, options.tag);
    this.options.set(toB, options.a ?? {});
    this.options.set(toA, options.b ?? {});
    this.wire(toB).serving = options.servingA;
    this.wire(toA).serving = options.servingB;
    const collection = DriveCollectionId.forDrive(driveId);
    const config = { type: "internal", parameters: {} };
    await a.sync!.add(toB, collection, config, FILTER, options.remote);
    await b.sync!.add(toA, collection, config, FILTER);
    return [toB, toA];
  }

  async unlink(a: Node, b: Node, tag?: string): Promise<void> {
    const [toB, toA] = Mesh.names(a, b, tag);
    await a.sync!.remove(toB);
    await b.sync!.remove(toA);
  }

  pause(remoteName: string): void {
    this.wire(remoteName).paused = true;
  }

  resume(remoteName: string): void {
    const wire = this.wire(remoteName);
    wire.paused = false;
    const peerName = Mesh.reverse(remoteName);
    for (const envelope of wire.queued.splice(0)) {
      this.transmit(remoteName, peerName, wire, envelope);
    }
  }

  /** What went over the wire named `remoteName`, flattened to operations. */
  deliveredOperations(remoteName: string): OperationWithContext[] {
    return this.wire(remoteName).delivered.flatMap(
      (envelope) => envelope.operations ?? [],
    );
  }

  /** A remote reports back what it dead-lettered, as GqlRequestChannel does. */
  reportDeadLetters(fromRemote: string, documentId: string): SyncOperation[] {
    const source = this.channels.get(fromRemote)!;
    const target = this.channels.get(Mesh.reverse(fromRemote))!;
    const reported = source.deadLetter.items
      .filter((item) => item.documentId === documentId)
      .map((item) => {
        const copy = new SyncOperation(
          crypto.randomUUID(),
          item.jobId,
          [],
          Mesh.reverse(fromRemote),
          item.documentId,
          item.scopes,
          item.branch,
          [],
        );
        copy.failed(
          new ChannelError(
            ChannelErrorSource.Outbox,
            new Error(item.error?.error.message ?? "refused"),
            item.error?.errorType,
          ),
        );
        return copy;
      });
    if (reported.length > 0) target.deadLetter.add(...reported);
    return reported;
  }

  private transmit(
    remoteName: string,
    peerName: string,
    wire: Wire,
    envelope: SyncEnvelope,
  ): void {
    if (wire.paused) {
      wire.queued.push(envelope);
      return;
    }
    const generation = this.generation;
    wire.chain = wire.chain.then(async () => {
      let served = envelope;
      if (wire.serving && envelope.operations) {
        try {
          served = await this.gated(wire.serving, envelope);
        } catch (error) {
          wire.gateErrors.push(error);
          return;
        }
      }
      if (!served.operations || served.operations.length === 0) {
        wire.withheld.push(envelope);
        return;
      }
      const peer = await this.channelNamed(peerName);
      // A cleared mesh's envelope must not reach the next test's same-named peer.
      if (generation !== this.generation) return;
      if (!peer) {
        wire.deliveryErrors.push(new Error(`no channel ${peerName}`));
        return;
      }
      try {
        peer.receive(served);
      } catch (error) {
        wire.deliveryErrors.push(error);
        return;
      }
      wire.delivered.push(served);
    });
  }

  /** The peer's channel is created by its own add, which may not have run yet. */
  private async channelNamed(name: string): Promise<TestChannel | undefined> {
    for (let i = 0; i < 250 && !this.channels.has(name); i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return this.channels.get(name);
  }

  /** reactor-api's collectHeldSyncOperations, per operation scope. */
  private async gated(
    serving: ServingGate,
    envelope: SyncEnvelope,
  ): Promise<SyncEnvelope> {
    const operations = envelope.operations ?? [];
    const kept: OperationWithContext[] = [];
    for (const op of operations) {
      const readable = await serving.gate.scopePredicateById(
        op.context.documentId,
        serving.subject,
        op.context.branch,
      );
      if (readable(op.context.scope)) kept.push(op);
    }
    return { ...envelope, operations: kept };
  }

  async settle(): Promise<void> {
    await Promise.all([...this.wires.values()].map((wire) => wire.chain));
  }

  clear(): void {
    Mesh.live.delete(this);
    this.generation++;
    this.channels.clear();
    this.wires.clear();
    this.options.clear();
    this.nodes.clear();
  }
}

/** A serving gate over `node`'s own document view, below authEnforcement. */
export function bareServingGate(node: Node, subject: AuthSubject): ServingGate {
  return {
    gate: new SyncScopeGate(new BareReadGate(), node.module.documentView),
    subject,
  };
}

/** reactor-api's buildSyncServingGate, open by default. */
export function servingGate(node: Node, subject: AuthSubject): ServingGate {
  const { module } = node;
  const model = readDecisionModel(
    module.featureFlags,
    module.documentModelRegistry,
  );
  if (!model) return bareServingGate(node, subject);
  return {
    gate: new SyncScopeGate(
      new ModelReadGate(
        model,
        module.documentView,
        module.featureFlags.authGroups,
        module.operationIndex,
        undefined,
        { withholdUninitialized: false },
      ),
      module.documentView,
    ),
    subject,
  };
}

/** A manifest as a peer from before this spec announces it. */
export function manifestWithout(protocol: string, sequence = 0): PeerManifest {
  return localPeerManifest(
    PEER_CAPABILITIES.filter((capability) => capability.name !== protocol),
    {},
    undefined,
    sequence,
  );
}

/** The full local manifest, as the same peer announces it after upgrading. */
export function fullManifest(sequence = 1): PeerManifest {
  return localPeerManifest(PEER_CAPABILITIES, {}, undefined, sequence);
}

export const WRITE_READY = ReactorEventTypes.JOB_WRITE_READY;

/** Remotes whose channel records what the outbox sends and delivers nowhere. */
export class CaptureChannels {
  readonly sent = new Map<string, SyncEnvelope[]>();

  factory(): IChannelFactory {
    return {
      instance: (
        remoteId: string,
        remoteName: string,
        _config: ChannelConfig,
        cursorStorage: ISyncCursorStorage,
      ): IChannel => {
        const sent: SyncEnvelope[] = [];
        this.sent.set(remoteName, sent);
        return new TestChannel(remoteId, remoteName, cursorStorage, (e) => {
          sent.push(e);
        });
      },
    } as IChannelFactory;
  }

  /** A remote announcing document-purge; a silent one is held from markers. */
  async add(node: Node, remoteName: string, driveId: string): Promise<void> {
    await node.sync!.add(
      remoteName,
      DriveCollectionId.forDrive(driveId),
      { type: "internal", parameters: {} },
      FILTER,
      undefined,
      undefined,
      fullManifest(),
    );
  }

  operations(remoteName: string): OperationWithContext[] {
    return (this.sent.get(remoteName) ?? []).flatMap((e) => e.operations ?? []);
  }

  sentOpIds(remoteName: string): Set<string> {
    return new Set(this.operations(remoteName).map((op) => op.operation.id));
  }
}

/** holdIndexCommit on a node's reactor schema. */
export function holdIndexCommitOn(node: Node, documentId: string) {
  return holdIndexCommit(
    node.db as unknown as Kysely<StorageDatabase>,
    documentId,
  );
}

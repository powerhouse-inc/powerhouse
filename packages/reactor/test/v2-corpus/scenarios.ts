import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  Action,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  createAction,
  deriveOperationId,
  redo,
  replayDocument,
  undo,
  withSignaturePolicy,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { InProcessReactorModule } from "../../src/core/types.js";
import type { ReactorFeatureFlags } from "../../src/executor/types.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";

// Self-contained so it runs unchanged on a tree before stage 1.

export const CORPUS_START = "2026-01-01T00:00:00.000Z";

export const CORPUS_PATH = new URL(
  "../fixtures/v2-corpus.json",
  import.meta.url,
).pathname;

export type CorpusKind = "document-model" | "drive";

export type RecordedRow = {
  index: number;
  skip: number;
  type: string;
  id: string;
  input: unknown;
  timestampUtcMs: string;
  hash: string;
  error: string | null;
};

export type RecordedReplica = {
  name: string;
  rows: RecordedRow[];
  served: unknown;
  /** v2 `replayDocument` ignores skips: recorded, not compared with served. */
  replayDocument: unknown;
};

export type RecordedScenario = {
  name: string;
  source: string;
  kind: CorpusKind;
  replicas: RecordedReplica[];
  refusals: string[];
};

export type Corpus = { scenarios: RecordedScenario[] };

export type Replica = { name: string; module: InProcessReactorModule };

type Actions = Action[] | (() => Action[]);

export class CorpusContext {
  readonly replicas: Replica[] = [];
  readonly refusals: string[] = [];
  readonly docId: string;
  private readonly document: PHDocument;

  constructor(
    readonly kind: CorpusKind,
    name: string,
  ) {
    this.document = scenarioDocument({ kind, name });
    this.docId = this.document.header.id;
  }

  now(): number {
    return Date.now();
  }

  at(iso: string): void {
    vi.setSystemTime(new Date(iso));
  }

  tick(ms = 1_000): void {
    vi.setSystemTime(new Date(Date.now() + ms));
  }

  async replica(
    name: string,
    featureFlags: Partial<ReactorFeatureFlags> = {},
  ): Promise<Replica> {
    const module = await new ReactorBuilder()
      .withDocumentModelSources([
        documentModelDocumentModelModule as never,
        driveDocumentModelModule as never,
      ])
      .withExecutorConfig({ featureFlags })
      .buildModule();
    const replica = { name, module };
    this.replicas.push(replica);
    await this.ok(replica, await module.reactor.create(this.document));
    return replica;
  }

  /** Runs in a second of its own, so no two rows share a timestamp. */
  async tryExecute(
    replica: Replica,
    actions: Actions,
    options: { at?: string } = {},
  ): Promise<string | undefined> {
    if (options.at) {
      this.at(options.at);
    } else {
      this.tick();
    }
    const batch = typeof actions === "function" ? actions() : actions;
    const job = await settle(
      replica.module,
      await replica.module.reactor.execute(this.docId, "main", batch),
    );
    this.tick();
    if (job.status === JobStatus.FAILED) {
      const message = job.error?.message ?? "failed";
      const cause = /Original error: (.*)$/.exec(message)?.[1] ?? message;
      this.refusals.push(`${replica.name}: ${cause}`);
      return message;
    }
    return undefined;
  }

  async execute(
    replica: Replica,
    actions: Actions,
    options: { at?: string } = {},
  ): Promise<void> {
    const refused = await this.tryExecute(replica, actions, options);
    if (refused !== undefined) {
      throw new Error(`execute on ${replica.name} failed: ${refused}`);
    }
  }

  async load(replica: Replica, operations: Operation[]): Promise<void> {
    await this.ok(
      replica,
      await replica.module.reactor.load(this.docId, "main", operations),
    );
  }

  async stored(replica: Replica): Promise<Operation[]> {
    const result = (await replica.module.reactor.getOperations(this.docId, {
      branch: "main",
      scopes: ["global"],
    })) as Record<string, { results: Operation[] } | undefined>;
    return result.global?.results ?? [];
  }

  operation(action: Action, index: number, skip = 0): Operation {
    return {
      id: deriveOperationId(this.docId, action.scope, "main", action.id),
      index,
      skip,
      hash: "",
      timestampUtcMs: action.timestampUtcMs,
      action,
    };
  }

  private async ok(replica: Replica, job: JobInfo): Promise<void> {
    const status = await settle(replica.module, job);
    if (status.status !== JobStatus.READ_READY) {
      throw new Error(
        `job on ${replica.name} failed: ${status.error?.message ?? status.status}`,
      );
    }
  }
}

export function corpusDocument(kind: CorpusKind, id: string): PHDocument {
  const created =
    kind === "drive"
      ? driveDocumentModelModule.utils.createDocument()
      : documentModelDocumentModelModule.utils.createDocument();
  return withSignaturePolicy(created as PHDocument, "legacy", {
    id,
    protocolVersions: { "base-reducer": 2 },
  });
}

export const CORPUS_MODULES = {
  "document-model": documentModelDocumentModelModule,
  drive: driveDocumentModelModule,
} as unknown as Record<
  CorpusKind,
  {
    reducer: (
      document: PHDocument,
      action: Action,
      ...rest: unknown[]
    ) => PHDocument;
  }
>;

export function globalState(document: PHDocument): unknown {
  return (document.state as unknown as { global: unknown }).global;
}

export function scenarioDocument(scenario: {
  kind: CorpusKind;
  name: string;
}): PHDocument {
  return corpusDocument(scenario.kind, `v2-corpus-${scenario.name}`);
}

/** Recorded rows as stored operations; labels stand in for action ids. */
export function operationsOf(docId: string, rows: RecordedRow[]): Operation[] {
  return rows.map((row) => {
    const action: Action = {
      id: row.id,
      type: row.type,
      scope: "global",
      input: row.input,
      timestampUtcMs: row.timestampUtcMs,
    };
    return {
      id: deriveOperationId(docId, "global", "main", row.id),
      index: row.index,
      skip: row.skip,
      hash: row.hash,
      timestampUtcMs: row.timestampUtcMs,
      action,
      ...(row.error === null ? {} : { error: row.error }),
    };
  });
}

export function replayDocumentState(
  scenario: { kind: CorpusKind; name: string },
  rows: RecordedRow[],
): unknown {
  const initial = scenarioDocument(scenario);
  try {
    const document = replayDocument(
      initial.initialState,
      { global: operationsOf(initial.header.id, rows) },
      CORPUS_MODULES[scenario.kind].reducer as never,
      initial.header,
      undefined,
      {},
      { checkHashes: false, skipIndexValidation: true },
    );
    return globalState(document);
  } catch (error) {
    // Stored hashes cover states in JSONB key order, so the final hash check
    // can fail on key order alone; the error carries the derived document.
    if (!(error instanceof Error) || error.name !== "HashMismatchError") {
      throw error;
    }
    return globalState(
      (error as unknown as { _document: PHDocument })._document,
    );
  }
}

async function settle(
  module: InProcessReactorModule,
  job: JobInfo,
): Promise<JobInfo> {
  let status = await module.reactor.getJobStatus(job.id);
  while (
    status.status !== JobStatus.READ_READY &&
    status.status !== JobStatus.FAILED
  ) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    status = await module.reactor.getJobStatus(job.id);
  }
  return status;
}

function moduleAt(id: string, at: number): Action {
  return {
    ...addModule({ id, name: id }),
    timestampUtcMs: new Date(at).toISOString(),
  };
}

function peerNoop(id: string, at: number): Action {
  return {
    id,
    type: "NOOP",
    scope: "global",
    input: {},
    timestampUtcMs: new Date(at).toISOString(),
  };
}

function folderAt(id: string, at: number): Action {
  return {
    ...driveDocumentModelModule.actions.addFolder({
      id,
      name: id,
      parentFolder: null,
    }),
    timestampUtcMs: new Date(at).toISOString(),
  };
}

const add = (id: string) => () => [addModule({ id, name: id })];

export type Scenario = {
  name: string;
  source: string;
  kind: CorpusKind;
  run: (ctx: CorpusContext) => Promise<void>;
};

/** Ten minutes back, so it sorts before everything local. */
const early = (ctx: CorpusContext, id: string, offsetMs = 0) =>
  moduleAt(id, ctx.now() - 600_000 + offsetMs);

async function twoUndos(ctx: CorpusContext, r: Replica): Promise<void> {
  await ctx.execute(r, add("a"));
  await ctx.execute(r, add("b"));
  await ctx.execute(r, () => [undo()]);
  await ctx.execute(r, () => [undo()]);
}

async function reshuffledUndo(ctx: CorpusContext, r: Replica): Promise<void> {
  await ctx.execute(r, () => [early(ctx, "m0", 60_000)]);
  await ctx.execute(r, () => [undo()]);
  await ctx.load(r, [ctx.operation(early(ctx, "m1"), 0)]);
}

async function undoneDocument(ctx: CorpusContext, r: Replica): Promise<void> {
  await ctx.execute(r, add("m0"), { at: "2026-01-01T00:00:02.000Z" });
  await ctx.execute(r, () => [undo()], { at: "2026-01-01T00:00:03.000Z" });
}

const INCOMING_TS = "2026-01-01T00:00:01.000Z";

function incoming(
  ctx: CorpusContext,
  action: { id: string; type: string; input: unknown },
): Operation {
  return ctx.operation(
    {
      ...action,
      scope: "global",
      timestampUtcMs: INCOMING_TS,
    } as Action,
    0,
    action.type === "NOOP" ? 1 : 0,
  );
}

export const SCENARIOS: Scenario[] = [
  {
    name: "rewind-stamped-before-window",
    source:
      "load-rewind: re-appends a live row stamped before the conflict window",
    kind: "document-model",
    run: async (ctx) => {
      const r = await ctx.replica("a");
      const base = ctx.now() + 60_000;
      await ctx.execute(r, () => [moduleAt("x", base + 30)]);
      await ctx.execute(r, () => [moduleAt("y", base + 10)]);
      await ctx.load(r, [ctx.operation(moduleAt("z", base + 20), 0)]);
    },
  },
  {
    name: "rewind-predecessor-rule",
    source:
      "load-rewind: re-appends a live row the predecessor rule leaves out",
    kind: "document-model",
    run: async (ctx) => {
      const r = await ctx.replica("a");
      const base = ctx.now() + 60_000;
      const a = moduleAt("a", base);
      await ctx.load(r, [
        ctx.operation(a, 0),
        ctx.operation(moduleAt("b", base + 10), 1),
        ctx.operation(moduleAt("c", base + 20), 2),
      ]);
      await ctx.load(r, [
        ctx.operation(a, 10),
        ctx.operation(moduleAt("d", base + 15), 11),
      ]);
    },
  },
  {
    name: "rewind-earlier-head",
    source:
      "load-rewind: re-appends a row stored after the earlier head it rewinds to",
    kind: "document-model",
    run: async (ctx) => {
      const r = await ctx.replica("a");
      const base = ctx.now() + 60_000;
      await ctx.execute(r, () => [moduleAt("p", base)]);
      await ctx.load(r, [ctx.operation(moduleAt("q", base - 10), 0)]);
      await ctx.execute(r, () => [moduleAt("r", base - 20)]);
      await ctx.load(r, [ctx.operation(moduleAt("s", base - 15), 0)]);
    },
  },
  {
    name: "rewind-moves-local-undo",
    source:
      "load-rewind: keeps an undo the reshuffle moves on the operation it undid",
    kind: "document-model",
    run: async (ctx) => {
      const r = await ctx.replica("a");
      const base = ctx.now() + 60_000;
      await ctx.execute(r, () => [moduleAt("x", base - 120_000)]);
      await ctx.execute(r, () => [undo()]);
      await ctx.load(r, [ctx.operation(moduleAt("z", base - 90_000), 0)]);
    },
  },
  {
    name: "rewind-moves-peer-undo",
    source: "load-rewind: keeps a peer's undo on the operation it undid",
    kind: "document-model",
    run: async (ctx) => {
      const r = await ctx.replica("a");
      const base = ctx.now() + 60_000;
      await ctx.load(r, [ctx.operation(moduleAt("x", base), 0)]);
      await ctx.execute(r, () => [moduleAt("w", base + 20)]);
      await ctx.load(r, [
        ctx.operation(peerNoop("peer-undo", base + 10), 1, 1),
      ]);
    },
  },
  {
    name: "append-peer-undo",
    source: "load-append-undo: keeps a peer's undo on the operation it undid",
    kind: "document-model",
    run: async (ctx) => {
      const undoing = await ctx.replica("undoing");
      const receiving = await ctx.replica("receiving");
      await ctx.execute(undoing, add("x"), { at: "2026-01-01T00:00:01.000Z" });
      await ctx.load(receiving, await ctx.stored(undoing));
      await ctx.execute(receiving, add("l"), {
        at: "2026-01-01T00:00:02.000Z",
      });
      await ctx.execute(undoing, () => [undo()], {
        at: "2026-01-01T00:00:03.000Z",
      });
      const noop = (await ctx.stored(undoing)).find(
        (operation) => operation.action.type === "NOOP",
      )!;
      await ctx.load(receiving, [noop]);
    },
  },
  {
    name: "noop-headed-reshuffle-local",
    source:
      "load-noop-head: derives the same state on every path as the live op set",
    kind: "document-model",
    run: async (ctx) => {
      const r = await ctx.replica("a");
      const base = ctx.now() + 60_000;
      await ctx.execute(r, () => [moduleAt("x", base - 20_000)]);
      await ctx.execute(r, () => [moduleAt("w", base - 10_000)]);
      await ctx.execute(r, () => [moduleAt("y", base - 120_000)]);
      await ctx.execute(r, () => [undo()]);
      await ctx.load(r, [ctx.operation(moduleAt("z", base - 30_000), 0)]);
    },
  },
  {
    name: "double-undo",
    source: "effective-ops-rules (i): two consecutive UNDOs",
    kind: "document-model",
    run: async (ctx) => {
      await twoUndos(ctx, await ctx.replica("a"));
    },
  },
  {
    name: "double-undo-then-reshuffle",
    source:
      "effective-ops-rules (i): keeps both undone across a load reshuffle",
    kind: "document-model",
    run: async (ctx) => {
      const r = await ctx.replica("a");
      await twoUndos(ctx, r);
      await ctx.load(r, [ctx.operation(early(ctx, "z"), 0)]);
    },
  },
  {
    name: "double-undo-then-backdated-execute",
    source:
      "effective-ops-rules (i): keeps both undone across a backdated execute",
    kind: "document-model",
    run: async (ctx) => {
      const r = await ctx.replica("a", { documentDecisions: true });
      await twoUndos(ctx, r);
      await ctx.execute(r, () => [early(ctx, "z")]);
    },
  },
  {
    name: "undo-then-redo-refused",
    source:
      "effective-ops-rules (ii): REDO is refused once the stream holds a NOOP marker",
    kind: "document-model",
    run: async (ctx) => {
      const r = await ctx.replica("a");
      await ctx.execute(r, add("a"));
      await ctx.execute(r, add("b"));
      await ctx.execute(r, () => [undo()]);
      await ctx.tryExecute(r, () => [redo()]);
    },
  },
  {
    name: "undo-reexecute-undo",
    source:
      "effective-ops-rules (ii): one effective set when the undone action is executed again",
    kind: "document-model",
    run: async (ctx) => {
      const r = await ctx.replica("a");
      await ctx.execute(r, add("a"));
      await ctx.execute(r, add("b"));
      await ctx.execute(r, () => [undo()]);
      await ctx.execute(r, add("b2"));
      await ctx.execute(r, () => [undo()]);
    },
  },
  {
    name: "reshuffle-reappends-local-noop",
    source:
      "effective-ops-rules (iii): an UNDO after a reshuffle re-appended a local NOOP",
    kind: "document-model",
    run: async (ctx) => {
      const r = await ctx.replica("a");
      await reshuffledUndo(ctx, r);
      await ctx.tryExecute(r, () => [undo()]);
    },
  },
  {
    name: "reshuffle-reappends-local-noop-over-two",
    source:
      "effective-ops-rules (iii): the later UNDO is accepted and changes nothing",
    kind: "document-model",
    run: async (ctx) => {
      const r = await ctx.replica("a");
      await ctx.execute(r, () => [early(ctx, "m0", 60_000)]);
      await ctx.execute(r, () => [early(ctx, "mx", 60_010)]);
      await ctx.execute(r, () => [undo()]);
      await ctx.load(r, [ctx.operation(early(ctx, "m1"), 0)]);
      await ctx.execute(r, () => [undo()]);
    },
  },
  {
    name: "content-headed-reshuffle",
    source: "effective-ops-rules (iv): a content-headed reshuffle",
    kind: "document-model",
    run: async (ctx) => {
      const r = await ctx.replica("a");
      await ctx.execute(r, add("x"));
      await ctx.load(r, [ctx.operation(early(ctx, "z"), 0)]);
    },
  },
  {
    name: "noop-headed-reshuffle-peer",
    source: "effective-ops-rules (iv): a NOOP-headed reshuffle",
    kind: "document-model",
    run: async (ctx) => {
      const r = await ctx.replica("a");
      await ctx.execute(r, add("m0"));
      await ctx.execute(r, add("m1"));
      const peerUndo = peerNoop("peer-undo", ctx.now() - 600_000);
      await ctx.load(r, [ctx.operation(peerUndo, 0, 1)]);
    },
  },
  {
    name: "incoming-noop-sorts-first",
    source:
      "load-noop-skip: keeps the reshuffle's skip when the NOOP sorts first",
    kind: "document-model",
    run: async (ctx) => {
      const r = await ctx.replica("a");
      await undoneDocument(ctx, r);
      await ctx.load(r, [
        incoming(ctx, { id: "incoming-noop", type: "NOOP", input: {} }),
      ]);
    },
  },
  {
    name: "local-noop-reappended",
    source: "load-noop-skip: leaves a re-appended local NOOP's skip at zero",
    kind: "document-model",
    run: async (ctx) => {
      const r = await ctx.replica("a");
      await undoneDocument(ctx, r);
      await ctx.load(r, [
        incoming(ctx, {
          id: "incoming-module",
          type: "ADD_MODULE",
          input: { id: "m1", name: "m1" },
        }),
      ]);
    },
  },
  {
    name: "lost-own-operation",
    source:
      "lost-operation-resend (#6): a sender skip retracts the receiver's own row",
    kind: "drive",
    run: async (ctx) => {
      const a = await ctx.replica("a");
      const b = await ctx.replica("b");
      const base = ctx.now() + 60_000;
      await ctx.execute(a, () => [folderAt("x", base)]);
      await ctx.execute(b, () => [folderAt("y", base - 10_000)]);
      await ctx.load(b, await ctx.stored(a));

      // Stand-in for the pre-fix load of y on A, as the pinned test writes it.
      const yOnB = (await ctx.stored(b)).find(
        (operation) => (operation.action.input as { id: string }).id === "y",
      )!;
      const store = a.module.operationStore;
      const revisions = await store.getRevisions(ctx.docId, "main");
      const index = revisions.revision.global;
      await store.apply(
        ctx.docId,
        "powerhouse/document-drive",
        "global",
        "main",
        index,
        (txn) => {
          txn.addOperations({ ...yOnB, index, skip: 1 });
        },
      );
      a.module.writeCache.invalidate(ctx.docId, "global", "main");

      // A later write brings the damaged stream into the served state.
      await ctx.execute(a, () => [folderAt("w", base + 10_000)]);
    },
  },
  {
    name: "trivial-append-peer-undo",
    source:
      "lost-operation-resend (#6b): keeps A's own op live when B undoes an op concurrently",
    kind: "drive",
    run: async (ctx) => {
      const a = await ctx.replica("a");
      const b = await ctx.replica("b");
      await ctx.execute(b, () => [folderAt("b1", ctx.now())]);
      await ctx.load(a, await ctx.stored(b));
      await ctx.execute(a, () => [folderAt("a1", ctx.now())]);
      await ctx.execute(b, () => [undo()]);
      const noop = (await ctx.stored(b)).at(-1)!;
      await ctx.load(a, [noop]);
      const a1 = (await ctx.stored(a)).find(
        (operation) => (operation.action.input as { id: string }).id === "a1",
      )!;
      await ctx.load(b, [a1]);
    },
  },
];

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/** Action ids become `TYPE#n` by first appearance; every other field is kept. */
export async function recordScenario(
  scenario: Scenario,
): Promise<RecordedScenario> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(CORPUS_START));
  // Action stamps never repeat within a process. One stamp here shows the clock
  // stepping back from the previous scenario, so this one's stamps start fresh.
  createAction("NOOP");
  const ctx = new CorpusContext(scenario.kind, scenario.name);
  try {
    await scenario.run(ctx);

    const labels = new Map<string, string>();
    let next = 0;
    const label = (id: string, type: string): string => {
      let found = labels.get(id);
      if (!found) {
        found = `${type}#${++next}`;
        labels.set(id, found);
      }
      return found;
    };
    const streams: Array<[Replica, Operation[]]> = [];
    for (const replica of ctx.replicas) {
      const stored = await ctx.stored(replica);
      for (const operation of stored) {
        label(operation.action.id, operation.action.type);
      }
      streams.push([replica, stored]);
    }
    const scrub = (text: string): string =>
      text.replace(UUID, (id) => labels.get(id) ?? "<uuid>");

    const replicas: RecordedReplica[] = [];
    for (const [replica, stored] of streams) {
      const served = await replica.module.reactor.get(ctx.docId);
      const rows: RecordedRow[] = stored.map((operation) => ({
        index: operation.index,
        skip: operation.skip,
        type: operation.action.type,
        id: label(operation.action.id, operation.action.type),
        input: operation.action.input,
        timestampUtcMs: operation.timestampUtcMs,
        hash: operation.hash,
        error: operation.error ? scrub(operation.error) : null,
      }));
      replicas.push({
        name: replica.name,
        rows,
        served: globalState(served),
        replayDocument: replayDocumentState(scenario, rows),
      });
    }
    return {
      name: scenario.name,
      source: scenario.source,
      kind: scenario.kind,
      replicas,
      refusals: ctx.refusals.map(scrub),
    };
  } finally {
    for (const replica of ctx.replicas) {
      replica.module.reactor.kill();
    }
    vi.useRealTimers();
  }
}

export async function recordCorpus(): Promise<Corpus> {
  const scenarios: RecordedScenario[] = [];
  for (const scenario of SCENARIOS) {
    scenarios.push(await recordScenario(scenario));
  }
  return { scenarios };
}

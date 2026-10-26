import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { ReplayStateMode } from "@powerhousedao/shared/processors";

/** One `DocumentSnapshot` row: a scope's latest state, or the header. */
export type ReplaySnapshotRow = {
  documentId: string;
  scope: string;
  branch: string;
  content: unknown;
  /** The scope's last operation index the row includes. */
  lastOperationIndex: number;
  isDeleted: boolean;
};

/** Where a replay's states come from; the processor manager supplies both. */
export type ReplayStateSources = {
  /** The snapshot rows of these documents, every scope and the header, on these branches. */
  snapshots(
    documentIds: string[],
    branches: string[],
  ): Promise<ReplaySnapshotRow[]>;
  /** Each operation with its state at its own revision, rebuilt from the write cache. */
  exact(operations: OperationWithContext[]): Promise<OperationWithContext[]>;
};

/** Turns one backfill page's deliveries into the ones a processor gets. */
export type ReplayPage = (
  operations: OperationWithContext[],
) => Promise<OperationWithContext[]>;

/**
 * Starts one backfill scan's state filling. A replay reads operations from the
 * index, which keeps no `resultingState`; a live delivery carries the
 * executor's. Per mode:
 *
 * - `latest`: every operation, with the document's latest snapshot state.
 * - `collapse`: per stream, only the page's last operation, with the snapshot
 *   state; operations the snapshot includes are skipped, in later pages too.
 * - `exact`: every operation, with its state at its own revision.
 * - `operations`: as read, without state.
 *
 * A stream whose snapshot is behind the page (the document view has yet to
 * apply it) gets the exact state instead, so a replay never delivers a state
 * older than its operation. A deleted document's operations pass as read.
 * The skip memory lives for one scan.
 */
export function startReplayState(
  mode: ReplayStateMode,
  sources: ReplayStateSources,
): ReplayPage | undefined {
  if (mode === "operations") return undefined;
  if (mode === "exact") return (operations) => fillExact(operations, sources);
  const covered = new Map<string, number>();
  return (operations) =>
    fillFromSnapshots(operations, mode === "collapse", covered, sources);
}

async function fillExact(
  operations: OperationWithContext[],
  sources: ReplayStateSources,
): Promise<OperationWithContext[]> {
  const missing = operations.filter((op) => !op.context.resultingState);
  if (missing.length === 0) return operations;
  const rebuilt = await rebuildOrPass(missing, sources);
  return mergeByOrdinal(
    operations.filter((op) => op.context.resultingState),
    rebuilt,
  );
}

async function fillFromSnapshots(
  operations: OperationWithContext[],
  collapse: boolean,
  covered: Map<string, number>,
  sources: ReplayStateSources,
): Promise<OperationWithContext[]> {
  const kept = collapse
    ? operations.filter(
        (op) => op.operation.index > (covered.get(streamKey(op)) ?? -1),
      )
    : operations;
  const missing = kept.filter((op) => !op.context.resultingState);
  if (missing.length === 0) return kept;

  const documents = await loadDocuments(missing, sources);
  const streams = new Map<string, OperationWithContext[]>();
  for (const op of missing) {
    const key = streamKey(op);
    const ops = streams.get(key);
    if (ops) ops.push(op);
    else streams.set(key, [op]);
  }

  const out: OperationWithContext[] = kept.filter(
    (op) => op.context.resultingState,
  );
  const behind: OperationWithContext[] = [];
  for (const [key, ops] of streams) {
    const last = ops[ops.length - 1]!;
    const document = documents.get(documentKey(last));
    if (document?.deleted) {
      out.push(...ops);
      continue;
    }
    const index = document?.indexes.get(last.context.scope);
    if (!document || index === undefined || index < last.operation.index) {
      behind.push(...(collapse ? [last] : ops));
      continue;
    }
    if (collapse) {
      covered.set(key, index);
      out.push(withState(last, document.state));
    } else {
      for (const op of ops) out.push(withState(op, document.state));
    }
  }
  if (behind.length > 0) out.push(...(await rebuildOrPass(behind, sources)));
  return out.sort((a, b) => a.context.ordinal - b.context.ordinal);
}

type ReplayDocument = {
  /** `resultingState` as the executor writes it: every scope, then the header. */
  state: string;
  /** Per scope, the last operation index its snapshot includes. */
  indexes: Map<string, number>;
  deleted: boolean;
};

async function loadDocuments(
  operations: OperationWithContext[],
  sources: ReplayStateSources,
): Promise<Map<string, ReplayDocument>> {
  const ids = [...new Set(operations.map((op) => op.context.documentId))];
  const branches = [...new Set(operations.map((op) => op.context.branch))];
  const rows = await sources.snapshots(ids, branches);

  const grouped = new Map<string, ReplaySnapshotRow[]>();
  for (const row of rows) {
    const key = `${row.documentId}\u0000${row.branch}`;
    const list = grouped.get(key);
    if (list) list.push(row);
    else grouped.set(key, [row]);
  }

  const documents = new Map<string, ReplayDocument>();
  for (const [key, list] of grouped) {
    const scopes: Record<string, unknown> = {};
    const indexes = new Map<string, number>();
    let header: unknown;
    let deleted = false;
    for (const row of list) {
      deleted ||= row.isDeleted;
      indexes.set(row.scope, row.lastOperationIndex);
      if (row.scope === "header") header = row.content;
      else scopes[row.scope] = row.content;
    }
    if (header === undefined) continue;
    documents.set(key, {
      state: JSON.stringify({ ...scopes, header }),
      indexes,
      deleted,
    });
  }
  return documents;
}

/** Exact states; an operation whose state cannot be rebuilt passes as read. */
async function rebuildOrPass(
  operations: OperationWithContext[],
  sources: ReplayStateSources,
): Promise<OperationWithContext[]> {
  try {
    return await sources.exact(operations);
  } catch {
    const out: OperationWithContext[] = [];
    for (const op of operations) {
      try {
        out.push(...(await sources.exact([op])));
      } catch {
        out.push(op);
      }
    }
    return out;
  }
}

function withState(
  op: OperationWithContext,
  resultingState: string,
): OperationWithContext {
  return {
    operation: op.operation,
    context: { ...op.context, resultingState },
  };
}

function mergeByOrdinal(
  a: OperationWithContext[],
  b: OperationWithContext[],
): OperationWithContext[] {
  return [...a, ...b].sort((x, y) => x.context.ordinal - y.context.ordinal);
}

function streamKey(op: OperationWithContext): string {
  const { documentId, scope, branch } = op.context;
  return `${documentId}\u0000${scope}\u0000${branch}`;
}

function documentKey(op: OperationWithContext): string {
  return `${op.context.documentId}\u0000${op.context.branch}`;
}

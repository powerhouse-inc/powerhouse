import type {
  Operation,
  UndoRedoTargets,
} from "@powerhousedao/shared/document-model";
import {
  advanceUndoTargets,
  undoTargetsBase,
} from "@powerhousedao/shared/document-model";
import { throwIfAborted } from "../shared/utils.js";
import type { IOperationStore } from "../storage/interfaces.js";

/** A scope's rows and the ids whose action applied, from a full derivation. */
export type DerivedScope = {
  rows: readonly Operation[];
  applied: ReadonlySet<string>;
};

export type DeriveScopeForTargets = (
  documentId: string,
  scope: string,
  branch: string,
  signal?: AbortSignal,
) => Promise<DerivedScope>;

type Entry = {
  targets: UndoRedoTargets;
  named: ReadonlySet<string>;
  // Grows in place; a superset only costs a spurious re-derive.
  ids: Set<string>;
  last?: { index: number; id: string };
};

const PAGE = 100;

/** Undo targets per (document, scope, branch), advanced over rows stored since the last read. */
export class UndoTargetsCache {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly store: IOperationStore,
    private readonly derive: DeriveScopeForTargets,
    private readonly capacity = 256,
  ) {}

  async resolve(
    documentId: string,
    scope: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<UndoRedoTargets> {
    const key = `${documentId}\u0000${scope}\u0000${branch}`;
    try {
      const entry = this.entries.get(key);
      const advanced = entry
        ? await this.advance(entry, documentId, scope, branch, signal)
        : undefined;
      const next =
        advanced ?? (await this.rederive(documentId, scope, branch, signal));
      this.entries.delete(key);
      this.entries.set(key, next);
      if (this.entries.size > this.capacity) {
        this.entries.delete(this.entries.keys().next().value!);
      }
      return next.targets;
    } catch (error) {
      this.entries.delete(key);
      throw error;
    }
  }

  /** Undefined when only a full derivation can answer. */
  private async advance(
    entry: Entry,
    documentId: string,
    scope: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<Entry | undefined> {
    // From the last row read, inclusive, to check nothing rewrote it.
    const rows = await this.rowsAfter(
      documentId,
      scope,
      branch,
      (entry.last?.index ?? 0) - 1,
      signal,
    );
    let appended = rows;
    if (entry.last) {
      const first = rows.at(0);
      if (first?.index !== entry.last.index || first.id !== entry.last.id) {
        return undefined;
      }
      appended = rows.slice(1);
    }
    const targets = advanceUndoTargets(entry, appended);
    if (targets === "rederive") return undefined;
    for (const row of appended) entry.ids.add(row.action.id);
    const last = appended.at(-1);
    return {
      ...entry,
      targets,
      last: last ? { index: last.index, id: last.id } : entry.last,
    };
  }

  private async rederive(
    documentId: string,
    scope: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<Entry> {
    const { rows, applied } = await this.derive(
      documentId,
      scope,
      branch,
      signal,
    );
    const base = undoTargetsBase(rows, applied);
    const last = rows.at(-1);
    return {
      targets: base.targets,
      named: base.named,
      ids: new Set(base.ids),
      last: last ? { index: last.index, id: last.id } : undefined,
    };
  }

  private async rowsAfter(
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    signal?: AbortSignal,
  ): Promise<Operation[]> {
    const rows: Operation[] = [];
    let cursor: string | undefined = "0";
    while (cursor !== undefined) {
      throwIfAborted(signal);
      const page = await this.store.getSince(
        documentId,
        scope,
        branch,
        revision,
        undefined,
        { cursor, limit: PAGE },
        signal,
      );
      rows.push(...page.results);
      cursor = page.nextCursor || undefined;
    }
    return rows;
  }
}

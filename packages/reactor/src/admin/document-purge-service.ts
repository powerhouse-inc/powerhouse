import { childLogger, type ILogger } from "document-model";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { InProcessReactorModule, Database } from "../core/types.js";
import { supportsCacheInvalidation } from "../executor/interfaces.js";
import { supportsDocumentPurge } from "../read-models/interfaces.js";
import {
  DocumentNotDeletedError,
  DocumentNotFlushedError,
  GroupInUseError,
} from "../shared/errors.js";
import type {
  PurgeDirective,
  PurgeFanOutOutcome,
} from "../shared/purge-types.js";
import { findPurgedIds } from "../storage/kysely/document-purge-gate.js";
import { KyselyDocumentPurger } from "../storage/kysely/document-purger.js";
import type { IDocumentPurgeSyncManager, Remote } from "../sync/interfaces.js";
import { supportsDocumentPurgeQuarantine } from "../sync/interfaces.js";
import type {
  DocumentPurgeResult,
  OwedRemote,
  PurgeBlocker,
  PurgeCandidate,
  PurgePlan,
} from "./document-purge-types.js";

export type DocumentPurgeServiceModule = Pick<
  InProcessReactorModule,
  | "database"
  | "writeCache"
  | "documentMetaCache"
  | "collectionMembershipCache"
  | "syncModule"
  | "executorManager"
  | "readModelCoordinator"
>;

export type DocumentPurgeServiceOptions = {
  logger?: ILogger;
  /** Rows per delete statement; see KyselyDocumentPurger. */
  deleteBatch?: number;
};

/** Hard-deletes documents that are already deleted and flushed to every peer. */
export class DocumentPurgeService {
  private readonly db: Kysely<Database>;
  private readonly purger: KyselyDocumentPurger;
  private readonly logger: ILogger;

  constructor(
    private readonly module: DocumentPurgeServiceModule,
    options: DocumentPurgeServiceOptions = {},
  ) {
    this.db = module.database;
    this.purger = new KyselyDocumentPurger(
      module.database,
      options.deleteBatch,
    );
    this.logger =
      options.logger ?? childLogger(["reactor", "document-purge-service"]);
  }

  /** Expands ids to the set a purge would remove and reports what blocks each. */
  async planPurge(ids: string[]): Promise<PurgePlan> {
    const requested = new Set(ids);
    const all = await this.expand([...requested]);
    const tombstoned = new Set(await findPurgedIds(this.db, all));
    const pending = all.filter((id) => !tombstoned.has(id));

    const live = new Set(await this.liveIds(pending));
    const groupUsers = await this.groupUsers(pending);
    const candidates: PurgeCandidate[] = [];

    for (const documentId of all) {
      if (tombstoned.has(documentId)) {
        candidates.push({
          documentId,
          requested: requested.has(documentId),
          alreadyPurged: true,
          status: "ready",
          blockers: [],
          owed: [],
          groupUsers: [],
        });
        continue;
      }

      const owed = await this.owedRemotes(documentId);
      const blockers: PurgeBlocker[] = [];
      if (live.has(documentId)) blockers.push("live");
      if (owed.length > 0) blockers.push("owed");
      if (documentId in groupUsers) blockers.push("group-in-use");

      candidates.push({
        documentId,
        requested: requested.has(documentId),
        alreadyPurged: false,
        status: blockers[0] ?? "ready",
        blockers,
        owed,
        groupUsers: groupUsers[documentId] ?? [],
      });
    }

    return {
      candidates,
      ready: candidates.every((candidate) => candidate.status === "ready"),
    };
  }

  /** Purges exactly these ids. Refuses unless each is deleted and flushed. */
  async purgeDocuments(
    ids: string[],
    directive: PurgeDirective,
  ): Promise<DocumentPurgeResult> {
    const unique = [...new Set(ids)];
    const alreadyPurged = await findPurgedIds(this.db, unique);
    const pending = unique.filter((id) => !alreadyPurged.includes(id));

    const result: DocumentPurgeResult = {
      directiveId: directive.directiveId,
      status: "already-purged",
      purged: [],
      alreadyPurged,
      rowsDeleted: {},
      skippedRemotes: [],
      removedRemotes: [],
      readModels: [],
      unacknowledgedShards: [],
      swept: {},
    };
    if (pending.length === 0) {
      return result;
    }

    const live = await this.liveIds(pending);
    if (live.length > 0) {
      throw new DocumentNotDeletedError(live);
    }

    const groupUsers = await this.groupUsers(pending);
    if (Object.keys(groupUsers).length > 0 && !directive.allowGroupInUse) {
      throw new GroupInUseError(groupUsers);
    }

    const sync = this.purgeSyncManager();
    sync?.quarantineInbound(pending);

    let survivors: string[];
    try {
      const skip = new Set(directive.skipRemotes ?? []);
      const owed: OwedRemote[] = [];
      for (const id of pending) {
        for (const entry of await this.owedRemotes(id)) {
          if (skip.has(entry.remoteName)) {
            result.skippedRemotes.push(entry);
          } else {
            owed.push(entry);
          }
        }
      }
      if (owed.length > 0) {
        throw new DocumentNotFlushedError(owed);
      }

      await this.module.readModelCoordinator.drain();

      survivors = await this.survivingMembers(pending);
      result.removedRemotes = await this.removeDriveRemotes(pending);

      const rows = await this.purger.purge(pending, directive);
      result.purged = rows.purged;
      result.alreadyPurged.push(...rows.alreadyPurged);
      result.rowsDeleted = rows.rowsDeleted;
    } catch (error) {
      sync?.releaseInbound(pending);
      throw error;
    }
    result.status = "purged";

    await this.evict(pending, survivors);
    sync?.quarantineOutbound(pending);

    const fanOut = await this.fanOut(pending, directive);
    result.readModels = fanOut.outcomes;
    result.unacknowledgedShards = fanOut.unacknowledgedShards;

    try {
      result.swept = (await this.purger.sweep(pending)).rowsDeleted;
    } catch (error) {
      this.logger.error("Purge sweep failed for @ids: @error", pending, error);
    }

    return result;
  }

  private purgeSyncManager(): IDocumentPurgeSyncManager | undefined {
    const syncManager = this.module.syncModule?.syncManager;
    return syncManager && supportsDocumentPurgeQuarantine(syncManager)
      ? syncManager
      : undefined;
  }

  /** Every document ever in a drive's collection and in no other open one. */
  private async expand(ids: string[]): Promise<string[]> {
    const all = new Set(ids);
    let frontier = ids;

    while (frontier.length > 0) {
      const owned = await this.ownedCollections(frontier);
      if (owned.length === 0) break;

      const members = await this.db
        .selectFrom("document_collections")
        .select("documentId")
        .distinct()
        .where("collectionId", "in", owned)
        .whereRef("documentId", "!=", "collectionId")
        .execute();

      const allOwned = await this.ownedCollections([...all]);
      const next: string[] = [];
      for (const { documentId } of members) {
        if (all.has(documentId)) continue;
        const elsewhere = await this.db
          .selectFrom("document_collections")
          .select("collectionId")
          .where("documentId", "=", documentId)
          .where("leftOrdinal", "is", null)
          .where("collectionId", "not in", allOwned)
          .executeTakeFirst();
        if (elsewhere) continue;
        all.add(documentId);
        next.push(documentId);
      }
      frontier = next;
    }

    return [...all];
  }

  /** The drive collections, on every branch, that the ids own. */
  private async ownedCollections(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .selectFrom("document_collections")
      .select("collectionId")
      .distinct()
      .where("collectionId", "like", "drive.%")
      .where((eb) =>
        eb.or(
          ids.map((id) =>
            eb(
              sql<string>`right("collectionId", ${id.length + 1})`,
              "=",
              `.${id}`,
            ),
          ),
        ),
      )
      .execute();
    return rows.map((row) => row.collectionId);
  }

  /** Ids not deleted on every branch they have operations or snapshots on. */
  private async liveIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];

    const snapshots = await this.db
      .selectFrom("DocumentSnapshot")
      .select(["documentId", "branch", "isDeleted"])
      .where("documentId", "in", ids)
      .execute();
    const operationBranches = await this.db
      .selectFrom("Operation")
      .select(["documentId", "branch"])
      .distinct()
      .where("documentId", "in", ids)
      .execute();

    const live = new Set<string>();
    const deletedBranches = new Map<string, boolean>();
    for (const row of snapshots) {
      const key = `${row.documentId}\u0000${row.branch}`;
      deletedBranches.set(
        key,
        (deletedBranches.get(key) ?? true) && row.isDeleted,
      );
    }
    for (const [key, deleted] of deletedBranches) {
      if (!deleted) live.add(key.split("\u0000")[0]!);
    }
    for (const row of operationBranches) {
      if (!deletedBranches.has(`${row.documentId}\u0000${row.branch}`)) {
        live.add(row.documentId);
      }
    }

    return ids.filter((id) => live.has(id));
  }

  /** Surviving documents that reference each id as a group. */
  private async groupUsers(ids: string[]): Promise<Record<string, string[]>> {
    if (ids.length === 0) return {};
    const rows = await this.db
      .selectFrom("group_references")
      .select(["groupId", "documentId"])
      .where("groupId", "in", ids)
      .where("documentId", "not in", ids)
      .execute();

    const users: Record<string, string[]> = {};
    for (const row of rows) {
      (users[row.groupId] ??= []).push(row.documentId);
    }
    return users;
  }

  /** The remotes that would ever be served the document and lack some of it. */
  private async owedRemotes(documentId: string): Promise<OwedRemote[]> {
    const sync = this.module.syncModule?.syncManager;
    if (!sync) return [];

    const memberships = await this.db
      .selectFrom("document_collections")
      .select(["collectionId", "leftOrdinal"])
      .where("documentId", "=", documentId)
      .execute();
    if (memberships.length === 0) return [];

    const purgeSync = this.purgeSyncManager();
    const remotes = sync
      .list()
      .filter(
        (remote) =>
          memberships.some(
            (m) => m.collectionId === remote.meta.collectionId.key,
          ) && !purgeSync?.isRemoving(remote.meta.name),
      );
    if (remotes.length === 0) return [];

    const operations = await this.db
      .selectFrom("operation_index_operations")
      .select(["ordinal", "scope", "branch", "sourceRemote", "timestampUtcMs"])
      .where("documentId", "=", documentId)
      .execute();

    const owed: OwedRemote[] = [];
    for (const remote of remotes) {
      const membership = memberships.find(
        (m) => m.collectionId === remote.meta.collectionId.key,
      )!;
      const left =
        membership.leftOrdinal === null
          ? undefined
          : Number(membership.leftOrdinal);

      const served = operations.filter(
        (op) =>
          (left === undefined || op.ordinal < left) &&
          op.sourceRemote !== remote.meta.name &&
          isServedTo(remote, documentId, op),
      );
      if (served.length === 0) continue;

      const target = Math.max(left ?? 0, ...served.map((op) => op.ordinal));
      const cursor = await this.outboxCursor(remote.meta.name);

      const reasons: string[] = [];
      if (cursor < target) {
        reasons.push(`acknowledged through ${cursor}, owes through ${target}`);
      }
      if (
        remote.channel.outbox.items.some((op) => op.documentId === documentId)
      ) {
        reasons.push("outbox holds its operations");
      }
      const floor = purgeSync?.getEvictedOutboxFloor(remote.meta.name);
      if (floor !== undefined && floor <= target) {
        reasons.push(`outbox evicted from ${floor}`);
      }
      if (
        remote.channel.deadLetter.items.some(
          (op) => op.documentId === documentId,
        )
      ) {
        reasons.push("dead letters hold its operations");
      }
      if (reasons.length === 0) continue;

      const state = remote.channel.getConnectionState();
      owed.push({
        documentId,
        remoteName: remote.meta.name,
        connectionState: state.state,
        lastSuccessUtcMs: state.lastSuccessUtcMs,
        cursorOrdinal: cursor,
        targetOrdinal: target,
        reasons,
      });
    }

    return owed;
  }

  private async outboxCursor(remoteName: string): Promise<number> {
    const row = await this.db
      .selectFrom("sync_cursors")
      .select("cursor_ordinal")
      .where("remote_name", "=", remoteName)
      .where("cursor_type", "=", "outbox")
      .executeTakeFirst();
    return row === undefined ? 0 : Number(row.cursor_ordinal);
  }

  /** Documents outside the purge that sit in a purged drive's collection. */
  private async survivingMembers(ids: string[]): Promise<string[]> {
    const owned = await this.ownedCollections(ids);
    if (owned.length === 0) return [];
    const rows = await this.db
      .selectFrom("document_collections")
      .select("documentId")
      .distinct()
      .where("collectionId", "in", owned)
      .where("documentId", "not in", ids)
      .whereRef("documentId", "!=", "collectionId")
      .execute();
    return rows.map((row) => row.documentId);
  }

  /** Nothing cascades from sync_remotes to sync_cursors, so remove() does it. */
  private async removeDriveRemotes(ids: string[]): Promise<string[]> {
    const sync = this.module.syncModule?.syncManager;
    if (!sync) return [];
    const owned = new Set(await this.ownedCollections(ids));
    const removed: string[] = [];
    for (const remote of sync.list()) {
      if (!owned.has(remote.meta.collectionId.key)) continue;
      await sync.remove(remote.meta.name);
      removed.push(remote.meta.name);
    }
    return removed;
  }

  private async evict(ids: string[], survivors: string[]): Promise<void> {
    for (const id of ids) {
      this.module.writeCache.invalidate(id);
      this.module.documentMetaCache.invalidate(id);
      this.module.collectionMembershipCache.invalidate(id);
    }
    for (const id of survivors) {
      this.module.collectionMembershipCache.invalidate(id);
    }

    const executorManager = this.module.executorManager;
    if (supportsCacheInvalidation(executorManager)) {
      try {
        await executorManager.invalidateDocuments([...ids, ...survivors]);
      } catch (error) {
        this.logger.error(
          "Executor cache eviction failed for @ids: @error",
          ids,
          error,
        );
      }
    }
  }

  private async fanOut(
    ids: string[],
    directive: PurgeDirective,
  ): Promise<PurgeFanOutOutcome> {
    const coordinator = this.module.readModelCoordinator;
    if (!supportsDocumentPurge(coordinator)) {
      return {
        outcomes: [
          {
            readModelId: "read-model-coordinator",
            rowsAffected: 0,
            covered: false,
          },
        ],
        unacknowledgedShards: [],
      };
    }

    try {
      const outcome = await coordinator.purgeDocuments(ids, directive);
      if ("outcomes" in outcome) return outcome;
      return { outcomes: [outcome], unacknowledgedShards: [] };
    } catch (error) {
      return {
        outcomes: [
          {
            readModelId: "read-model-coordinator",
            rowsAffected: 0,
            covered: true,
            error: error instanceof Error ? error.message : String(error),
          },
        ],
        unacknowledgedShards: [],
      };
    }
  }
}

/** The outbox filters of SyncManager.deriveOutbox, applied to one index row. */
function isServedTo(
  remote: Remote,
  documentId: string,
  op: { scope: string; branch: string; timestampUtcMs: string },
): boolean {
  const { filter, options } = remote.meta;
  if (filter.branch && op.branch !== filter.branch) return false;
  if (filter.documentId.length > 0 && !filter.documentId.includes(documentId)) {
    return false;
  }
  if (filter.scope.length > 0 && !filter.scope.includes(op.scope)) return false;
  const since = options.sinceTimestampUtcMs;
  if (since && since !== "0" && op.timestampUtcMs < since) return false;
  return true;
}

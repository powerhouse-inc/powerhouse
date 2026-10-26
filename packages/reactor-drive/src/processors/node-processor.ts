import type { IOperationIndex, IWriteCache } from "@powerhousedao/reactor";
import {
  BaseReadModel,
  findPurged,
  isPurgeMarker,
  REACTOR_SCHEMA,
  unchunkedReadModelIndexingConfig,
  type DocumentViewDatabase,
  type IConsistencyTracker,
} from "@powerhousedao/reactor";
import {
  getNextCopyNumber,
  type AddFileInput,
  type AddFolderInput,
  type CopyNodeInput,
  type DeleteNodeInput,
  type MoveNodeInput,
  type UpdateFileInput,
  type UpdateNodeInput,
} from "@powerhousedao/shared/document-drive";
import { isDenied } from "@powerhousedao/shared/document-model";
import type {
  AddRelationshipActionInput,
  CreateDocumentActionInput,
  DeleteDocumentActionInput,
  OperationWithContext,
  PurgeDocumentActionInput,
  RemoveRelationshipActionInput,
  SetNameActionInput,
  UpgradeDocumentActionInput,
} from "@powerhousedao/shared/document-model";
import { childLogger, type ILogger } from "document-model";
import type { Kysely, Transaction } from "kysely";
import {
  DRIVE_CHILD_RELATIONSHIP_TYPE,
  REACTOR_DRIVE_DOCUMENT_TYPE,
} from "../constants.js";
import { runReactorDriveMigrations } from "../schema/migrations/migrator.js";
import type { ReactorDriveDatabase } from "../schema/tables.js";
import type {
  AddFolderActionInput,
  DriveChildFileMetadata,
  RemoveFolderActionInput,
  UpdateFolderActionInput,
} from "../types.js";
import { resolveCollision } from "./utils/collisions.js";

export type NodeProcessorDatabase = ReactorDriveDatabase & DocumentViewDatabase;

export const LEGACY_DRIVE_DOCUMENT_TYPE = "powerhouse/document-drive";

const NAME_ACTION_TYPES = new Set([
  "CREATE_DOCUMENT",
  "UPGRADE_DOCUMENT",
  "SET_NAME",
]);

const STRUCTURE_ACTION_TYPES = new Set([
  "ADD_RELATIONSHIP",
  "REMOVE_RELATIONSHIP",
  "ADD_FOLDER",
  "UPDATE_FOLDER",
  "REMOVE_FOLDER",
]);

const LEGACY_NODE_ACTION_TYPES = new Set([
  "ADD_FILE",
  "ADD_FOLDER",
  "UPDATE_FILE",
  "UPDATE_NODE",
  "MOVE_NODE",
  "COPY_NODE",
  "DELETE_NODE",
]);

/** Candidates the indexed sibling check tries before scanning the folder. */
const SIBLING_NAME_CANDIDATES = 50;

const BACKFILL_BATCH_SIZE = 500;

type NodeKind = "file" | "folder";

interface LegacyNodeRow {
  driveId: string;
  id: string;
  kind: NodeKind;
  name: string;
  requestedName: string;
  parentFolder: string | null;
  documentType: string | null;
}

interface LegacySnapshotNode {
  id?: unknown;
  kind?: unknown;
  name?: unknown;
  parentFolder?: unknown;
  documentType?: unknown;
}

/**
 * Projects drive structure operations into the DriveNode tree.
 *
 * Reactor-drive rows get the per-folder collision rule. Legacy
 * `powerhouse/document-drive` rows mirror the legacy node reducer, including
 * its own `(copy) N` collision rule, so the rows equal the drive's state.
 *
 * Indexes a batch unchunked: a single job may carry one action per descendant
 * of a copied subtree, and a partially committed copy is a half-built tree that
 * readers can see. Chunked commits would only be repaired at the next init(),
 * so the whole batch commits or none of it does.
 */
export class NodeProcessor extends BaseReadModel {
  static override readonly commitsInFenceTransaction = true;

  private readonly driveDb: Kysely<NodeProcessorDatabase>;
  private readonly baseDb: Kysely<unknown>;
  private readonly schema: string;
  private readonly reactorSchema: string;
  private readonly logger: ILogger = childLogger([
    "reactor-drive",
    "node-processor",
  ]);

  constructor(
    baseDb: Kysely<unknown>,
    schema: string,
    operationIndex: IOperationIndex,
    writeCache: IWriteCache,
    consistencyTracker: IConsistencyTracker,
    reactorSchema: string = REACTOR_SCHEMA,
  ) {
    const scopedDb = baseDb.withSchema(
      schema,
    ) as unknown as Kysely<NodeProcessorDatabase>;
    super(
      scopedDb as unknown as Kysely<DocumentViewDatabase>,
      operationIndex,
      writeCache,
      consistencyTracker,
      {
        readModelId: "reactor-drive-node-processor",
        rebuildStateOnInit: false,
        indexing: unchunkedReadModelIndexingConfig,
        purgeFence: "locked",
      },
    );
    this.driveDb = scopedDb;
    this.baseDb = baseDb;
    this.schema = schema;
    this.reactorSchema = reactorSchema;
  }

  protected override purgeLookup(db: Kysely<any>): Kysely<any> {
    return db.withSchema(this.reactorSchema);
  }

  override async init(): Promise<void> {
    const result = await runReactorDriveMigrations(this.baseDb, this.schema);
    if (!result.success && result.error) {
      throw new Error(
        `Reactor drive migrations failed: ${result.error.message}`,
      );
    }
    await this.backfillLegacyDrives();
    await super.init();
  }

  protected override async commitOperations(
    items: OperationWithContext[],
    fenceTrx?: Transaction<DocumentViewDatabase>,
  ): Promise<void> {
    if (fenceTrx) {
      await this.applyAll(
        items,
        fenceTrx as unknown as Transaction<NodeProcessorDatabase>,
      );
      return;
    }
    if (!this.writesRows(items)) return;
    await this.driveDb
      .transaction()
      .execute((trx) => this.applyAll(items, trx));
  }

  protected override writesRows(items: OperationWithContext[]): boolean {
    return items.some((item) => {
      const actionType = item.operation.action.type;
      return (
        NAME_ACTION_TYPES.has(actionType) ||
        STRUCTURE_ACTION_TYPES.has(actionType) ||
        LEGACY_NODE_ACTION_TYPES.has(actionType) ||
        actionType === "DELETE_DOCUMENT" ||
        isPurgeMarker(item.operation)
      );
    });
  }

  /**
   * Seeds rows for every live legacy drive that has none, from its global
   * snapshot. One transaction per drive; re-running skips drives with rows.
   *
   * Only a snapshot at or behind the resume cursor is seeded: catch-up
   * replays every operation past the cursor, and replaying operations the
   * snapshot already holds over its rows would rename and duplicate nodes.
   */
  private async backfillLegacyDrives(): Promise<void> {
    const resumeFrom = (await this.loadState()) ?? 0;
    const drives = (await this.purgeLookup(this.baseDb)
      .selectFrom("DocumentSnapshot")
      .select(["documentId", "lastOperationOrdinal"])
      .where("documentType", "=", LEGACY_DRIVE_DOCUMENT_TYPE)
      .where("scope", "=", "global")
      .where("branch", "=", "main")
      .where("isDeleted", "=", false)
      .execute()) as { documentId: string; lastOperationOrdinal: number }[];

    for (const { documentId: driveId, lastOperationOrdinal } of drives) {
      if (lastOperationOrdinal > resumeFrom) {
        const existing = await this.driveDb
          .selectFrom("DriveNode")
          .select("id")
          .where("driveId", "=", driveId)
          .limit(1)
          .executeTakeFirst();
        if (!existing) {
          this.logger.info(
            "legacy drive @driveId snapshot at ordinal @snapshot is past cursor @cursor; replay will build it",
            driveId,
            lastOperationOrdinal,
            resumeFrom,
          );
        }
        continue;
      }
      const count = await this.driveDb
        .transaction()
        .execute((trx) => this.backfillLegacyDrive(trx, driveId));
      if (count > 0) {
        this.logger.info(
          "backfilled legacy drive @driveId with @count nodes",
          driveId,
          count,
        );
      }
    }
  }

  private async backfillLegacyDrive(
    trx: Transaction<NodeProcessorDatabase>,
    driveId: string,
  ): Promise<number> {
    const existing = await trx
      .selectFrom("DriveNode")
      .select("id")
      .where("driveId", "=", driveId)
      .limit(1)
      .executeTakeFirst();
    if (existing) return 0;

    const snapshot = (await this.purgeLookup(trx)
      .selectFrom("DocumentSnapshot")
      .select("content")
      .where("documentId", "=", driveId)
      .where("scope", "=", "global")
      .where("branch", "=", "main")
      .executeTakeFirst()) as { content: unknown } | undefined;
    const rows = legacySnapshotRows(driveId, snapshot?.content);
    for (let i = 0; i < rows.length; i += BACKFILL_BATCH_SIZE) {
      await trx
        .insertInto("DriveNode")
        .values(rows.slice(i, i + BACKFILL_BATCH_SIZE))
        .onConflict((oc) => oc.columns(["driveId", "id"]).doNothing())
        .execute();
    }
    return rows.length;
  }

  private async applyAll(
    items: OperationWithContext[],
    trx: Transaction<NodeProcessorDatabase>,
  ): Promise<void> {
    const purgedTargets = await this.findPurgedTargets(trx, items);
    for (const item of items) {
      const actionType = item.operation.action.type;
      if (
        item.context.documentType === LEGACY_DRIVE_DOCUMENT_TYPE &&
        LEGACY_NODE_ACTION_TYPES.has(actionType)
      ) {
        if (item.operation.error || isDenied(item.operation)) continue;
        await this.applyLegacyNodeOperation(trx, item);
        continue;
      }
      if (isPurgeMarker(item.operation)) {
        const input = item.operation.action.input as PurgeDocumentActionInput;
        await this.eraseDocument(
          trx,
          input.documentId || item.context.documentId,
        );
        continue;
      }
      if (NAME_ACTION_TYPES.has(actionType)) {
        await this.applyNameOperation(trx, item);
        continue;
      }
      if (STRUCTURE_ACTION_TYPES.has(actionType)) {
        if (this.namesPurgedTarget(item, purgedTargets)) continue;
        await this.applyStructureOperation(trx, item);
        continue;
      }
      if (actionType === "DELETE_DOCUMENT") {
        await this.applyDeleteDocument(trx, item);
      }
    }
  }

  /** Tombstoned targets of this batch's drive-child ADD_RELATIONSHIPs. */
  private async findPurgedTargets(
    trx: Transaction<NodeProcessorDatabase>,
    items: OperationWithContext[],
  ): Promise<Set<string>> {
    const targets: string[] = [];
    for (const item of items) {
      const target = this.addedChildOf(item);
      if (target !== undefined) targets.push(target);
    }
    return findPurged(this.purgeLookup(trx), targets);
  }

  private namesPurgedTarget(
    item: OperationWithContext,
    purgedTargets: Set<string>,
  ): boolean {
    const target = this.addedChildOf(item);
    return target !== undefined && purgedTargets.has(target);
  }

  private addedChildOf(item: OperationWithContext): string | undefined {
    const action = item.operation.action;
    if (action.type !== "ADD_RELATIONSHIP") return undefined;
    if (item.context.documentType !== REACTOR_DRIVE_DOCUMENT_TYPE) {
      return undefined;
    }
    const input = action.input as AddRelationshipActionInput;
    if (input.relationshipType !== DRIVE_CHILD_RELATIONSHIP_TYPE) {
      return undefined;
    }
    return input.targetId;
  }

  private async applyNameOperation(
    trx: Transaction<NodeProcessorDatabase>,
    item: OperationWithContext,
  ): Promise<void> {
    const action = item.operation.action;
    const docId = item.context.documentId;
    let name: string | undefined;

    if (action.type === "CREATE_DOCUMENT") {
      const input = action.input as CreateDocumentActionInput;
      name = input.name;
    } else if (action.type === "UPGRADE_DOCUMENT") {
      const input = action.input as UpgradeDocumentActionInput;
      const initial = (input.initialState ?? {}) as {
        header?: { name?: string };
      };
      name = initial.header?.name;
    } else if (action.type === "SET_NAME") {
      const input = action.input as SetNameActionInput;
      name = input.name;
    }

    if (name === undefined) {
      return;
    }

    await this.upsertDocumentName(trx, docId, name);

    const linkedRows = await trx
      .selectFrom("DriveNode")
      .selectAll()
      .where("id", "=", docId)
      .where("kind", "=", "file")
      .execute();

    // A legacy drive's node name does not follow its document's name.
    const legacyDrives = await this.legacyDrivesAmong(
      trx,
      linkedRows.map((row) => row.driveId),
    );
    for (const row of linkedRows) {
      if (legacyDrives.has(row.driveId)) continue;
      const resolved = await this.resolveSiblingName(
        trx,
        row.driveId,
        row.parentFolder,
        name,
        docId,
      );
      await trx
        .updateTable("DriveNode")
        .set({
          name: resolved,
          requestedName: name,
          updatedAt: new Date(),
        })
        .where("driveId", "=", row.driveId)
        .where("id", "=", docId)
        .execute();
    }
  }

  private async applyStructureOperation(
    trx: Transaction<NodeProcessorDatabase>,
    item: OperationWithContext,
  ): Promise<void> {
    if (item.context.documentType !== REACTOR_DRIVE_DOCUMENT_TYPE) {
      return;
    }

    const action = item.operation.action;
    const driveId = item.context.documentId;

    if (action.type === "ADD_RELATIONSHIP") {
      const input = action.input as AddRelationshipActionInput;
      if (input.relationshipType !== DRIVE_CHILD_RELATIONSHIP_TYPE) return;
      await this.handleAddFileRelationship(trx, driveId, input);
      return;
    }

    if (action.type === "REMOVE_RELATIONSHIP") {
      const input = action.input as RemoveRelationshipActionInput;
      if (input.relationshipType !== DRIVE_CHILD_RELATIONSHIP_TYPE) return;
      await trx
        .deleteFrom("DriveNode")
        .where("driveId", "=", driveId)
        .where("id", "=", input.targetId)
        .execute();
      return;
    }

    if (action.type === "ADD_FOLDER") {
      await this.handleAddFolder(
        trx,
        driveId,
        action.input as AddFolderActionInput,
      );
      return;
    }

    if (action.type === "UPDATE_FOLDER") {
      await this.handleUpdateFolder(
        trx,
        driveId,
        action.input as UpdateFolderActionInput,
      );
      return;
    }

    if (action.type === "REMOVE_FOLDER") {
      const input = action.input as RemoveFolderActionInput;
      await trx
        .deleteFrom("DriveNode")
        .where("driveId", "=", driveId)
        .where("id", "=", input.folderId)
        .execute();
    }
  }

  /** Mirrors the legacy node reducer (document-drive src/reducers/node.ts). */
  private async applyLegacyNodeOperation(
    trx: Transaction<NodeProcessorDatabase>,
    item: OperationWithContext,
  ): Promise<void> {
    const action = item.operation.action;
    const driveId = item.context.documentId;
    switch (action.type) {
      case "ADD_FILE": {
        const input = action.input as AddFileInput;
        await this.upsertLegacyNode(trx, driveId, {
          id: input.id,
          kind: "file",
          srcName: input.name,
          collisionFolder: input.parentFolder || null,
          parentFolder: input.parentFolder ?? null,
          documentType: input.documentType,
        });
        return;
      }
      case "ADD_FOLDER": {
        const input = action.input as AddFolderInput;
        await this.upsertLegacyNode(trx, driveId, {
          id: input.id,
          kind: "folder",
          srcName: input.name,
          collisionFolder: input.parentFolder || null,
          parentFolder: input.parentFolder ?? null,
          documentType: null,
        });
        return;
      }
      case "UPDATE_FILE":
      case "UPDATE_NODE": {
        await this.updateLegacyNode(
          trx,
          driveId,
          action.type,
          action.input as UpdateFileInput | UpdateNodeInput,
        );
        return;
      }
      case "MOVE_NODE": {
        await this.moveLegacyNode(trx, driveId, action.input as MoveNodeInput);
        return;
      }
      case "COPY_NODE": {
        const input = action.input as CopyNodeInput;
        const src = await this.findNode(trx, driveId, input.srcId);
        if (!src) return;
        await this.upsertLegacyNode(trx, driveId, {
          id: input.targetId,
          kind: src.kind,
          srcName: input.targetName || src.name,
          collisionFolder: input.targetParentFolder || null,
          parentFolder: input.targetParentFolder || null,
          documentType: src.documentType,
        });
        return;
      }
      case "DELETE_NODE": {
        const input = action.input as DeleteNodeInput;
        const ids = await this.subtreeIds(trx, driveId, input.id);
        if (ids.length === 0) return;
        await trx
          .deleteFrom("DriveNode")
          .where("driveId", "=", driveId)
          .where("id", "in", ids)
          .execute();
        return;
      }
    }
  }

  /**
   * ADD_FILE, ADD_FOLDER and COPY_NODE. The reducer rejects an existing id, so
   * the node itself is left out of the collision check and a replay over the
   * same row is an upsert to the same values.
   */
  private async upsertLegacyNode(
    trx: Transaction<NodeProcessorDatabase>,
    driveId: string,
    node: {
      id: string;
      kind: NodeKind;
      srcName: string;
      collisionFolder: string | null;
      parentFolder: string | null;
      documentType: string | null;
    },
  ): Promise<void> {
    const name = await this.legacySiblingName(
      trx,
      driveId,
      node.collisionFolder,
      node.srcName,
      node.kind,
      node.id,
    );
    const values = {
      kind: node.kind,
      name,
      requestedName: name,
      parentFolder: node.parentFolder,
      documentType: node.kind === "file" ? node.documentType : null,
    };
    await trx
      .insertInto("DriveNode")
      .values({ driveId, id: node.id, ...values })
      .onConflict((oc) =>
        oc
          .columns(["driveId", "id"])
          .doUpdateSet({ ...values, updatedAt: new Date() }),
      )
      .execute();
  }

  /**
   * UPDATE_FILE never moves the node (its parentFolder only picks the folder
   * for the collision check); UPDATE_NODE moves it only to the root, on null.
   */
  private async updateLegacyNode(
    trx: Transaction<NodeProcessorDatabase>,
    driveId: string,
    actionType: "UPDATE_FILE" | "UPDATE_NODE",
    input: UpdateFileInput | UpdateNodeInput,
  ): Promise<void> {
    const row = await this.findNode(trx, driveId, input.id);
    if (!row) return;
    const name = await this.legacySiblingName(
      trx,
      driveId,
      input.parentFolder ?? row.parentFolder,
      input.name ?? row.name,
      actionType === "UPDATE_FILE" ? "file" : row.kind,
      input.id,
    );
    if (actionType === "UPDATE_FILE") {
      const documentType = (input as UpdateFileInput).documentType;
      await trx
        .updateTable("DriveNode")
        .set({
          name,
          requestedName: name,
          documentType:
            row.kind === "file" ? (documentType ?? row.documentType) : null,
          updatedAt: new Date(),
        })
        .where("driveId", "=", driveId)
        .where("id", "=", input.id)
        .execute();
      return;
    }
    await trx
      .updateTable("DriveNode")
      .set({
        name,
        requestedName: name,
        parentFolder: input.parentFolder === null ? null : row.parentFolder,
        updatedAt: new Date(),
      })
      .where("driveId", "=", driveId)
      .where("id", "=", input.id)
      .execute();
  }

  private async moveLegacyNode(
    trx: Transaction<NodeProcessorDatabase>,
    driveId: string,
    input: MoveNodeInput,
  ): Promise<void> {
    if (input.srcFolder === input.targetParentFolder) return;
    const row = await this.findNode(trx, driveId, input.srcFolder);
    if (!row) return;
    const target = input.targetParentFolder || null;
    if (row.kind === "folder" && target !== null) {
      const subtree = await this.subtreeIds(trx, driveId, row.id);
      if (subtree.includes(target)) return;
    }
    // The reducer's collision check sees the moved node itself.
    const name = await this.legacySiblingName(
      trx,
      driveId,
      target,
      row.name,
      row.kind,
      null,
    );
    await trx
      .updateTable("DriveNode")
      .set({
        name,
        requestedName: name,
        parentFolder: target,
        updatedAt: new Date(),
      })
      .where("driveId", "=", driveId)
      .where("id", "=", row.id)
      .execute();
  }

  /**
   * The legacy handleTargetNameCollisions: a same-kind sibling with the name
   * gives `name (copy) N`, N one past the highest existing copy number.
   */
  private async legacySiblingName(
    trx: Transaction<NodeProcessorDatabase>,
    driveId: string,
    targetFolder: string | null,
    srcName: string,
    kind: NodeKind,
    excludeId: string | null,
  ): Promise<string> {
    const folder = targetFolder === "" ? null : targetFolder;
    let siblings = trx
      .selectFrom("DriveNode")
      .select("name")
      .where("driveId", "=", driveId)
      .where("kind", "=", kind);
    siblings =
      folder === null
        ? siblings.where("parentFolder", "is", null)
        : siblings.where("parentFolder", "=", folder);
    if (excludeId !== null) siblings = siblings.where("id", "!=", excludeId);

    const taken = await siblings
      .where("name", "=", srcName)
      .limit(1)
      .executeTakeFirst();
    if (!taken) return srcName;

    const copies = await siblings
      .where("name", "like", `${escapeLike(srcName)} (copy)%`)
      .execute();
    const next = getNextCopyNumber(
      copies.map((row) => row.name),
      srcName,
    );
    return `${srcName} (copy) ${next}`;
  }

  private async findNode(
    trx: Transaction<NodeProcessorDatabase>,
    driveId: string,
    id: string,
  ) {
    return trx
      .selectFrom("DriveNode")
      .select(["id", "kind", "name", "parentFolder", "documentType"])
      .where("driveId", "=", driveId)
      .where("id", "=", id)
      .executeTakeFirst();
  }

  /** The node and its descendants; empty when the node does not exist. */
  private async subtreeIds(
    trx: Transaction<NodeProcessorDatabase>,
    driveId: string,
    root: string,
  ): Promise<string[]> {
    const rows = await trx
      .withRecursive("subtree", (qb) =>
        qb
          .selectFrom("DriveNode")
          .select("id")
          .where("driveId", "=", driveId)
          .where("id", "=", root)
          .union(
            qb
              .selectFrom("DriveNode")
              .innerJoin("subtree", "DriveNode.parentFolder", "subtree.id")
              .where("DriveNode.driveId", "=", driveId)
              .select("DriveNode.id"),
          ),
      )
      .selectFrom("subtree")
      .select("id")
      .execute();
    return rows.map((row) => row.id);
  }

  private async applyDeleteDocument(
    trx: Transaction<NodeProcessorDatabase>,
    item: OperationWithContext,
  ): Promise<void> {
    const input = item.operation.action.input as DeleteDocumentActionInput;
    const docId = input.documentId || item.context.documentId;
    const linked = await trx
      .selectFrom("DriveNode")
      .select("driveId")
      .where("id", "=", docId)
      .execute();
    const legacyDrives = await this.legacyDrivesAmong(
      trx,
      linked.map((row) => row.driveId),
    );
    if (legacyDrives.size === 0) {
      await this.eraseDocument(trx, docId);
      return;
    }
    // The legacy reducer keeps the node of a deleted document.
    await trx
      .deleteFrom("DriveNode")
      .where((eb) =>
        eb.or([
          eb.and([
            eb("id", "=", docId),
            eb("driveId", "not in", [...legacyDrives]),
          ]),
          eb("driveId", "=", docId),
        ]),
      )
      .execute();
    await trx.deleteFrom("DocumentName").where("docId", "=", docId).execute();
  }

  /** The legacy drives among the given ids, from the write identity table. */
  private async legacyDrivesAmong(
    trx: Transaction<NodeProcessorDatabase>,
    driveIds: string[],
  ): Promise<Set<string>> {
    if (driveIds.length === 0) return new Set();
    const rows = (await this.purgeLookup(trx)
      .selectFrom("WriteIdentity")
      .select("documentId")
      .where("documentId", "in", [...new Set(driveIds)])
      .where("documentType", "=", LEGACY_DRIVE_DOCUMENT_TYPE)
      .execute()) as { documentId: string }[];
    return new Set(rows.map((row) => row.documentId));
  }

  /** The id's nodes in every drive, a drive's own tree, and its name. */
  private async eraseDocument(
    trx: Transaction<NodeProcessorDatabase>,
    docId: string,
  ): Promise<void> {
    await trx
      .deleteFrom("DriveNode")
      .where((eb) => eb.or([eb("id", "=", docId), eb("driveId", "=", docId)]))
      .execute();
    await trx.deleteFrom("DocumentName").where("docId", "=", docId).execute();
  }

  private async handleAddFileRelationship(
    trx: Transaction<NodeProcessorDatabase>,
    driveId: string,
    input: AddRelationshipActionInput,
  ): Promise<void> {
    const metadata = this.parseFileMetadata(input);
    const parentFolder = metadata.parentFolderId ?? null;
    const documentType = metadata.documentType;

    const requestedName =
      (await this.lookupDocumentName(trx, input.targetId)) ?? "";

    const resolved = await this.resolveSiblingName(
      trx,
      driveId,
      parentFolder,
      requestedName,
      input.targetId,
    );

    await trx
      .insertInto("DriveNode")
      .values({
        driveId,
        id: input.targetId,
        kind: "file",
        name: resolved,
        requestedName,
        parentFolder,
        documentType,
      })
      .onConflict((oc) =>
        oc.columns(["driveId", "id"]).doUpdateSet({
          parentFolder,
          name: resolved,
          requestedName,
          kind: "file",
          documentType,
          updatedAt: new Date(),
        }),
      )
      .execute();
  }

  private async handleAddFolder(
    trx: Transaction<NodeProcessorDatabase>,
    driveId: string,
    input: AddFolderActionInput,
  ): Promise<void> {
    const parentFolder = input.parentFolderId ?? null;
    const resolved = await this.resolveSiblingName(
      trx,
      driveId,
      parentFolder,
      input.name,
      input.folderId,
    );

    await trx
      .insertInto("DriveNode")
      .values({
        driveId,
        id: input.folderId,
        kind: "folder",
        name: resolved,
        requestedName: input.name,
        parentFolder,
        documentType: null,
      })
      .onConflict((oc) =>
        oc.columns(["driveId", "id"]).doUpdateSet({
          parentFolder,
          name: resolved,
          requestedName: input.name,
          kind: "folder",
          documentType: null,
          updatedAt: new Date(),
        }),
      )
      .execute();
  }

  private async handleUpdateFolder(
    trx: Transaction<NodeProcessorDatabase>,
    driveId: string,
    input: UpdateFolderActionInput,
  ): Promise<void> {
    const row = await trx
      .selectFrom("DriveNode")
      .selectAll()
      .where("driveId", "=", driveId)
      .where("id", "=", input.folderId)
      .executeTakeFirst();
    if (!row) return;

    const nextParentFolder =
      input.parentFolderId === undefined
        ? row.parentFolder
        : (input.parentFolderId ?? null);
    const nextRequestedName =
      typeof input.name === "string" ? input.name : row.requestedName;

    const resolved = await this.resolveSiblingName(
      trx,
      driveId,
      nextParentFolder,
      nextRequestedName,
      input.folderId,
    );

    await trx
      .updateTable("DriveNode")
      .set({
        parentFolder: nextParentFolder,
        name: resolved,
        requestedName: nextRequestedName,
        updatedAt: new Date(),
      })
      .where("driveId", "=", driveId)
      .where("id", "=", input.folderId)
      .execute();
  }

  /**
   * The name resolveCollision would pick, from an indexed check of the first
   * candidates it would try; a folder with all of them taken is scanned.
   */
  private async resolveSiblingName(
    trx: Transaction<NodeProcessorDatabase>,
    driveId: string,
    parentFolder: string | null,
    requested: string,
    excludeId: string,
  ): Promise<string> {
    const candidates = [requested];
    for (let suffix = 2; suffix <= SIBLING_NAME_CANDIDATES; suffix++) {
      candidates.push(`${requested} (${suffix})`);
    }

    let siblings = trx
      .selectFrom("DriveNode")
      .select("name")
      .where("driveId", "=", driveId)
      .where("id", "!=", excludeId);
    siblings =
      parentFolder === null
        ? siblings.where("parentFolder", "is", null)
        : siblings.where("parentFolder", "=", parentFolder);

    const takenRows = await siblings.where("name", "in", candidates).execute();
    const taken = new Set(takenRows.map((r) => r.name));
    const free = candidates.find((candidate) => !taken.has(candidate));
    if (free !== undefined) return free;

    const rows = await siblings.execute();
    return resolveCollision(
      requested,
      rows.map((r) => r.name),
    );
  }

  private async lookupDocumentName(
    trx: Transaction<NodeProcessorDatabase>,
    docId: string,
  ): Promise<string | undefined> {
    const row = await trx
      .selectFrom("DocumentName")
      .select("name")
      .where("docId", "=", docId)
      .executeTakeFirst();
    return row?.name;
  }

  private parseFileMetadata(
    input: AddRelationshipActionInput,
  ): DriveChildFileMetadata {
    const metadata = input.metadata;
    if (
      !metadata ||
      typeof metadata !== "object" ||
      (metadata as { kind?: unknown }).kind !== "file" ||
      typeof (metadata as { documentType?: unknown }).documentType !== "string"
    ) {
      throw new Error(
        `ADD_RELATIONSHIP for target ${input.targetId}: missing or invalid drive/child file metadata (expected { kind: "file", parentFolderId, documentType })`,
      );
    }
    const typed = metadata as DriveChildFileMetadata;
    return {
      kind: "file",
      parentFolderId: typed.parentFolderId ?? null,
      documentType: typed.documentType,
    };
  }

  private async upsertDocumentName(
    trx: Transaction<NodeProcessorDatabase>,
    docId: string,
    name: string,
  ): Promise<void> {
    await trx
      .insertInto("DocumentName")
      .values({ docId, name })
      .onConflict((oc) =>
        oc.column("docId").doUpdateSet({ name, updatedAt: new Date() }),
      )
      .execute();
  }
}

function legacySnapshotRows(
  driveId: string,
  content: unknown,
): LegacyNodeRow[] {
  const nodes = (content as { nodes?: unknown } | null | undefined)?.nodes;
  if (!Array.isArray(nodes)) return [];
  const rows: LegacyNodeRow[] = [];
  for (const node of nodes as LegacySnapshotNode[]) {
    if (typeof node.id !== "string" || typeof node.name !== "string") continue;
    const parentFolder =
      typeof node.parentFolder === "string" ? node.parentFolder : null;
    const base = {
      driveId,
      id: node.id,
      name: node.name,
      requestedName: node.name,
      parentFolder,
    };
    if (node.kind === "folder") {
      rows.push({ ...base, kind: "folder", documentType: null });
    } else if (node.kind === "file" && typeof node.documentType === "string") {
      rows.push({ ...base, kind: "file", documentType: node.documentType });
    }
  }
  return rows;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

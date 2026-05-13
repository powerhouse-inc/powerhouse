import type { IOperationIndex, IWriteCache } from "@powerhousedao/reactor";
import {
  BaseReadModel,
  type DocumentViewDatabase,
  type IConsistencyTracker,
} from "@powerhousedao/reactor";
import type {
  AddRelationshipActionInput,
  CreateDocumentActionInput,
  OperationWithContext,
  RemoveRelationshipActionInput,
  RemoveRelationshipSubtreeActionInput,
  SetNameActionInput,
  UpdateRelationshipActionInput,
  UpgradeDocumentActionInput,
} from "@powerhousedao/shared/document-model";
import type { Kysely, Transaction } from "kysely";
import { DRIVE_CHILD_RELATIONSHIP_TYPE } from "../constants.js";
import type { ReactorDriveDatabase } from "../schema/tables.js";
import { resolveCollision } from "./utils/collisions.js";

export type NodeProcessorDatabase = ReactorDriveDatabase & DocumentViewDatabase;

const NAME_ACTION_TYPES = new Set([
  "CREATE_DOCUMENT",
  "UPGRADE_DOCUMENT",
  "SET_NAME",
]);

const STRUCTURE_ACTION_TYPES = new Set([
  "ADD_RELATIONSHIP",
  "REMOVE_RELATIONSHIP",
  "UPDATE_RELATIONSHIP",
  "REMOVE_RELATIONSHIP_SUBTREE",
]);

export class NodeProcessor extends BaseReadModel {
  private readonly driveDb: Kysely<NodeProcessorDatabase>;

  constructor(
    db: Kysely<NodeProcessorDatabase>,
    operationIndex: IOperationIndex,
    writeCache: IWriteCache,
    consistencyTracker: IConsistencyTracker,
  ) {
    super(
      db as unknown as Kysely<DocumentViewDatabase>,
      operationIndex,
      writeCache,
      consistencyTracker,
      {
        readModelId: "reactor-drive-node-processor",
        rebuildStateOnInit: false,
      },
    );
    this.driveDb = db;
  }

  protected override async commitOperations(
    items: OperationWithContext[],
  ): Promise<void> {
    await this.driveDb.transaction().execute(async (trx) => {
      for (const item of items) {
        const actionType = item.operation.action.type;
        if (NAME_ACTION_TYPES.has(actionType)) {
          await this.applyNameOperation(trx, item);
          continue;
        }
        if (STRUCTURE_ACTION_TYPES.has(actionType)) {
          await this.applyStructureOperation(trx, item);
        }
      }
    });
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

    for (const row of linkedRows) {
      const resolved = await this.resolveFileName(
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
    const action = item.operation.action;
    const driveId = item.context.documentId;

    if (action.type === "ADD_RELATIONSHIP") {
      const input = action.input as AddRelationshipActionInput;
      if (input.relationshipType !== DRIVE_CHILD_RELATIONSHIP_TYPE) return;
      await this.handleAddRelationship(trx, driveId, input);
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

    if (action.type === "UPDATE_RELATIONSHIP") {
      const input = action.input as UpdateRelationshipActionInput;
      if (input.relationshipType !== DRIVE_CHILD_RELATIONSHIP_TYPE) return;
      await this.handleUpdateRelationship(trx, driveId, input);
      return;
    }

    if (action.type === "REMOVE_RELATIONSHIP_SUBTREE") {
      const input = action.input as RemoveRelationshipSubtreeActionInput;
      if (input.relationshipType !== DRIVE_CHILD_RELATIONSHIP_TYPE) return;
      await this.handleRemoveSubtree(trx, driveId, input.rootId);
    }
  }

  private async handleAddRelationship(
    trx: Transaction<NodeProcessorDatabase>,
    driveId: string,
    input: AddRelationshipActionInput,
  ): Promise<void> {
    const parentFolder = input.sourceId === driveId ? null : input.sourceId;
    const metadata = (input.metadata ?? { kind: "file" }) as
      | { kind: "file" }
      | { kind: "folder"; name: string };

    const kind = metadata.kind;
    const requestedName =
      kind === "folder"
        ? metadata.name
        : ((await this.lookupDocumentName(trx, input.targetId)) ?? "");

    const resolved = await this.resolveSiblingName(
      trx,
      driveId,
      parentFolder,
      requestedName,
      input.targetId,
    );

    const documentType =
      kind === "file"
        ? await this.lookupDocumentType(trx, input.targetId)
        : null;

    const existing = await trx
      .selectFrom("DriveNode")
      .select("id")
      .where("driveId", "=", driveId)
      .where("id", "=", input.targetId)
      .executeTakeFirst();

    if (existing) {
      await trx
        .updateTable("DriveNode")
        .set({
          parentFolder,
          name: resolved,
          requestedName,
          kind,
          documentType,
          updatedAt: new Date(),
        })
        .where("driveId", "=", driveId)
        .where("id", "=", input.targetId)
        .execute();
      return;
    }

    await trx
      .insertInto("DriveNode")
      .values({
        driveId,
        id: input.targetId,
        kind,
        name: resolved,
        requestedName,
        parentFolder,
        documentType,
      })
      .execute();
  }

  private async handleUpdateRelationship(
    trx: Transaction<NodeProcessorDatabase>,
    driveId: string,
    input: UpdateRelationshipActionInput,
  ): Promise<void> {
    const metadata = (input.metadata ?? {}) as {
      kind?: "file" | "folder";
      name?: string;
    };
    if (metadata.kind !== "folder" || typeof metadata.name !== "string") {
      return;
    }

    const row = await trx
      .selectFrom("DriveNode")
      .selectAll()
      .where("driveId", "=", driveId)
      .where("id", "=", input.targetId)
      .executeTakeFirst();
    if (!row) return;

    const resolved = await this.resolveSiblingName(
      trx,
      driveId,
      row.parentFolder,
      metadata.name,
      input.targetId,
    );

    await trx
      .updateTable("DriveNode")
      .set({
        name: resolved,
        requestedName: metadata.name,
        updatedAt: new Date(),
      })
      .where("driveId", "=", driveId)
      .where("id", "=", input.targetId)
      .execute();
  }

  private async handleRemoveSubtree(
    trx: Transaction<NodeProcessorDatabase>,
    driveId: string,
    rootId: string,
  ): Promise<void> {
    const toDelete = new Set<string>([rootId]);
    let frontier: string[] = [rootId];
    while (frontier.length > 0) {
      const rows = await trx
        .selectFrom("DriveNode")
        .select("id")
        .where("driveId", "=", driveId)
        .where("parentFolder", "in", frontier)
        .execute();
      const next: string[] = [];
      for (const row of rows) {
        if (!toDelete.has(row.id)) {
          toDelete.add(row.id);
          next.push(row.id);
        }
      }
      frontier = next;
    }
    await trx
      .deleteFrom("DriveNode")
      .where("driveId", "=", driveId)
      .where("id", "in", Array.from(toDelete))
      .execute();
  }

  private async resolveSiblingName(
    trx: Transaction<NodeProcessorDatabase>,
    driveId: string,
    parentFolder: string | null,
    requested: string,
    excludeId: string,
  ): Promise<string> {
    let query = trx
      .selectFrom("DriveNode")
      .select("name")
      .where("driveId", "=", driveId)
      .where("id", "!=", excludeId);
    query =
      parentFolder === null
        ? query.where("parentFolder", "is", null)
        : query.where("parentFolder", "=", parentFolder);

    const rows = await query.execute();
    return resolveCollision(
      requested,
      rows.map((r) => r.name),
    );
  }

  private async resolveFileName(
    trx: Transaction<NodeProcessorDatabase>,
    driveId: string,
    parentFolder: string | null,
    requested: string,
    excludeId: string,
  ): Promise<string> {
    return this.resolveSiblingName(
      trx,
      driveId,
      parentFolder,
      requested,
      excludeId,
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

  private async lookupDocumentType(
    trx: Transaction<NodeProcessorDatabase>,
    docId: string,
  ): Promise<string | null> {
    const row = await trx
      .selectFrom("DocumentSnapshot")
      .select("documentType")
      .where("documentId", "=", docId)
      .executeTakeFirst();
    return row?.documentType ?? null;
  }

  private async upsertDocumentName(
    trx: Transaction<NodeProcessorDatabase>,
    docId: string,
    name: string,
  ): Promise<void> {
    const existing = await trx
      .selectFrom("DocumentName")
      .select("docId")
      .where("docId", "=", docId)
      .executeTakeFirst();
    if (existing) {
      await trx
        .updateTable("DocumentName")
        .set({ name, updatedAt: new Date() })
        .where("docId", "=", docId)
        .execute();
      return;
    }
    await trx.insertInto("DocumentName").values({ docId, name }).execute();
  }
}

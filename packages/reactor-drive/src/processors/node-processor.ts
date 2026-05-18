import type { IOperationIndex, IWriteCache } from "@powerhousedao/reactor";
import {
  BaseReadModel,
  type DocumentViewDatabase,
  type IConsistencyTracker,
} from "@powerhousedao/reactor";
import type {
  AddRelationshipActionInput,
  CreateDocumentActionInput,
  DeleteDocumentActionInput,
  OperationWithContext,
  RemoveRelationshipActionInput,
  SetNameActionInput,
  UpgradeDocumentActionInput,
} from "@powerhousedao/shared/document-model";
import type { Kysely, Transaction } from "kysely";
import { DRIVE_CHILD_RELATIONSHIP_TYPE } from "../constants.js";
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

export class NodeProcessor extends BaseReadModel {
  private readonly driveDb: Kysely<NodeProcessorDatabase>;
  private readonly baseDb: Kysely<unknown>;
  private readonly schema: string;

  constructor(
    baseDb: Kysely<unknown>,
    schema: string,
    operationIndex: IOperationIndex,
    writeCache: IWriteCache,
    consistencyTracker: IConsistencyTracker,
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
      },
    );
    this.driveDb = scopedDb;
    this.baseDb = baseDb;
    this.schema = schema;
  }

  override async init(): Promise<void> {
    const result = await runReactorDriveMigrations(this.baseDb, this.schema);
    if (!result.success && result.error) {
      throw new Error(
        `Reactor drive migrations failed: ${result.error.message}`,
      );
    }
    await super.init();
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
          continue;
        }
        if (actionType === "DELETE_DOCUMENT") {
          await this.applyDeleteDocument(trx, item);
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

  private async applyDeleteDocument(
    trx: Transaction<NodeProcessorDatabase>,
    item: OperationWithContext,
  ): Promise<void> {
    const input = item.operation.action.input as DeleteDocumentActionInput;
    const docId = input.documentId || item.context.documentId;

    await trx.deleteFrom("DriveNode").where("id", "=", docId).execute();
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

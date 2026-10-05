import {
  BaseReadModel,
  defaultReadModelIndexingConfig,
  isPurgeMarker,
  type DocumentViewDatabase,
  type IConsistencyTracker,
  type IOperationIndex,
  type IWriteCache,
  type StorageDatabase,
} from "@powerhousedao/reactor";
import {
  isDocumentCreator,
  type OperationWithContext,
} from "@powerhousedao/shared/document-model";
import { sql, type Kysely, type Transaction } from "kysely";
import type { ReactorPrivacyDatabase, SubjectRole } from "../schema/tables.js";
import {
  assertDeploymentSecret,
  subjectHash,
  type DeploymentSecret,
} from "../subject-hash.js";
import { mentionsOf, type StoredSigner } from "./subjects.js";

export const SUBJECT_DOCUMENTS_READ_MODEL_ID = "subject-documents-read-model";

type PrivacyDb = Kysely<ReactorPrivacyDatabase & StorageDatabase>;

type Row = {
  subjectHash: string;
  documentId: string;
  role: SubjectRole;
  firstOrdinal: number;
  lastOrdinal: number;
};

function hasHeaderKey(jwk: JsonWebKey | undefined): jwk is JsonWebKey {
  return Boolean(jwk && (jwk.kty || jwk.x || jwk.y));
}

/** Keyed hash of each identifier an operation carries, to its document. */
export class SubjectDocumentsReadModel extends BaseReadModel {
  static override readonly commitsInFenceTransaction = true;

  constructor(
    db: Kysely<DocumentViewDatabase>,
    operationIndex: IOperationIndex,
    writeCache: IWriteCache,
    consistencyTracker: IConsistencyTracker,
    private readonly deploymentSecret: DeploymentSecret,
  ) {
    assertDeploymentSecret(deploymentSecret);
    super(db, operationIndex, writeCache, consistencyTracker, {
      readModelId: SUBJECT_DOCUMENTS_READ_MODEL_ID,
      rebuildStateOnInit: false,
      indexing: defaultReadModelIndexingConfig,
      replayStreamSuffix: false,
      purgeFence: "locked",
    });
  }

  protected override async commitOperations(
    items: OperationWithContext[],
    trx?: Transaction<DocumentViewDatabase>,
  ): Promise<void> {
    if (items.length === 0) return;
    const db = (trx ?? this.db) as unknown as PrivacyDb;

    const purged = new Set<string>();
    for (const item of items) {
      if (isPurgeMarker(item.operation)) purged.add(item.context.documentId);
    }

    const rows = new Map<string, Row>();
    const add = (
      item: OperationWithContext,
      identifier: string,
      role: SubjectRole,
    ) => {
      const hash = subjectHash(this.deploymentSecret, identifier);
      const { documentId, ordinal } = item.context;
      const key = `${hash}\u0000${documentId}\u0000${role}`;
      const row = rows.get(key);
      if (row === undefined) {
        rows.set(key, {
          subjectHash: hash,
          documentId,
          role,
          firstOrdinal: ordinal,
          lastOrdinal: ordinal,
        });
        return;
      }
      row.firstOrdinal = Math.min(row.firstOrdinal, ordinal);
      row.lastOrdinal = Math.max(row.lastOrdinal, ordinal);
    };

    for (const item of items) {
      const { documentId } = item.context;
      if (isPurgeMarker(item.operation) || purged.has(documentId)) continue;
      for (const { identifier, role } of mentionsOf(item)) {
        add(item, identifier, role);
      }
      const creator = await this.creatorOf(db, item);
      if (creator !== undefined) add(item, creator, "creator");
    }

    if (purged.size > 0) {
      await db
        .deleteFrom("subject_documents")
        .where("documentId", "in", [...purged])
        .execute();
    }
    if (rows.size === 0) return;

    await db
      .insertInto("subject_documents")
      .values([...rows.values()])
      .onConflict((oc) =>
        oc.columns(["subjectHash", "documentId", "role"]).doUpdateSet({
          firstOrdinal: sql`least(subject_documents."firstOrdinal", excluded."firstOrdinal")`,
          lastOrdinal: sql`greatest(subject_documents."lastOrdinal", excluded."lastOrdinal")`,
        }),
      )
      .execute();
  }

  /** The auth scope's creator, as the INITIALIZE_AUTH reducer derives it. */
  private async creatorOf(
    db: PrivacyDb,
    { operation, context }: OperationWithContext,
  ): Promise<string | undefined> {
    if (operation.action.type !== "INITIALIZE_AUTH") return undefined;
    if (operation.error !== undefined) return undefined;
    const signer = operation.action.context?.signer as StoredSigner | undefined;
    const appKey = signer?.app?.key;
    if (typeof appKey !== "string" || appKey === "") return undefined;

    const create = await db
      .selectFrom("Operation")
      .select("action")
      .where("documentId", "=", context.documentId)
      .where("scope", "=", "document")
      .where("branch", "=", context.branch)
      .where("index", "=", 0)
      .executeTakeFirst();
    const input = (create?.action as { input?: unknown } | undefined)?.input as
      | { signing?: { publicKey?: JsonWebKey } }
      | undefined;
    const headerKey = input?.signing?.publicKey;
    if (!hasHeaderKey(headerKey)) return undefined;
    return isDocumentCreator(headerKey, appKey) ? appKey : undefined;
  }
}

import {
  BaseReadModel,
  defaultReadModelIndexingConfig,
  findPurgedIds,
  type DocumentViewDatabase,
  type IConsistencyTracker,
  type IOperationIndex,
  type IWriteCache,
  type PurgeOutcome,
} from "@powerhousedao/reactor";
import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { runReactorPrivacyMigrations } from "./schema/migrations/migrator.js";
import type { ReactorPrivacyDatabase } from "./schema/tables.js";
import { mentionsIn, subjectHash } from "./subject.js";

export const SUBJECT_DOCUMENTS_READ_MODEL = "reactor-privacy-subject-documents";

type Row = {
  subjectHash: string;
  documentId: string;
  role: string;
  firstOrdinal: number;
  lastOrdinal: number;
};

/** Maps HMAC(identifier) to the documents that carry it, by role. */
export class SubjectDocumentsReadModel extends BaseReadModel {
  private readonly privacyDb: Kysely<ReactorPrivacyDatabase>;

  constructor(
    private readonly baseDb: Kysely<unknown>,
    private readonly schema: string,
    operationIndex: IOperationIndex,
    writeCache: IWriteCache,
    consistencyTracker: IConsistencyTracker,
    private readonly secret: string,
  ) {
    const scoped = baseDb.withSchema(schema);
    super(
      scoped as unknown as Kysely<DocumentViewDatabase>,
      operationIndex,
      writeCache,
      consistencyTracker,
      {
        readModelId: SUBJECT_DOCUMENTS_READ_MODEL,
        rebuildStateOnInit: false,
        indexing: defaultReadModelIndexingConfig,
      },
    );
    this.privacyDb = scoped as unknown as Kysely<ReactorPrivacyDatabase>;
  }

  /** A first init replays every operation from ordinal 0: the backfill. */
  override async init(): Promise<void> {
    const result = await runReactorPrivacyMigrations(this.baseDb, this.schema);
    if (!result.success && result.error) {
      throw new Error(
        `Reactor privacy migrations failed: ${result.error.message}`,
      );
    }
    await super.init();
  }

  override async purgeDocuments(ids: string[]): Promise<PurgeOutcome> {
    if (ids.length === 0) {
      return { readModelId: this.name, rowsAffected: 0, covered: true };
    }
    const result = await this.privacyDb
      .deleteFrom("subject_documents")
      .where("documentId", "in", ids)
      .executeTakeFirst();
    return {
      readModelId: this.name,
      rowsAffected: Number(result.numDeletedRows),
      covered: true,
    };
  }

  protected override async commitOperations(
    items: OperationWithContext[],
  ): Promise<void> {
    const rows = new Map<string, Row>();
    for (const item of items) {
      const { documentId, ordinal } = item.context;
      for (const mention of mentionsIn(item)) {
        const hash = subjectHash(this.secret, mention.identifier);
        const key = `${hash}\u0000${documentId}\u0000${mention.role}`;
        const row = rows.get(key);
        if (row) {
          row.firstOrdinal = Math.min(row.firstOrdinal, ordinal);
          row.lastOrdinal = Math.max(row.lastOrdinal, ordinal);
        } else {
          rows.set(key, {
            subjectHash: hash,
            documentId,
            role: mention.role,
            firstOrdinal: ordinal,
            lastOrdinal: ordinal,
          });
        }
      }
    }
    if (rows.size === 0) return;

    // A payload that committed before a purge can still arrive after it.
    const purged = new Set(
      await findPurgedIds(
        this.db,
        [...rows.values()].map((row) => row.documentId),
      ),
    );
    const kept = [...rows.values()].filter(
      (row) => !purged.has(row.documentId),
    );
    if (kept.length === 0) return;

    await this.privacyDb
      .insertInto("subject_documents")
      .values(kept)
      .onConflict((oc) =>
        oc.columns(["subjectHash", "documentId", "role"]).doUpdateSet({
          firstOrdinal: sql`least("subject_documents"."firstOrdinal", excluded."firstOrdinal")`,
          lastOrdinal: sql`greatest("subject_documents"."lastOrdinal", excluded."lastOrdinal")`,
        }),
      )
      .execute();
  }
}

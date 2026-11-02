import type { PHDocument } from "@powerhousedao/shared/document-model";
import type { Kysely, QueryCreator, Transaction } from "kysely";
import type { IKeyframeStore } from "../interfaces.js";
import { acquirePurgeLocks, findPurged } from "./document-purges.js";
import type { Database } from "./types.js";

/** The `revision` column is a 32-bit integer; a bound above it means no bound. */
const MAX_REVISION_COLUMN_VALUE = 2_147_483_647;

export class KyselyKeyframeStore implements IKeyframeStore {
  private trx?: Transaction<Database>;

  constructor(private db: Kysely<Database>) {}

  private get queryExecutor(): Kysely<Database> | Transaction<Database> {
    return this.trx ?? this.db;
  }

  withTransaction(trx: Transaction<Database>): KyselyKeyframeStore {
    const instance = new KyselyKeyframeStore(this.db);
    instance.trx = trx;
    return instance;
  }

  async putKeyframe(
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    document: PHDocument,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.write(
      documentId,
      scope,
      branch,
      revision,
      document,
      undefined,
      signal,
    );
  }

  async putKeyframeAndPrune(
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    document: PHDocument,
    keep: number,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.write(
      documentId,
      scope,
      branch,
      revision,
      document,
      keep,
      signal,
    );
  }

  async findNearestKeyframe(
    documentId: string,
    scope: string,
    branch: string,
    targetRevision: number,
    signal?: AbortSignal,
  ): Promise<{ revision: number; document: PHDocument } | undefined> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const row = await this.queryExecutor
      .selectFrom("Keyframe")
      .selectAll()
      .where("documentId", "=", documentId)
      .where("scope", "=", scope)
      .where("branch", "=", branch)
      .$if(targetRevision < MAX_REVISION_COLUMN_VALUE, (qb) =>
        qb.where("revision", "<=", targetRevision),
      )
      .orderBy("revision", "desc")
      .limit(1)
      .executeTakeFirst();

    if (!row) {
      return undefined;
    }

    return {
      revision: row.revision,
      document: row.document as PHDocument,
    };
  }

  async listKeyframes(
    documentId: string,
    scope?: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<
    Array<{
      scope: string;
      branch: string;
      revision: number;
      document: PHDocument;
    }>
  > {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    let query = this.queryExecutor
      .selectFrom("Keyframe")
      .selectAll()
      .where("documentId", "=", documentId)
      .orderBy("revision", "asc");

    if (scope !== undefined) {
      query = query.where("scope", "=", scope);
    }
    if (branch !== undefined) {
      query = query.where("branch", "=", branch);
    }

    const rows = await query.execute();

    return rows.map((row) => ({
      scope: row.scope,
      branch: row.branch,
      revision: row.revision,
      document: row.document as PHDocument,
    }));
  }

  async deleteKeyframes(
    documentId: string,
    scope?: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<number> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    let query = this.queryExecutor
      .deleteFrom("Keyframe")
      .where("documentId", "=", documentId);

    if (scope !== undefined && branch !== undefined) {
      query = query.where("scope", "=", scope).where("branch", "=", branch);
    } else if (scope !== undefined) {
      query = query.where("scope", "=", scope);
    }

    const result = await query.executeTakeFirst();

    return Number(result.numDeletedRows || 0n);
  }

  private async write(
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    document: PHDocument,
    keep: number | undefined,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const write = async (trx: Transaction<Database>): Promise<void> => {
      // Behind the purge lock, so a purge cannot miss a keyframe written here.
      await acquirePurgeLocks(trx, [documentId], "shared");
      const purged = await findPurged(trx, [documentId]);
      if (purged.has(documentId)) {
        return;
      }
      const upsert = (db: QueryCreator<Database>) =>
        db
          .insertInto("Keyframe")
          .values({
            documentId,
            documentType: document.header.documentType,
            scope,
            branch,
            revision,
            document,
          })
          .onConflict((oc) =>
            oc
              .columns(["documentId", "scope", "branch", "revision"])
              .doUpdateSet({ document }),
          );

      if (keep === undefined) {
        await upsert(trx).execute();
        return;
      }
      await upsert(
        this.pruningBeyond(keep, trx, documentId, scope, branch, revision),
      ).execute();
    };

    if (this.trx) {
      await write(this.trx);
      return;
    }
    await this.db.transaction().execute(write);
  }

  /**
   * A handle whose statement also deletes the stream's rows beyond `keep`. A
   * data-modifying WITH sees the table as it was before the statement, so the
   * row being written is not among them and `keep - 1` others stay beside it.
   */
  private pruningBeyond(
    keep: number,
    trx: Transaction<Database>,
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
  ): QueryCreator<Database> {
    const statement = trx.with("pruned", (db) =>
      db
        .deleteFrom("Keyframe")
        .where("revision", "<", revision)
        .where("id", "in", (eb) =>
          eb
            .selectFrom("Keyframe")
            .select("id")
            .where("documentId", "=", documentId)
            .where("scope", "=", scope)
            .where("branch", "=", branch)
            .where("revision", "<>", revision)
            .orderBy("revision", "desc")
            .offset(keep - 1),
        ),
    );
    return statement as unknown as QueryCreator<Database>;
  }
}

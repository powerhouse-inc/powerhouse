import type { PHDocument } from "@powerhousedao/shared/document-model";
import type { Kysely, Transaction } from "kysely";
import type { IKeyframeStore } from "../interfaces.js";
import type { Database } from "./types.js";

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
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    await this.queryExecutor
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
      )
      .execute();
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
      .where("revision", "<=", targetRevision)
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
}

import type { PHDocument } from "document-model";
import type { Kysely } from "kysely";
import type { IKeyframeStore } from "../interfaces.js";
import type { Database } from "./types.js";

export class KyselyKeyframeStore implements IKeyframeStore {
  constructor(private db: Kysely<Database>) {}

  async putKeyframe(
    documentId: string,
    documentType: string,
    scope: string,
    branch: string,
    revision: number,
    document: PHDocument,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    await this.db
      .insertInto("Keyframe")
      .values({
        documentId,
        documentType,
        scope,
        branch,
        revision,
        document: JSON.stringify(document),
      })
      .onConflict((oc) =>
        oc
          .columns(["documentId", "scope", "branch", "revision"])
          .doUpdateSet({ document: JSON.stringify(document) }),
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

    const row = await this.db
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

    try {
      const document = JSON.parse(row.document) as PHDocument;
      return {
        revision: row.revision,
        document,
      };
    } catch (err) {
      console.warn(
        `Failed to parse keyframe for ${documentId}@${row.revision}:`,
        err,
      );
      return undefined;
    }
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

    let query = this.db
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

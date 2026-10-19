import type { AttachmentRef } from "@powerhousedao/reactor";
import type { Kysely } from "kysely";
import { parseRef } from "../../ref.js";
import type { AttachmentReferenceDatabase } from "./storage/types.js";
import type {
  AttachmentReferenceInput,
  AttachmentReferencePageResult,
  IAttachmentReferenceReader,
  IAttachmentReferenceScanner,
  IAttachmentReferenceWriter,
} from "./types.js";

/** Keyset cursor: the `(document_id, attachment_ref)` pair the last page ended on. */
type ScanCursor = {
  documentId: string;
  ref: string;
};

function encodeCursor(cursor: ScanCursor): string {
  return JSON.stringify([cursor.documentId, cursor.ref]);
}

function decodeCursor(cursor: string): ScanCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(cursor);
  } catch {
    // Malformed JSON is a bad cursor, not an uncaught SyntaxError leaking out
    // of a scan: report it as the named error the caller expects.
    throw new Error(
      `Invalid attachment reference scan cursor: ${JSON.stringify(cursor)}`,
    );
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 2 ||
    typeof parsed[0] !== "string" ||
    parsed[0] === "" ||
    typeof parsed[1] !== "string" ||
    parsed[1] === ""
  ) {
    throw new Error(
      `Invalid attachment reference scan cursor: ${JSON.stringify(cursor)}`,
    );
  }
  return { documentId: parsed[0], ref: parsed[1] };
}

export class KyselyAttachmentReferenceStore
  implements
    IAttachmentReferenceReader,
    IAttachmentReferenceScanner,
    IAttachmentReferenceWriter
{
  constructor(private readonly db: Kysely<AttachmentReferenceDatabase>) {}

  async hasReference(documentId: string, ref: AttachmentRef): Promise<boolean> {
    const row = await this.db
      .selectFrom("attachment_reference")
      .select("document_id")
      .where("document_id", "=", documentId)
      .where("attachment_ref", "=", ref)
      .executeTakeFirst();

    return row !== undefined;
  }

  async referencingScopes(
    documentId: string,
    ref: AttachmentRef,
  ): Promise<string[]> {
    const rows = await this.db
      .selectFrom("attachment_reference")
      .select("scope")
      .distinct()
      .where("document_id", "=", documentId)
      .where("attachment_ref", "=", ref)
      .execute();

    return rows.map((row) => row.scope);
  }

  /**
   * Keyset paging over the unique `(document_id, attachment_ref)` constraint,
   * rather than OFFSET: a scan that runs while the read model is still
   * indexing must not skip or repeat a row because rows appeared behind the
   * cursor. That is exactly the boot case the replicator's re-scan runs in.
   */
  async listReferences(
    cursor: string | undefined,
    limit: number,
  ): Promise<AttachmentReferencePageResult> {
    let query = this.db
      .selectFrom("attachment_reference")
      .select(["document_id", "attachment_ref"])
      .orderBy("document_id", "asc")
      .orderBy("attachment_ref", "asc")
      .limit(limit);

    if (cursor !== undefined) {
      const after = decodeCursor(cursor);
      query = query.where((eb) =>
        eb.or([
          eb("document_id", ">", after.documentId),
          eb.and([
            eb("document_id", "=", after.documentId),
            eb("attachment_ref", ">", after.ref),
          ]),
        ]),
      );
    }

    const rows = await query.execute();
    const last = rows.at(-1);
    return {
      references: rows.map((row) => ({
        documentId: row.document_id,
        ref: row.attachment_ref as AttachmentRef,
      })),
      nextCursor:
        rows.length === limit && last
          ? encodeCursor({
              documentId: last.document_id,
              ref: last.attachment_ref,
            })
          : undefined,
    };
  }

  async addReferences(
    references: readonly AttachmentReferenceInput[],
  ): Promise<void> {
    if (references.length === 0) {
      return;
    }

    await this.db
      .insertInto("attachment_reference")
      .values(
        references.map((reference) => ({
          document_id: reference.documentId,
          attachment_ref: reference.ref,
          attachment_hash: parseRef(reference.ref).hash,
          first_operation_id: reference.operationId,
          branch: reference.branch,
          scope: reference.scope,
          first_seen_ordinal: reference.ordinal,
          created_at_utc: new Date().toISOString(),
        })),
      )
      .onConflict((oc) =>
        oc.columns(["document_id", "attachment_ref"]).doNothing(),
      )
      .execute();
  }

  async removeDocuments(documentIds: readonly string[]): Promise<void> {
    if (documentIds.length === 0) {
      return;
    }

    await this.db
      .deleteFrom("attachment_reference")
      .where("document_id", "in", [...documentIds])
      .execute();
  }
}

import type { AttachmentRef } from "@powerhousedao/reactor";
import type { Kysely } from "kysely";
import { parseRef } from "../../ref.js";
import type { AttachmentReferenceDatabase } from "./storage/types.js";
import type {
  AttachmentReferenceInput,
  IAttachmentReferenceReader,
  IAttachmentReferenceWriter,
} from "./types.js";

export class KyselyAttachmentReferenceStore
  implements IAttachmentReferenceReader, IAttachmentReferenceWriter
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
}

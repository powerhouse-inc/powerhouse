import type { Kysely } from "kysely";
import { KyselyAttachmentReferenceStore } from "./kysely-attachment-reference-store.js";
import type { AttachmentReferenceDatabase } from "./storage/types.js";
import {
  ATTACHMENT_REFERENCE_SCHEMA,
  runAttachmentReferenceMigrations,
} from "./storage/migrations/migrator.js";
import type {
  IAttachmentReferenceReader,
  IAttachmentReferenceWriter,
} from "./types.js";

export type AttachmentReferenceIndexBuildResult = {
  store: IAttachmentReferenceReader & IAttachmentReferenceWriter;
};

export class AttachmentReferenceIndexBuilder {
  constructor(private readonly db: Kysely<unknown>) {}

  async build(): Promise<AttachmentReferenceIndexBuildResult> {
    const result = await runAttachmentReferenceMigrations(this.db);
    if (!result.success && result.error) {
      throw result.error;
    }

    const scopedDb = this.db.withSchema(
      ATTACHMENT_REFERENCE_SCHEMA,
    ) as Kysely<AttachmentReferenceDatabase>;
    const store = new KyselyAttachmentReferenceStore(scopedDb);
    return { store };
  }
}

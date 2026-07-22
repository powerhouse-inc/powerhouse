import { PGlite } from "@electric-sql/pglite";
import type { AttachmentRef } from "@powerhousedao/reactor";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, describe, expect, it } from "vitest";
import { AttachmentReferenceIndexBuilder } from "../../../src/read-models/attachment-reference/index-builder.js";
import { KyselyAttachmentReferenceStore } from "../../../src/read-models/attachment-reference/kysely-attachment-reference-store.js";
import type {
  IAttachmentReferenceReader,
  IAttachmentReferenceWriter,
} from "../../../src/read-models/attachment-reference/types.js";

describe("AttachmentReferenceIndexBuilder", () => {
  let db: Kysely<unknown> | undefined;

  afterEach(async () => {
    await db?.destroy();
  });

  it("returns one concrete store satisfying both narrow roles", async () => {
    db = new Kysely<unknown>({ dialect: new PGliteDialect(new PGlite()) });
    const result = await new AttachmentReferenceIndexBuilder(db).build();
    const reader: IAttachmentReferenceReader = result.store;
    const writer: IAttachmentReferenceWriter = result.store;
    const ref = "attachment://v1:builder-hash" as AttachmentRef;

    expect(result.store).toBeInstanceOf(KyselyAttachmentReferenceStore);
    expect(reader).toBe(writer);
    await writer.addReferences([
      {
        documentId: "builder-document",
        ref,
        operationId: "builder-operation",
        branch: "main",
        scope: "global",
        ordinal: 1,
      },
    ]);
    await expect(reader.hasReference("builder-document", ref)).resolves.toBe(
      true,
    );
  });
});

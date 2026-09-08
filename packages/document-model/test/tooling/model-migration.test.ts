import type {
  DocumentModelModule,
  JsonValue,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import {
  verifyDocumentModelMigration,
  type DocumentModelMigrationAdapter,
  type MigrationFamily,
  type MigrationHistoryV1,
} from "../../src/tooling/model-migration.js";

function family(version = 1): MigrationFamily {
  return {
    documentType: "test/model",
    modules: [
      {
        version,
        documentModel: { global: { id: "test/model" } },
        actions: {},
        utils: { createState: () => ({ global: {}, local: {} }) },
      } as unknown as DocumentModelModule,
    ],
  };
}

function adapter(
  normalized: MigrationFamily,
  definition = vi.fn(() => ({ model: "test/model" }) as JsonValue),
): DocumentModelMigrationAdapter & { definition: typeof definition } {
  return {
    kind: "code-first",
    normalize: () => normalized,
    definition,
  };
}

function history(id: string, documentType = "test/model"): MigrationHistoryV1 {
  return {
    historyId: id,
    version: 1,
    initialDocument: {
      header: { documentType },
    } as unknown as PHDocument,
    actions: [],
  };
}

describe("verifyDocumentModelMigration", () => {
  it("uses each adapter definition exactly once", async () => {
    const legacy = adapter(family());
    const candidate = adapter(family());

    await expect(
      verifyDocumentModelMigration({ legacy, candidate, histories: [] }),
    ).resolves.toMatchObject({ status: "equivalent" });
    expect(legacy.definition).toHaveBeenCalledOnce();
    expect(candidate.definition).toHaveBeenCalledOnce();
  });

  it("rejects invalid family versions and history identity", () => {
    expect(() =>
      verifyDocumentModelMigration({
        legacy: adapter(family(0)),
        candidate: adapter(family(0)),
        histories: [],
      }),
    ).toThrow("PH-MIGRATE-FAMILY-VERSION-INVALID");

    expect(() =>
      verifyDocumentModelMigration({
        legacy: adapter(family()),
        candidate: adapter(family()),
        histories: [history("duplicate"), history("duplicate")],
      }),
    ).toThrow("PH-MIGRATE-HISTORY-ID-DUPLICATE");

    expect(() =>
      verifyDocumentModelMigration({
        legacy: adapter(family()),
        candidate: adapter(family()),
        histories: [history("wrong-document", "test/other")],
      }),
    ).toThrow("PH-MIGRATE-HISTORY-DOCUMENT-TYPE-MISMATCH");
  });
});

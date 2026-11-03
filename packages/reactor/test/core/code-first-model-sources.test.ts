import type { Action } from "@powerhousedao/shared/document-model";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DocumentModelSource } from "../../src/core/model-sources.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import { TestP256Signer } from "../utils/p256-signer.js";
import { ledgerV2 } from "./fixtures/code-first-ledger.js";

const LEDGER_PATH = fileURLToPath(
  new URL("./fixtures/code-first-ledger.ts", import.meta.url),
);

describe("a code-first model family registered from a file", () => {
  it("records an importable reference for every version and executes its action types", async () => {
    const builder = new ReactorBuilder().withDocumentModelSources([
      { filePath: LEDGER_PATH },
      {
        packageName: "document-model",
        exportName: "documentModelDocumentModelModule",
      },
    ] satisfies DocumentModelSource[]);
    const { client, reactor } = await new ReactorClientBuilder()
      .withReactorBuilder(builder)
      .withSigner((await TestP256Signer.create()).asISigner())
      .buildModule();
    try {
      expect(
        builder
          .getResolvedModelManifest()
          ?.map((entry) => [
            entry.documentType,
            entry.version,
            entry.spec.module,
          ]),
      ).toEqual([
        ["test/ledger", "1", { filePath: LEDGER_PATH, exportName: "ledgerV1" }],
        ["test/ledger", "2", { filePath: LEDGER_PATH, exportName: "ledgerV2" }],
        [
          "powerhouse/document-model",
          "1",
          {
            packageName: "document-model",
            exportName: "documentModelDocumentModelModule",
          },
        ],
      ]);

      const setCurrency = (
        ledgerV2.actions as unknown as Record<
          string,
          (input: unknown) => Action
        >
      ).setCurrency({ currency: "EUR" });
      expect(setCurrency.type).toBe("SET_CURRENCY");
      const created = await client.write.createEmpty("test/ledger");
      const { documentId } = await created.readable;
      const handle = await client.write.execute(documentId, "main", [
        setCurrency,
      ]);
      expect((await handle.document()).state).toMatchObject({
        global: { total: 0, currency: "EUR" },
      });
    } finally {
      reactor.kill();
    }
  });
});

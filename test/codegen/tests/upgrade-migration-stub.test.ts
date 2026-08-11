import {
  generateDocumentModel,
  loadDocumentModel,
} from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  applyUpgradeDocumentAction,
  computeUpgradeTransitions,
  type UpgradeManifest,
} from "document-model";
import { DATA, NEW_PROJECT, TEST_OUTPUT } from "../constants.js";
import { cpForce, rmForce } from "../utils.js";

/**
 * Repro for the Vetra studio upgrade bug:
 *
 * 1. `ph vetra --watch` in a fresh project; create a document model (v1).
 * 2. Create a document with v1 in the preview drive.
 * 3. Add a required field to the state schema and accept the release prompt;
 *    codegen writes the v2 folder plus upgrades/v2.ts and the manifest.
 * 4. Open the document and click "Update document".
 *
 * The generated upgrades/v2.ts migration is a no-op stub (`{ ...document }`).
 * Its type annotation (PHDocument<StateV1> -> PHDocument<StateV2>) fails tsc
 * until the migration is hand-written, but studio serves it through
 * vite/esbuild with types stripped, so the upgrade executes it as-is: the
 * document is stamped version 2 while its state keeps the v1 shape. The
 * version-aware validator in the generated `useSelected<Name>Document` hook
 * then throws during the editor render:
 *
 *   ZodError: [{ path: ["state", "global", "requiredInV2"],
 *                message: "Invalid input: expected string, received undefined" }]
 *
 * and the editor is replaced by the error boundary. This test runs the same
 * upgrade path the reactor executor runs (manifest transitions +
 * applyUpgradeDocumentAction) against the freshly generated code and asserts
 * the result is a valid v2 document.
 */
describe("generated upgrade migrations", () => {
  test("upgrading a v1 document along the generated manifest produces a valid v2 document", async () => {
    const outDir = join(TEST_OUTPUT, "upgrade-migration-stub");
    await rmForce(outDir);
    await cpForce(NEW_PROJECT, outDir);

    const testDoc = await loadDocumentModel(
      join(
        DATA,
        "spec-version-2-with-required-field",
        "test-doc",
        "test-doc.json",
      ),
    );
    const project = buildTsMorphProject(outDir);
    await generateDocumentModel(testDoc, project);
    await project.save();

    type GeneratedDocument = {
      header: { id: string; documentType: string };
      state: {
        document: { version: number };
        global: Record<string, unknown>;
      };
      initialState: { document: { version: number } };
    };
    type SchemaModule = {
      isTestDocDocument: (document: unknown) => boolean;
    };
    type UtilsModule = {
      utils: { createDocument: () => GeneratedDocument };
    };
    type ManifestModule = {
      testDocUpgradeManifest: UpgradeManifest<readonly number[]>;
    };

    const modelDir = join(outDir, "document-models", "test-doc");
    const schemaModule = (await import(
      join(modelDir, "v2", "gen", "document-schema.ts")
    )) as SchemaModule;
    const v1Utils = (await import(
      join(modelDir, "v1", "gen", "utils.ts")
    )) as UtilsModule;
    const manifestModule = (await import(
      join(modelDir, "upgrades", "upgrade-manifest.ts")
    )) as ManifestModule;
    const manifest = manifestModule.testDocUpgradeManifest;

    // The document a user creates in the preview drive before v2 exists.
    const document = v1Utils.utils.createDocument();
    expect(schemaModule.isTestDocDocument(document)).toBe(true);

    // What the executor does when the user clicks "Update document":
    // resolve the manifest transitions and apply the upgrade action.
    const transitions = computeUpgradeTransitions(manifest, 1, 2);
    const upgraded = applyUpgradeDocumentAction(
      document as never,
      {
        id: "",
        type: "UPGRADE_DOCUMENT",
        scope: "document",
        timestampUtcMs: new Date().toISOString(),
        input: {
          documentId: document.header.id,
          model: document.header.documentType,
          fromVersion: 1,
          toVersion: 2,
        },
      } as never,
      transitions,
    ) as unknown as GeneratedDocument;

    // The upgrade stamps the new version...
    expect(upgraded.state.document.version).toBe(2);

    // ...and must migrate the state so the document validates against the
    // generated v2 schema — the exact check useSelected<Name>Document runs
    // on every editor render. Today the generated migration is a no-op stub,
    // requiredInV2 is missing, and this assertion fails the same way the
    // editor crashes in Connect.
    expect(schemaModule.isTestDocDocument(upgraded)).toBe(true);
  });
});

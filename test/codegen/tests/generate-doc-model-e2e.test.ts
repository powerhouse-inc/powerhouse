import { ReactorBuilder } from "@powerhousedao/reactor";
import type { ReactorModule } from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelModule,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { $ } from "bun";
import { afterEach, describe, expect, it } from "bun:test";
import { join } from "path";
import {
  DATA,
  DOCUMENT_MODELS,
  NEW_PROJECT,
  TEST_OUTPUT,
  TEST_PROJECTS,
} from "../constants.js";
import {
  cpForce,
  loadDocumentModelsInDir,
  mkdirRecursive,
  rmForce,
} from "../utils.js";

const parentOutDir = join(process.cwd(), TEST_OUTPUT, "generate-doc-model-e2e");
const testProjectDir = join(process.cwd(), TEST_PROJECTS);
const dataDir = join(process.cwd(), DATA);
await rmForce(parentOutDir);
await mkdirRecursive(parentOutDir);

/** Dynamically look up a scope on a PHDocument's state (e.g. "global"). */
function scopeState(doc: PHDocument, scope: string): Record<string, unknown> {
  return (doc.state as unknown as Record<string, Record<string, unknown>>)[
    scope
  ];
}

async function generateDocModelProject(outDirName: string) {
  const outDir = join(parentOutDir, outDirName);
  await cpForce(join(testProjectDir, NEW_PROJECT), outDir);
  const documentModelsInDir = join(dataDir, DOCUMENT_MODELS);
  await loadDocumentModelsInDir(documentModelsInDir, outDir, false);
  await $`bun run --cwd ${outDir} tsc --noEmit`;
  return outDir;
}

/**
 * Polls an assertion function until it passes or the timeout is reached.
 */
async function waitFor(fn: () => void, timeout = 5000) {
  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeout) {
    try {
      fn();
      return;
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  throw lastError;
}

describe("document model e2e integration", () => {
  let reactorModule: ReactorModule | undefined;

  afterEach(async () => {
    if (reactorModule) {
      reactorModule.reactor.kill();
      await reactorModule.database.destroy();
      reactorModule = undefined;
    }
  });

  it("should generate a document model, import it, and use the reducer to mutate state", async () => {
    const outDir = await generateDocModelProject("reducer-e2e");

    // Dynamically import the generated module
    const modulePath = join(
      outDir,
      "document-models",
      "billing-statement",
      "module.ts",
    );
    const docModelModule = (await import(modulePath)) as {
      BillingStatement: DocumentModelModule;
    };
    const { BillingStatement } = docModelModule;

    expect(BillingStatement).toBeDefined();
    expect(BillingStatement.reducer).toBeDefined();
    expect(BillingStatement.actions).toBeDefined();
    expect(BillingStatement.utils).toBeDefined();

    // Create a document
    const doc = BillingStatement.utils.createDocument();
    expect(scopeState(doc, "global").status).toBe("DRAFT");

    // Dispatch an action using the generated reducer and action creators
    const editStatusAction = BillingStatement.actions.editStatus({
      status: "ISSUED",
    });
    const updatedDoc = BillingStatement.reducer(doc, editStatusAction);

    // Verify state mutation
    expect(scopeState(updatedDoc, "global").status).toBe("ISSUED");
    expect(updatedDoc.operations.global).toHaveLength(1);
    expect(updatedDoc.operations.global[0].action.type).toBe("EDIT_STATUS");

    // Verify error handling: transitioning from PAID should produce an error
    const paidDoc = BillingStatement.reducer(
      updatedDoc,
      BillingStatement.actions.editStatus({ status: "PAID" }),
    );
    expect(scopeState(paidDoc, "global").status).toBe("PAID");

    const errorDoc = BillingStatement.reducer(
      paidDoc,
      BillingStatement.actions.editStatus({ status: "DRAFT" }),
    );
    // State should NOT change when error occurs
    expect(scopeState(errorDoc, "global").status).toBe("PAID");
    expect(errorDoc.operations.global[2].error).toBe(
      "Cannot change status from PAID",
    );
  });

  it("should generate a document model, plug it into a reactor, and observe state changes", async () => {
    const outDir = await generateDocModelProject("reactor-e2e");

    // Dynamically import the generated module
    const modulePath = join(
      outDir,
      "document-models",
      "billing-statement",
      "module.ts",
    );
    const docModelModule = (await import(modulePath)) as {
      BillingStatement: DocumentModelModule;
    };
    const { BillingStatement } = docModelModule;

    // Build a reactor with the generated document model and the drive model
    reactorModule = await new ReactorBuilder()
      .withDocumentModels([
        driveDocumentModelModule as unknown as DocumentModelModule,
        BillingStatement,
      ])
      .buildModule();

    // Create a document using the generated utils and track its id
    const initialDoc = BillingStatement.utils.createDocument();
    const docId = initialDoc.header.id;
    await reactorModule.reactor.create(initialDoc);

    // Wait for the document to be readable
    await waitFor(async () => {
      const doc = (await reactorModule!.reactor.get(docId)) as PHDocument;
      expect(doc).toBeDefined();
    });

    // Execute an action through the reactor
    await reactorModule.reactor.execute(docId, "main", [
      BillingStatement.actions.editStatus({ status: "ISSUED" }),
    ]);

    // Read the document back and verify state changed
    await waitFor(async () => {
      const result = (await reactorModule!.reactor.get(docId)) as PHDocument;
      expect(scopeState(result, "global").status).toBe("ISSUED");
    });
  });
});

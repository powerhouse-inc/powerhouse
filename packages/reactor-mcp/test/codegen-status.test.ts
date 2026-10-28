import type { InProcessReactorClientModule } from "@powerhousedao/reactor";
import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import { createReactorMcpProvider } from "@powerhousedao/reactor-mcp";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { CodegenStatusRegistry } from "@powerhousedao/shared/processors";
import {
  documentModelCreateDocument,
  documentModelDocumentModelModule,
} from "document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createP256Signer } from "./utils/p256-signer.js";

const DOCUMENT_MODEL = "powerhouse/document-model";

describe("getCodegenStatus tool", () => {
  let module: InProcessReactorClientModule;
  let codegenStatus: CodegenStatusRegistry;

  beforeEach(async () => {
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          documentModelDocumentModelModule,
          driveDocumentModelModule,
        ]),
      )
      .withSigner(await createP256Signer())
      .buildModule();
    codegenStatus = new CodegenStatusRegistry();
  });

  afterEach(() => {
    module.reactor.kill();
  });

  const provider = () =>
    createReactorMcpProvider({ client: module.client, codegenStatus });

  it("says no codegen runs on a reactor without Vetra", async () => {
    const { tools } = await provider();

    const result = await tools.getCodegenStatus.callback({});

    expect(result.structuredContent).toMatchObject({
      active: false,
      settled: true,
      documents: [],
      loadFailures: [],
    });
  });

  it("returns a document's status and the failed package loads", async () => {
    codegenStatus.watch([DOCUMENT_MODEL]);
    codegenStatus.set({
      documentId: "model-1",
      documentType: DOCUMENT_MODEL,
      name: "Reading List",
      state: "skipped",
      message: "The document model is not ready for code generation",
    });
    codegenStatus.reportLoad(
      "@acme/reading",
      "document models",
      "[VitePackageLoader] ReadingListStateSchema is not a function",
    );
    const { tools } = await provider();

    const result = await tools.getCodegenStatus.callback({
      documentId: "model-1",
    });

    expect(result.structuredContent).toStrictEqual({
      active: true,
      settled: true,
      documents: [
        {
          documentId: "model-1",
          documentType: DOCUMENT_MODEL,
          name: "Reading List",
          state: "skipped",
          message: "The document model is not ready for code generation",
          updatedAt: expect.any(String),
        },
      ],
      loadFailures: [
        {
          package: "@acme/reading",
          kind: "document models",
          message:
            "[VitePackageLoader] ReadingListStateSchema is not a function",
          updatedAt: expect.any(String),
        },
      ],
    });
  });

  it("waits for a job to settle", async () => {
    codegenStatus.watch([DOCUMENT_MODEL]);
    const job = { documentId: "model-1", documentType: DOCUMENT_MODEL };
    codegenStatus.set({ ...job, state: "running" });
    const { tools } = await provider();

    setTimeout(
      () =>
        codegenStatus.set({
          ...job,
          state: "done",
          files: ["document-models/reading-list/index.ts"],
        }),
      100,
    );
    const result = await tools.getCodegenStatus.callback({
      documentId: "model-1",
      waitSeconds: 10,
    });

    expect(result.structuredContent).toMatchObject({
      settled: true,
      documents: [
        { state: "done", files: ["document-models/reading-list/index.ts"] },
      ],
    });
  });

  it("stops waiting after waitSeconds", async () => {
    codegenStatus.watch([DOCUMENT_MODEL]);
    codegenStatus.set({
      documentId: "model-1",
      documentType: DOCUMENT_MODEL,
      state: "waiting-for-install",
    });
    const { tools } = await provider();

    const result = await tools.getCodegenStatus.callback({
      documentId: "model-1",
      waitSeconds: 0.2,
    });

    expect(result.structuredContent).toMatchObject({
      settled: false,
      documents: [{ state: "waiting-for-install" }],
    });
  });

  it("queues codegen for a Vetra document and says how to follow it", async () => {
    codegenStatus.watch([DOCUMENT_MODEL]);
    const document = documentModelCreateDocument();
    await (
      await module.client.write.create(document)
    ).readable;
    const { tools } = await provider();

    const result = await tools.addActions.callback({
      documentId: document.header.id,
      actions: [
        documentModelDocumentModelModule.actions.setModelName({
          name: "Reading List",
        }),
      ],
    });

    expect(result.structuredContent).toMatchObject({
      success: true,
      codegen: expect.stringContaining(
        `getCodegenStatus with documentId "${document.header.id}"`,
      ),
    });
    expect(codegenStatus.get(document.header.id)?.state).toBe("queued");
    const status = await tools.getCodegenStatus.callback({});
    expect(status.structuredContent).toMatchObject({
      settled: false,
      documents: [{ documentId: document.header.id, state: "queued" }],
    });
  });

  it("gives no codegen hint without Vetra", async () => {
    const document = documentModelCreateDocument();
    await (
      await module.client.write.create(document)
    ).readable;
    const { tools } = await provider();

    const result = await tools.addActions.callback({
      documentId: document.header.id,
      actions: [
        documentModelDocumentModelModule.actions.setModelName({
          name: "Reading List",
        }),
      ],
    });

    expect(result.structuredContent).not.toHaveProperty("codegen");
    expect(codegenStatus.list()).toEqual([]);
  });
});

import type {
  DocumentModelDocument,
  DocumentModelModule,
  Operation,
} from "document-model";
import {
  actions,
  documentModelDocumentModelModule,
  documentModelReducer,
} from "document-model";
import { createPresignedHeader, generateId } from "document-model/core";
import { beforeEach, describe, expect, it } from "vitest";

import type { BaseDocumentDriveServer } from "document-drive";
import {
  addFile,
  buildOperation,
  buildOperationAndDocument,
  driveDocumentModelModule,
  driveDocumentReducer,
  ReactorBuilder,
} from "document-drive";

describe("Undo/Redo with clipboard operations", () => {
  const documentModels = [
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ] as DocumentModelModule<any>[];

  let server: BaseDocumentDriveServer;
  const driveId = generateId();
  const documentId = generateId();

  beforeEach(async () => {
    server = new ReactorBuilder(
      documentModels,
    ).build() as unknown as BaseDocumentDriveServer;
    await server.initialize();
  });

  function createDocumentModel() {
    return {
      ...documentModelDocumentModelModule.utils.createDocument(),
      header: createPresignedHeader(
        documentId,
        documentModelDocumentModelModule.documentModel.global.id,
      ),
    };
  }

  async function createDriveAndDocument(): Promise<DocumentModelDocument> {
    // Create drive
    await server.addDrive({
      id: driveId,
      global: { name: "test-drive" },
      local: {
        availableOffline: false,
        sharingType: "PRIVATE",
        listeners: [],
        triggers: [],
      },
    });

    const drive = await server.getDrive(driveId);

    // Add the document to storage
    await server.addDocument(createDocumentModel());

    // Add a file node to the drive linking to the document
    await server.addOperation(
      driveId,
      buildOperation(
        driveDocumentReducer,
        drive,
        addFile({
          id: documentId,
          name: "test-document",
          documentType: "powerhouse/document-model",
        }),
      ) as Operation,
    );

    return server.getDocument<DocumentModelDocument>(documentId);
  }

  it("should handle undo/redo with skip semantics and clipboard", async () => {
    let document = await createDriveAndDocument();

    expect(document.operations.global).toBeDefined();
    expect(document.operations.global!.length).toBe(0);
    expect(document.clipboard).toEqual([]);

    const setNameOp = buildOperation(
      documentModelReducer,
      document,
      actions.setModelName({ name: "test-name" }),
    );

    await server.addOperation(documentId, setNameOp);
    document = await server.getDocument<DocumentModelDocument>(documentId);

    expect(document.operations.global!.length).toBe(1);
    expect((document.state as any).global.name).toBe("test-name");

    const undoResult = buildOperationAndDocument(
      documentModelReducer,
      document,
      actions.undo(),
    );

    await server.addOperation(documentId, undoResult.operation);
    document = await server.getDocument<DocumentModelDocument>(documentId);

    // With garbageCollect semantics, only the NOOP remains
    expect(document.operations.global!.length).toBe(1);

    const noopOp = document.operations.global![0];
    expect(noopOp.action.type).toBe("NOOP");
    expect(noopOp.skip).toBe(1);
    expect(noopOp.index).toBe(1);

    expect((document.state as any).global.name).toBe("");

    // Clipboard should contain the undone operation
    expect(document.clipboard.length).toBeGreaterThan(0);

    // Redo should succeed
    const redoOp = buildOperation(
      documentModelReducer,
      document,
      actions.redo(),
    );

    const redoResult = await server.addOperation(documentId, redoOp);
    expect(redoResult.status).toBe("SUCCESS");

    document = await server.getDocument<DocumentModelDocument>(documentId);
    expect((document.state as any).global.name).toBe("test-name");
  });

  it("should populate clipboard with undone operations", async () => {
    let document = await createDriveAndDocument();

    const setNameOp = buildOperation(
      documentModelReducer,
      document,
      actions.setModelName({ name: "test-name" }),
    );
    await server.addOperation(documentId, setNameOp);

    document = await server.getDocument<DocumentModelDocument>(documentId);

    expect(document.clipboard).toEqual([]);
    expect((document.state as any).global.name).toBe("test-name");

    const undoOp = buildOperation(
      documentModelReducer,
      document,
      actions.undo(),
    );
    await server.addOperation(documentId, undoOp);

    document = await server.getDocument<DocumentModelDocument>(documentId);

    expect((document.state as any).global.name).toBe("");
    expect(document.clipboard.length).toBeGreaterThan(0);

    const clipboardOp = document.clipboard[0] as Operation | undefined;
    expect(clipboardOp?.action.type).toBe("SET_MODEL_NAME");
  });

  it("should correctly handle redo after undo", async () => {
    let document = await createDriveAndDocument();

    const setNameOp = buildOperation(
      documentModelReducer,
      document,
      actions.setModelName({ name: "test-name" }),
    );
    await server.addOperation(documentId, setNameOp);

    document = await server.getDocument<DocumentModelDocument>(documentId);
    expect((document.state as any).global.name).toBe("test-name");

    const undoOp = buildOperation(
      documentModelReducer,
      document,
      actions.undo(),
    );
    await server.addOperation(documentId, undoOp);

    document = await server.getDocument<DocumentModelDocument>(documentId);
    expect((document.state as any).global.name).toBe("");

    const redoOp = buildOperation(
      documentModelReducer,
      document,
      actions.redo(),
    );
    const redoResult = await server.addOperation(documentId, redoOp);

    expect(redoResult.status).toBe("SUCCESS");

    document = await server.getDocument<DocumentModelDocument>(documentId);
    expect((document.state as any).global.name).toBe("test-name");
    expect(document.clipboard).toEqual([]);
  });
});

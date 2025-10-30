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

  it("should reproduce the undo/redo clipboard error", async () => {
    // Step 1: Create document with no operations and empty clipboard
    let document = await createDriveAndDocument();

    // Verify initial state
    expect(document.operations.global).toBeDefined();
    expect(document.operations.global!.length).toBe(0);
    expect(document.clipboard).toEqual([]);

    // Step 2: Dispatch an operation (UPDATE_NODE equivalent - using setModelName)
    const setNameOp = buildOperation(
      documentModelReducer,
      document,
      actions.setModelName({ name: "test-name" }),
    );

    await server.addOperation(documentId, setNameOp);

    document = await server.getDocument<DocumentModelDocument>(documentId);

    // Verify operation was added
    expect(document.operations.global!.length).toBe(1);
    expect((document.state as any).global.name).toBe("test-name");
    console.log("After UPDATE_NODE - clipboard:", document.clipboard);
    console.log(
      "After UPDATE_NODE - operations count:",
      document.operations.global!.length,
    );

    // Step 3: Dispatch undo operation
    const undoOp = buildOperation(
      documentModelReducer,
      document,
      actions.undo(),
    );

    await server.addOperation(documentId, undoOp);

    document = await server.getDocument<DocumentModelDocument>(documentId);

    // Verify the state after undo
    console.log("After UNDO - clipboard:", document.clipboard);
    console.log(
      "After UNDO - operations count:",
      document.operations.global!.length,
    );
    console.log("After UNDO - operations:", document.operations.global);

    // BUG: The original operation should still be present, and the NOOP should be appended
    // The NOOP should NOT replace the original operation
    // Expected: 2 operations (original + NOOP), Actual: 1 (NOOP replaces original)
    expect(document.operations.global!.length).toBe(2);

    // Verify the original operation is still at index 0
    const firstOp = document.operations.global![0];
    expect(firstOp.action.type).toBe("SET_MODEL_NAME");

    // Verify the NOOP is at index 1
    const secondOp = document.operations.global![1];
    expect(secondOp.action.type).toBe("NOOP");
    expect(secondOp.skip).toBe(1);

    // Verify the clipboard
    console.log(
      "Clipboard should have the undone operation:",
      document.clipboard,
    );
    // BUG: Clipboard should contain the operation that was undone
    expect(document.clipboard.length).toBeGreaterThan(0);

    // Step 4: Try to redo
    const redoOp = buildOperation(
      documentModelReducer,
      document,
      actions.redo(),
    );

    const redoResult = await server.addOperation(documentId, redoOp);

    console.log("REDO result:", redoResult);

    // BUG: This should succeed because the clipboard should have the operation
    // But we expect it to fail with: "Cannot redo: no operations in the clipboard"
    if (redoResult.status === "ERROR") {
      console.error("REDO failed with error:", redoResult.error?.message);
      expect(redoResult.error?.message).toContain(
        "Cannot redo: no operations in the clipboard",
      );
    } else {
      // If redo succeeds (which is what should happen), verify the state
      document = await server.getDocument<DocumentModelDocument>(documentId);
      expect((document.state as any).global.name).toBe("test-name");
    }
  });

  it("should append NOOP operations instead of replacing", async () => {
    // Create document
    let document = await createDriveAndDocument();

    // Add multiple operations
    const operations = [
      actions.setModelName({ name: "name1" }),
      actions.setModelDescription({ description: "desc1" }),
      actions.setAuthorName({ authorName: "author1" }),
    ];

    for (const action of operations) {
      document = await server.getDocument<DocumentModelDocument>(documentId);
      const op = buildOperation(documentModelReducer, document, action);
      await server.addOperation(documentId, op);
    }

    document = await server.getDocument<DocumentModelDocument>(documentId);

    const operationsBeforeUndo = document.operations.global!.length;
    expect(operationsBeforeUndo).toBe(3);

    // Dispatch undo
    document = await server.getDocument<DocumentModelDocument>(documentId);
    const undoOp = buildOperation(
      documentModelReducer,
      document,
      actions.undo(),
    );
    await server.addOperation(documentId, undoOp);

    document = await server.getDocument<DocumentModelDocument>(documentId);

    // NOOP should be appended, not replacing
    // Expected: 4 operations (3 originals + NOOP), Actual: 3 (NOOP replaces last)
    expect(document.operations.global!.length).toBe(4);

    // Verify all original operations are still present
    expect(document.operations.global![0].action.type).toBe("SET_MODEL_NAME");
    expect(document.operations.global![1].action.type).toBe(
      "SET_MODEL_DESCRIPTION",
    );
    expect(document.operations.global![2].action.type).toBe("SET_AUTHOR_NAME");
    expect(document.operations.global![3].action.type).toBe("NOOP");
    expect(document.operations.global![3].skip).toBe(1);
  });

  it("should populate clipboard with undone operations", async () => {
    // Create document
    let document = await createDriveAndDocument();

    // Add an operation
    const setNameOp = buildOperation(
      documentModelReducer,
      document,
      actions.setModelName({ name: "test-name" }),
    );
    await server.addOperation(documentId, setNameOp);

    document = await server.getDocument<DocumentModelDocument>(documentId);

    // Clipboard should be empty
    expect(document.clipboard).toEqual([]);

    // Dispatch undo
    const undoOp = buildOperation(
      documentModelReducer,
      document,
      actions.undo(),
    );
    await server.addOperation(documentId, undoOp);

    document = await server.getDocument<DocumentModelDocument>(documentId);

    // BUG: Clipboard should now contain the undone operation
    expect(document.clipboard.length).toBeGreaterThan(0);

    // The clipboard should contain the SET_MODEL_NAME operation that was undone
    const clipboardOp = document.clipboard[0] as Operation | undefined;
    expect(clipboardOp?.action.type).toBe("SET_MODEL_NAME");
  });

  it("should correctly handle redo after undo", async () => {
    // Create document
    let document = await createDriveAndDocument();

    // Add an operation
    const setNameOp = buildOperation(
      documentModelReducer,
      document,
      actions.setModelName({ name: "test-name" }),
    );
    await server.addOperation(documentId, setNameOp);

    document = await server.getDocument<DocumentModelDocument>(documentId);
    expect((document.state as any).global.name).toBe("test-name");

    // Undo the operation
    const undoOp = buildOperation(
      documentModelReducer,
      document,
      actions.undo(),
    );
    await server.addOperation(documentId, undoOp);

    document = await server.getDocument<DocumentModelDocument>(documentId);
    expect((document.state as any).global.name).toBe(""); // Name should be reset

    // Redo the operation
    const redoOp = buildOperation(
      documentModelReducer,
      document,
      actions.redo(),
    );
    const redoResult = await server.addOperation(documentId, redoOp);

    // This should succeed when clipboard has operations
    expect(redoResult.status).toBe("SUCCESS");

    document = await server.getDocument<DocumentModelDocument>(documentId);
    expect((document.state as any).global.name).toBe("test-name"); // Name should be restored
    expect(document.clipboard).toEqual([]); // Clipboard should be empty after redo
  });
});

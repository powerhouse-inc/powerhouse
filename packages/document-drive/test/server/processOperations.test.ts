import {
  type Action,
  type DocumentModelDocument,
  documentModelDocumentModelModule,
  type DocumentModelModule,
  documentModelReducer,
  garbageCollect,
  generateId,
  type Operation,
  setModelExtension,
  setModelId,
  setModelName,
} from "document-model";
import { beforeEach, describe, expect, it, vitest } from "vitest";

import { addFile } from "#drive-document-model";
import { type BaseDocumentDriveServer } from "#server";
import { createPresignedHeader } from "document-model";
import { undo } from "../../../document-model/src/document/actions/creators.js";
import { reducer as documentDriveReducer } from "../../src/drive-document-model/gen/reducer.js";
import { driveDocumentModelModule } from "../../src/drive-document-model/module.js";
import { ReactorBuilder } from "../../src/server/builder.js";
import { type IOperationResult } from "../../src/server/types.js";
import { BasicClient, buildOperation, buildOperations } from "../utils.js";

const mapExpectedOperations = (operations: Operation[]) =>
  operations.map((op) => {
    const { id, timestampUtcMs, ...operation } = op;
    return operation;
  });

describe("processOperations", () => {
  const documentModels = [
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ] as DocumentModelModule[];

  let server: BaseDocumentDriveServer;
  beforeEach(async () => {
    vitest.useRealTimers();

    server = new ReactorBuilder(
      documentModels,
    ).build() as unknown as BaseDocumentDriveServer;
    await server.initialize();
  });

  const driveId = generateId();
  const documentId = generateId();
  function createDocumentModel() {
    return {
      ...documentModelDocumentModelModule.utils.createDocument(),
      header: createPresignedHeader(
        documentId,
        documentModelDocumentModelModule.documentModel.id,
      ),
    };
  }

  async function buildFile(initialOperations: Action[] = []) {
    await server.addDrive({
      id: driveId,
      global: { name: "test" },
      local: {
        availableOffline: false,
        sharingType: "PRIVATE",
        listeners: [],
        triggers: [],
      },
    });
    const drive = await server.getDrive(driveId);

    await server.addDocument(createDocumentModel());

    await server.addDriveOperation(
      driveId,
      buildOperation(
        documentDriveReducer,
        drive,
        addFile({
          id: documentId,
          name: "test",
          documentType: "powerhouse/document-model",
        }),
      ),
    );

    let document = await server.getDocument<DocumentModelDocument>(documentId);

    if (initialOperations.length > 0) {
      await server.addOperations(
        documentId,
        buildOperations(documentModelReducer, document, initialOperations),
      );

      document = await server.getDocument<DocumentModelDocument>(documentId);
    }

    return document;
  }

  it("should add initial operations to a document", async () => {
    const operations = [
      setModelName({ name: "test" }),
      setModelId({ id: "test" }),
    ];

    const document = await buildFile(operations);

    expect(document.operations.global.length).toBe(operations.length);
    expect(document.state.global).toMatchObject({
      name: "test",
      id: "test",
    });
  });

  it("should apply a single new operation", async () => {
    const document = await buildFile();

    const operations = buildOperations(documentModelReducer, document, [
      setModelName({ name: "test" }),
    ]);

    const result = await server._processOperations(
      document.header.id,
      document,
      operations,
    );

    expect(result.document.state.global).toMatchObject({ name: "test" });
    expect(result.error).toBeUndefined();
    expect(result.operationsApplied.length).toBe(1);
    expect(result.operationsApplied).toMatchObject(
      mapExpectedOperations(operations),
    );
  });

  it("should apply multiple new operations", async () => {
    const document = await buildFile([
      setModelName({ name: "test" }),
      setModelId({ id: "test" }),
    ]);

    const operations = buildOperations(documentModelReducer, document, [
      setModelName({ name: "test2" }),
      setModelId({ id: "test2" }),
      setModelExtension({
        extension: "test2",
      }),
    ]);

    const result = await server._processOperations(
      document.header.id,
      document,
      operations,
    );

    expect(result.document.state.global).toMatchObject({
      name: "test2",
      id: "test2",
      extension: "test2",
    });
    expect(result.error).toBeUndefined();
    expect(result.operationsApplied.length).toBe(operations.length);
    expect(result.operationsApplied).toMatchObject(
      mapExpectedOperations(operations),
    );
  });

  it.skip("should apply undo operation", async () => {
    const document = await buildFile([
      setModelName({ name: "test" }),
      setModelId({ id: "test" }),
    ]);

    const operations = buildOperations(documentModelReducer, document, [
      undo(),
    ]);

    const result = await server._processOperations(
      document.header.id,
      document,
      operations,
    );

    expect(result.document.state.global).toMatchObject({
      name: "test",
      id: "",
    });
    expect(result.error).toBeUndefined();
    expect(result.operationsApplied.length).toBe(operations.length);
    expect(result.operationsApplied).toMatchObject(
      mapExpectedOperations(operations),
    );

    expect(result.document.operations.global.length).toBe(3);
    expect(result.document.operations.global[1]).toMatchObject({
      type: "NOOP",
      skip: 0,
    });
    expect(result.document.operations.global[2]).toMatchObject({
      type: "NOOP",
      skip: 1,
    });
  });

  it.skip("should update an undo operation", async () => {
    const actions = [
      setModelName({ name: "test" }),
      setModelId({ id: "test" }),
      setModelExtension({ extension: "test" }),
      undo(),
    ];
    const document = await buildFile(actions);

    const undoAction = undo();
    const operations = buildOperations(documentModelReducer, document, [
      undoAction,
    ]);

    const result = await server._processOperations(
      document.header.id,
      document,
      operations,
    );

    expect(result.document.state.global).toMatchObject({
      name: "test",
      id: "",
      extension: "",
    });
    expect(result.error).toBeUndefined();
    expect(result.operationsApplied.length).toBe(0);
    expect(garbageCollect(result.document.operations.global)).toMatchObject(
      garbageCollect([
        { action: { type: "SET_MODEL_NAME" }, index: 0, skip: 0 },
        { action: { type: "NOOP" }, index: 1, skip: 0 },
        { action: { type: "NOOP" }, index: 2, skip: 0 },
        { action: { type: "NOOP" }, index: 3, skip: 2 },
      ] as Operation[]),
    );
  });

  it("should throw an error if there is a missing index operation", async () => {
    const document = await buildFile([
      setModelName({ name: "test" }),
      setModelId({ id: "test" }),
      setModelExtension({ extension: "test" }),
    ]);

    const operations = [
      buildOperation(
        documentModelReducer,
        document,
        setModelName({ name: "test2" }),
        4,
      ),
    ];

    const result = await server._processOperations(
      document.header.id,
      document,
      operations,
    );

    expect(result.error?.message).toBe(
      "Missing operations: expected 3 with skip 0 or equivalent, got index 4 with skip 0",
    );
    expect(result.operationsApplied.length).toBe(0);
    expect(result.document.operations.global.length).toBe(3);
    expect(result.document.state.global).toMatchObject({
      name: "test",
      id: "test",
      extension: "test",
    });
  });

  it("should throw an error if there is a missing index operation between valid operations", async () => {
    const document = await buildFile([
      setModelName({ name: "test" }),
      setModelId({ id: "test" }),
      setModelExtension({ extension: "test" }),
    ]);

    const operations = [
      buildOperation(
        documentModelReducer,
        document,
        setModelName({ name: "test3" }),
        3,
      ),
      buildOperation(
        documentModelReducer,
        document,
        setModelName({ name: "test4" }),
        4,
      ),
      buildOperation(
        documentModelReducer,
        document,
        setModelName({ name: "test6" }),
        6,
      ),
      buildOperation(
        documentModelReducer,
        document,
        setModelName({ name: "test7" }),
        7,
      ),
    ];

    const result = await server._processOperations(
      document.header.id,
      document,
      operations,
    );

    expect(result.error?.message).toBe(
      "Missing operations: expected 5 with skip 0 or equivalent, got index 6 with skip 0",
    );
    expect(result.operationsApplied.length).toBe(2);
    expect(result.document.operations.global.length).toBe(5);
    expect(result.document.state.global).toMatchObject({
      name: "test4",
      id: "test",
      extension: "test",
    });
  });

  it("should throw an error if there is a duplicated index operation", async () => {
    const document = await buildFile([
      setModelName({ name: "test" }),
      setModelId({ id: "test" }),
      setModelExtension({ extension: "test" }),
    ]);

    const operations = [
      buildOperation(
        documentModelReducer,
        document,
        setModelName({ name: "test2" }),
        2,
      ),
    ];

    const result = await server._processOperations(
      document.header.id,
      document,
      operations,
    );

    expect(result.error).toBeUndefined();
    expect(result.operationsApplied.length).toBe(2);
    expect(result.document.operations.global.length).toBe(4);
    expect(result.document.state.global).toMatchObject({
      name: "test2",
      id: "test",
      extension: "test",
    });
  });

  it("should throw an error if there is a duplicated index operation between valid operations", async () => {
    const document = await buildFile([
      setModelName({ name: "test" }),
      setModelId({ id: "test" }),
      setModelExtension({ extension: "test" }),
    ]);

    const operations = [
      buildOperation(
        documentModelReducer,
        document,
        setModelName({ name: "test3" }),
        3,
      ),
      buildOperation(
        documentModelReducer,
        document,
        setModelName({ name: "test4" }),
        3,
      ),
      buildOperation(
        documentModelReducer,
        document,
        setModelName({ name: "test5" }),
        4,
      ),
    ];

    const result = await server._processOperations(
      documentId,
      document,
      operations,
    );

    expect(result.error).toBeUndefined();
    expect(result.operationsApplied.length).toBe(2);
    expect(result.document.operations.global.length).toBe(5);
    expect(result.document.state.global).toMatchObject({
      name: "test5",
      id: "test",
      extension: "test",
    });
  });

  it("should not re-apply existing operations", async () => {
    let document = await buildFile();

    const operation = buildOperation(
      documentModelReducer,
      document,
      setModelName({ name: "test" }),
    );

    const resultOp1 = await server.addOperation(documentId, operation);

    expect(resultOp1.status).toBe("SUCCESS");

    document = await server.getDocument<DocumentModelDocument>(documentId);

    expect(document.state.global.name).toBe("test");
    expect(document.operations.global.length).toBe(1);
    expect(document.operations.global).toMatchObject([
      {
        hash: operation.hash,
        index: operation.index,
        action: {
          input: operation.action.input,
          scope: operation.action.scope,
        },
        skip: operation.skip,
      },
    ]);

    const resultOp2 = await server.addOperation(documentId, operation);

    document = await server.getDocument<DocumentModelDocument>(documentId);

    expect(resultOp2.status).toBe("SUCCESS");
    expect(resultOp2.operations.length).toBe(1);

    expect(document.operations.global.length).toBe(1);
    expect(document.operations.global).toMatchObject([
      {
        hash: operation.hash,
        index: operation.index,
        action: expect.objectContaining({
          input: operation.action.input,
          scope: operation.action.scope,
        }),
        skip: operation.skip,
      },
    ]);
  });

  it("should preserve the right order of the operations when merge conflict is applied", async () => {
    let document = await buildFile();

    const operation0 = buildOperation(
      documentModelReducer,
      document,
      setModelName({ name: "1" }),
      0,
    );

    const resultOp0 = await server.addOperation(documentId, operation0);

    expect(resultOp0.status).toBe("SUCCESS");

    document = await server.getDocument(documentId);

    const operation1 = buildOperation(
      documentModelReducer,
      document,
      setModelName({ name: "2" }),
      0,
    );

    const resultOp1 = await server.addOperation(documentId, operation1);

    expect(resultOp1.status).toBe("SUCCESS");

    document = await server.getDocument<DocumentModelDocument>(documentId);

    const operation2 = buildOperation(
      documentModelReducer,
      document,
      setModelId({ id: "3" }),
      0,
    );

    const resultOp2 = await server.addOperation(documentId, operation2);

    expect(resultOp2.status).toBe("SUCCESS");

    document = await server.getDocument<DocumentModelDocument>(documentId);

    const operation3 = buildOperation(
      documentModelReducer,
      document,
      setModelId({ id: "4" }),
      0,
    );

    const resultOp3 = await server.addOperation(documentId, operation3);

    expect(resultOp3.status).toBe("SUCCESS");

    document = await server.getDocument<DocumentModelDocument>(documentId);

    const operations = document.operations.global.slice(-4);

    expect(document.state.global).toMatchObject({
      name: "2",
      id: "4",
    });
    expect(operations).toMatchObject([
      {
        type: "SET_MODEL_NAME",
        input: { name: "1" },
        index: 6,
        skip: 6,
      },
      {
        type: "SET_MODEL_NAME",
        input: { name: "2" },
        index: 7,
        skip: 0,
      },
      {
        type: "SET_MODEL_ID",
        input: { id: "3" },
        index: 8,
        skip: 0,
      },
      {
        type: "SET_MODEL_ID",
        input: { id: "4" },
        index: 9,
        skip: 0,
      },
    ]);
  });

  it("should resolve conflicts using the right order for merge operations (simulate clients conflict)", async () => {
    const initialDocument = await buildFile();
    let pushOperationResult: IOperationResult;

    const client1 = new BasicClient(
      server,
      driveId,
      documentId,
      initialDocument,
      documentModelReducer,
    );

    const client2 = new BasicClient(
      server,
      driveId,
      documentId,
      initialDocument,
      documentModelReducer,
    );

    client1.dispatchDocumentAction(setModelName({ name: "1" }));
    pushOperationResult = await client1.pushOperationsToServer();
    expect(pushOperationResult.status).toBe("SUCCESS");

    client2.dispatchDocumentAction(setModelName({ name: "2" }));
    pushOperationResult = await client2.pushOperationsToServer();
    expect(pushOperationResult.status).toBe("SUCCESS");

    client2.dispatchDocumentAction(setModelId({ id: "3" }));
    pushOperationResult = await client2.pushOperationsToServer();
    expect(pushOperationResult.status).toBe("SUCCESS");

    client1.dispatchDocumentAction(setModelId({ id: "4" }));
    pushOperationResult = await client1.pushOperationsToServer();
    expect(pushOperationResult.status).toBe("SUCCESS");

    // Check the final state of the document
    const finalDocument =
      await server.getDocument<DocumentModelDocument>(documentId);

    const operations = finalDocument.operations.global.slice(-4);

    expect(finalDocument.state.global).toMatchObject({
      name: "2",
      id: "4",
    });
    expect(operations).toMatchObject([
      {
        type: "SET_MODEL_NAME",
        input: { name: "1" },
        index: 6,
        skip: 6,
      },
      {
        type: "SET_MODEL_NAME",
        input: { name: "2" },
        index: 7,
        skip: 0,
      },
      {
        type: "SET_MODEL_ID",
        input: { id: "3" },
        index: 8,
        skip: 0,
      },
      {
        type: "SET_MODEL_ID",
        input: { id: "4" },
        index: 9,
        skip: 0,
      },
    ]);
  });

  it("should produce the same operations result for a local document (simulate sync: pull)", async () => {
    const initialDocument = await buildFile();
    let pushOperationResult: IOperationResult;

    const client1 = new BasicClient(
      server,
      driveId,
      documentId,
      initialDocument,
      documentModelReducer,
    );

    const client2 = new BasicClient(
      server,
      driveId,
      documentId,
      initialDocument,
      documentModelReducer,
    );

    client1.dispatchDocumentAction(setModelName({ name: "1" }));
    pushOperationResult = await client1.pushOperationsToServer();
    expect(pushOperationResult.status).toBe("SUCCESS");

    client2.dispatchDocumentAction(setModelName({ name: "2" }));
    pushOperationResult = await client2.pushOperationsToServer();
    expect(pushOperationResult.status).toBe("SUCCESS");

    const finalDocument =
      await server.getDocument<DocumentModelDocument>(documentId);

    const clientDocument = client1.getDocument();
    expect(clientDocument.operations.global.length).toBe(1);

    const updatedClientDocument = await client1.syncDocument();

    expect(finalDocument.operations.global.length).toBe(2);
    expect(updatedClientDocument.operations.global.length).toBe(2);
    expect(updatedClientDocument.operations.global).toMatchObject(
      mapExpectedOperations(finalDocument.operations.global),
    );
  });
});

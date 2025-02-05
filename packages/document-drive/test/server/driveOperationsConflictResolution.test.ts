import * as DocumentDrive from "document-model-libs/document-drive";
import * as DocumentModelsLibs from "document-model-libs/document-models";
import {
  BaseAction,
  DocumentModelModule as BaseDocumentModel,
  Operation,
} from "document-model/document";
import { module as DocumentModelLib } from "document-model/document-model";
import { beforeEach, describe, expect, it } from "vitest";
import { DocumentDriveServer, IOperationResult } from "../../src";
import { DriveBasicClient } from "../utils";

function sortNodes(nodes: DocumentDrive.Node[]) {
  return nodes.sort((a, b) => (a.id < b.id ? -1 : 1));
}

describe("Drive Operations", () => {
  const documentModels = [
    DocumentModelLib,
    ...Object.values(DocumentModelsLibs),
  ] as BaseDocumentModel[];

  let server = new DocumentDriveServer(documentModels);
  beforeEach(async () => {
    server = new DocumentDriveServer(documentModels);
    await server.initialize();
  });

  const driveId = "1";

  async function buildDrive() {
    await server.addDrive({
      global: { id: driveId, name: "test", icon: null, slug: null },
      local: {
        availableOffline: false,
        sharingType: "PRIVATE",
        listeners: [],
        triggers: [],
      },
    });

    return await server.getDrive(driveId);
  }

  it("should not re-apply existing operations", async () => {
    const initialDriveDocument = await buildDrive();
    let pushOperationResult: IOperationResult;

    DocumentDrive.utils.createDocument();

    const client1 = new DriveBasicClient(
      server,
      driveId,
      initialDriveDocument,
      DocumentDrive.reducer,
    );

    const client2 = new DriveBasicClient(
      server,
      driveId,
      initialDriveDocument,
      DocumentDrive.reducer,
    );

    client1.dispatchDriveAction(
      DocumentDrive.actions.addFolder({ id: "1", name: "test1" }),
    );
    pushOperationResult = await client1.pushOperationsToServer();
    expect(pushOperationResult.status).toBe("SUCCESS");

    client2.dispatchDriveAction(
      DocumentDrive.actions.addFolder({ id: "2", name: "test2" }),
    );
    pushOperationResult = await client2.pushOperationsToServer();
    expect(pushOperationResult.status).toBe("SUCCESS");

    await client1.syncDocument();
    expect(client1.getUnsyncedOperations()).toMatchObject([]);

    const syncedOperations = client1.getDocument().operations
      .global as Operation<DocumentDrive.DocumentDriveAction | BaseAction>[];
    client1.setUnsyncedOperations(syncedOperations);

    pushOperationResult = await client1.pushOperationsToServer();

    const drive = await server.getDrive(driveId);

    expect(drive.state.global.nodes.length).toBe(2);
    expect(drive.state.global.nodes).toMatchObject([
      { id: "1", name: "test1" },
      { id: "2", name: "test2" },
    ]);
    expect(drive.operations.global.length).toBe(2);
    expect(drive.operations.global).toMatchObject([
      {
        type: "ADD_FOLDER",
        input: { id: "1", name: "test1" },
        scope: "global",
        index: 1,
        skip: 1,
      },
      {
        type: "ADD_FOLDER",
        input: { id: "2", name: "test2" },
        scope: "global",
        index: 2,
        skip: 0,
      },
    ]);
  });

  it("should resolve conflicts when 5 clients are pushing changes to the same drive", async () => {
    const initialDriveDocument = await buildDrive();
    let pushOperationResult: IOperationResult;

    DocumentDrive.utils.createDocument();

    const client1 = new DriveBasicClient(
      server,
      driveId,
      initialDriveDocument,
      DocumentDrive.reducer,
    );

    const client2 = new DriveBasicClient(
      server,
      driveId,
      initialDriveDocument,
      DocumentDrive.reducer,
    );

    const client3 = new DriveBasicClient(
      server,
      driveId,
      initialDriveDocument,
      DocumentDrive.reducer,
    );

    const client4 = new DriveBasicClient(
      server,
      driveId,
      initialDriveDocument,
      DocumentDrive.reducer,
    );

    const client5 = new DriveBasicClient(
      server,
      driveId,
      initialDriveDocument,
      DocumentDrive.reducer,
    );

    // Client1 Add folder and push to server
    client1.dispatchDriveAction(
      DocumentDrive.actions.addFolder({ id: "1", name: "test1" }),
    );
    pushOperationResult = await client1.pushOperationsToServer();
    expect(pushOperationResult.status).toBe("SUCCESS");

    // Client2 Add folder and push to server
    client2.dispatchDriveAction(
      DocumentDrive.actions.addFolder({ id: "2", name: "test2" }),
    );
    pushOperationResult = await client2.pushOperationsToServer();
    expect(pushOperationResult.status).toBe("SUCCESS");

    // Client1 sync with server
    await client1.syncDocument();
    expect(client1.getUnsyncedOperations()).toMatchObject([]);

    // Clien1 push already synced operations to server (this should not create new operations in the server document)
    const syncedOperations = client1.getDocument().operations
      .global as Operation<DocumentDrive.DocumentDriveAction | BaseAction>[];

    client1.setUnsyncedOperations(syncedOperations);
    pushOperationResult = await client1.pushOperationsToServer();

    // Client3 sync with server
    await client3.syncDocument();

    // Client3 add folder and push to server
    client3.dispatchDriveAction(
      DocumentDrive.actions.addFolder({ id: "3", name: "test3" }),
    );
    pushOperationResult = await client3.pushOperationsToServer();
    expect(pushOperationResult.status).toBe("SUCCESS");

    // Client4 sync with server (partially syncs at this point)
    await client4.syncDocument();

    // Client3 add folder and push to server
    client3.dispatchDriveAction(
      DocumentDrive.actions.addFolder({ id: "4", name: "test4" }),
    );
    pushOperationResult = await client3.pushOperationsToServer();
    expect(pushOperationResult.status).toBe("SUCCESS");

    // Client4 add folder and push to server
    client4.dispatchDriveAction(
      DocumentDrive.actions.addFolder({ id: "5", name: "test5" }),
    );
    pushOperationResult = await client4.pushOperationsToServer();
    expect(pushOperationResult.status).toBe("SUCCESS");

    // Client5 add folder and push to server
    client5.dispatchDriveAction(
      DocumentDrive.actions.addFolder({ id: "6", name: "test6" }),
    );
    pushOperationResult = await client5.pushOperationsToServer();
    expect(pushOperationResult.status).toBe("SUCCESS");

    // Check if the operations are in the server
    const drive = await server.getDrive(driveId);

    expect(drive.state.global.nodes.length).toBe(6);
    expect(drive.state.global.nodes).toMatchObject([
      { id: "1", name: "test1" },
      { id: "2", name: "test2" },
      { id: "3", name: "test3" },
      { id: "4", name: "test4" },
      { id: "5", name: "test5" },
      { id: "6", name: "test6" },
    ]);
    expect(drive.operations.global.slice(-6)).toMatchObject([
      {
        type: "ADD_FOLDER",
        input: { id: "1", name: "test1" },
        scope: "global",
        index: 7,
        skip: 7,
      },
      {
        type: "ADD_FOLDER",
        input: { id: "2", name: "test2" },
        scope: "global",
        index: 8,
        skip: 0,
      },
      {
        type: "ADD_FOLDER",
        input: { id: "3", name: "test3" },
        scope: "global",
        index: 9,
        skip: 0,
      },
      {
        type: "ADD_FOLDER",
        input: { id: "4", name: "test4" },
        scope: "global",
        index: 10,
        skip: 0,
      },
      {
        type: "ADD_FOLDER",
        input: { id: "5", name: "test5" },
        scope: "global",
        index: 11,
        skip: 0,
      },
      {
        type: "ADD_FOLDER",
        input: { id: "6", name: "test6" },
        scope: "global",
        index: 12,
        skip: 0,
      },
    ]);
  });

  it("Should not throw an error when adding the same folder twice (same client)", async () => {
    const initialDriveDocument = await buildDrive();
    let pushOperationResult: IOperationResult;

    DocumentDrive.utils.createDocument();

    const client1 = new DriveBasicClient(
      server,
      driveId,
      initialDriveDocument,
      DocumentDrive.reducer,
    );

    const addFolderAction = DocumentDrive.actions.addFolder({
      id: "1",
      name: "test1",
    });
    client1.dispatchDriveAction(addFolderAction);
    pushOperationResult = await client1.pushOperationsToServer();
    expect(pushOperationResult.status).toBe("SUCCESS");

    client1.dispatchDriveAction(addFolderAction);
    pushOperationResult = await client1.pushOperationsToServer();
    expect(pushOperationResult.status).toBe("SUCCESS");

    expect(client1.getDocument().operations.global.length).toBe(2);
    expect(client1.getDocument().operations.global[1]).toMatchObject({
      type: "ADD_FOLDER",
      index: 1,
      skip: 0,
      input: { id: "1", name: "test1" },
      error: "Node with id 1 already exists!",
    });

    const drive = await server.getDrive(driveId);

    expect(drive.state.global.nodes.length).toBe(1);
    expect(drive.state.global.nodes).toMatchObject([
      { id: "1", name: "test1" },
    ]);
    expect(drive.operations.global.length).toBe(2);
    expect(drive.operations.global).toMatchObject([
      {
        type: "ADD_FOLDER",
        input: { id: "1", name: "test1" },
        error: undefined,
        index: 0,
        skip: 0,
      },
      {
        type: "ADD_FOLDER",
        input: { id: "1", name: "test1" },
        scope: "global",
        index: 1,
        skip: 0,
        error: "Node with id 1 already exists!",
      },
    ]);
  });

  it(
    "Should not throw an error when adding the same folder twice (2 clients)",
    { retry: 10 },
    async () => {
      const initialDriveDocument = await buildDrive();
      let pushOperationResult: IOperationResult;

      DocumentDrive.utils.createDocument();

      const client1 = new DriveBasicClient(
        server,
        driveId,
        initialDriveDocument,
        DocumentDrive.reducer,
      );

      const client2 = new DriveBasicClient(
        server,
        driveId,
        initialDriveDocument,
        DocumentDrive.reducer,
      );

      client1.dispatchDriveAction(
        DocumentDrive.actions.addFolder({
          id: "1",
          name: "test1",
        }),
      );
      pushOperationResult = await client1.pushOperationsToServer();
      expect(pushOperationResult.status).toBe("SUCCESS");
      expect(client1.getDocument().operations.global.length).toBe(1);
      expect(client1.getDocument().operations.global[0]).toMatchObject({
        type: "ADD_FOLDER",
        index: 0,
        skip: 0,
        input: { id: "1", name: "test1" },
        error: undefined,
      });

      client2.dispatchDriveAction(
        DocumentDrive.actions.addFolder({
          id: "1",
          name: "test2",
        }),
      );
      pushOperationResult = await client2.pushOperationsToServer();
      expect(pushOperationResult.status).toBe("SUCCESS");

      expect(client2.getDocument().operations.global.length).toBe(1);
      expect(client2.getDocument().operations.global[0]).toMatchObject({
        type: "ADD_FOLDER",
        index: 0,
        skip: 0,
        input: { id: "1", name: "test2" },
        error: undefined,
      });

      const drive = await server.getDrive(driveId);

      expect(drive.state.global.nodes.length).toBe(1);
      expect(drive.state.global.nodes).toMatchObject([
        { id: "1", name: "test1" },
      ]);

      expect(drive.operations.global.length).toBe(2);
      expect(drive.operations.global).toMatchObject([
        {
          type: "ADD_FOLDER",
          input: { id: "1", name: "test1" },
          error: undefined,
          index: 1,
          skip: 1,
        },
        {
          type: "ADD_FOLDER",
          input: { id: "1", name: "test2" },
          scope: "global",
          index: 2,
          skip: 0,
          error: "Node with id 1 already exists!",
        },
      ]);
    },
  );

  it("should resolve conflicts without duplicate ids when copy folders", async () => {
    let idCounter = 0;
    const generateId = () => {
      idCounter++;
      return `${idCounter}`;
    };

    const initialDriveDocument = await buildDrive();
    let pushOperationResult: IOperationResult;

    DocumentDrive.utils.createDocument();

    const client1 = new DriveBasicClient(
      server,
      driveId,
      initialDriveDocument,
      DocumentDrive.reducer,
    );

    const client2 = new DriveBasicClient(
      server,
      driveId,
      initialDriveDocument,
      DocumentDrive.reducer,
    );

    const idFolder1 = generateId();
    const idFolder2 = generateId();

    expect(idFolder1).toBe("1");
    expect(idFolder2).toBe("2");

    // Add folders in client 1 and push to server

    client1.dispatchDriveAction(
      DocumentDrive.actions.addFolder({ id: idFolder1, name: "1" }),
    );
    pushOperationResult = await client1.pushOperationsToServer();
    expect(pushOperationResult.status).toBe("SUCCESS");

    client1.dispatchDriveAction(
      DocumentDrive.actions.addFolder({
        id: idFolder2,
        name: "2",
        parentFolder: idFolder1,
      }),
    );
    pushOperationResult = await client1.pushOperationsToServer();
    expect(pushOperationResult.status).toBe("SUCCESS");

    // Sync client 2 with server
    await client2.syncDocument();

    // Copy folder 1 to root in client 1 and push to server
    const copyNodesInput = DocumentDrive.utils.generateNodesCopy(
      {
        srcId: idFolder1,
        targetName: "1",
        targetParentFolder: undefined,
      },
      generateId,
      (client1.getDocument() as DocumentDrive.DocumentDriveDocument).state
        .global.nodes,
    );

    const copyActions = copyNodesInput.map((copyNodeInput) =>
      DocumentDrive.actions.copyNode(copyNodeInput),
    );

    for (const copyAction of copyActions) {
      client1.dispatchDriveAction(copyAction);
    }

    pushOperationResult = await client1.pushOperationsToServer();
    expect(pushOperationResult.status).toBe("SUCCESS");

    let drive = await server.getDrive(driveId);

    expect(drive.state.global.nodes.length).toBe(4);
    expect(drive.state.global.nodes).toMatchObject([
      { id: "1", name: "1", parentFolder: null },
      { id: "2", name: "2", parentFolder: "1" },
      { id: "3", name: "1 (copy) 1", parentFolder: null },
      { id: "4", name: "2", parentFolder: "3" },
    ]);

    /* CLIENT 2 */

    // generate copy nodes input for client 2
    const copyNodesInput2 = DocumentDrive.utils.generateNodesCopy(
      {
        srcId: idFolder1,
        targetName: "1",
        targetParentFolder: undefined,
      },
      generateId,
      (client2.getDocument() as DocumentDrive.DocumentDriveDocument).state
        .global.nodes,
    );

    const copyNodesInput3 = DocumentDrive.utils.generateNodesCopy(
      {
        srcId: idFolder1,
        targetName: "1",
        targetParentFolder: undefined,
      },
      generateId,
      (client2.getDocument() as DocumentDrive.DocumentDriveDocument).state
        .global.nodes,
    );

    const copyActions2 = copyNodesInput2.map((copyNodeInput) =>
      DocumentDrive.actions.copyNode(copyNodeInput),
    );

    const copyActions3 = copyNodesInput3.map((copyNodeInput) =>
      DocumentDrive.actions.copyNode(copyNodeInput),
    );

    // apply copy actions (1) to client 2
    for (const copyAction of copyActions2) {
      client2.dispatchDriveAction(copyAction);
    }

    // push operations to server
    pushOperationResult = await client2.pushOperationsToServer();
    expect(pushOperationResult.status).toBe("SUCCESS");

    drive = await server.getDrive(driveId);

    expect(drive.state.global.nodes.length).toBe(6);
    expect(drive.state.global.nodes).toMatchObject([
      { id: "1", name: "1", parentFolder: null },
      { id: "2", name: "2", parentFolder: "1" },
      { id: "3", name: "1 (copy) 1", parentFolder: null },
      { id: "4", name: "2", parentFolder: "3" },
      { id: "5", name: "1 (copy) 2", parentFolder: null },
      { id: "6", name: "2", parentFolder: "5" },
    ]);

    // apply copy actions (2) to client 2
    for (const copyAction of copyActions3) {
      client2.dispatchDriveAction(copyAction);
    }

    // sync client 2 with server
    await client2.syncDocument();

    const client2Nodes = (
      client2.getDocument() as DocumentDrive.DocumentDriveDocument
    ).state.global.nodes;

    // TODO: validate that there are not duplicated operations after operation id implementation
    expect(client2Nodes).toHaveLength(8);

    const sortedClient2Nodes = sortNodes(client2Nodes);
    expect(sortedClient2Nodes).toMatchObject([
      { id: "1", name: "1", parentFolder: null },
      { id: "2", name: "2", parentFolder: "1" },
      { id: "3", name: "1 (copy) 1", parentFolder: null },
      { id: "4", name: "2", parentFolder: "3" },
      { id: "5", name: "1 (copy) 2", parentFolder: null },
      { id: "6", name: "2", parentFolder: "5" },
      { id: "7", name: "1 (copy) 3", parentFolder: null },
      { id: "8", name: "2", parentFolder: "7" },
    ]);
  });
});

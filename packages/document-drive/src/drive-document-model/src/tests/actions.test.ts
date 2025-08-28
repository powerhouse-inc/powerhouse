import {
  addFolder,
  copyNode,
  createDocument,
  moveNode,
  driveDocumentReducer,
} from "document-drive";
import { generateId } from "document-model";
import { beforeEach, describe, expect, it } from "vitest";

describe("DocumentDrive Actions", () => {
  let documentDrive = createDocument();

  const folder1Id = generateId();
  const folder1_1Id = generateId();
  const folder1_1_1Id = generateId();
  const folder2Id = generateId();
  const folder3Id = generateId();

  beforeEach(() => {
    documentDrive = createDocument();

    documentDrive = driveDocumentReducer(
      documentDrive,
      addFolder({
        id: folder1Id,
        name: "Folder 1",
      }),
    );

    documentDrive = driveDocumentReducer(
      documentDrive,
      addFolder({
        id: folder1_1Id,
        name: "Folder 1.1",
        parentFolder: folder1Id,
      }),
    );

    documentDrive = driveDocumentReducer(
      documentDrive,
      addFolder({
        id: folder1_1_1Id,
        name: "Folder 1.1.1",
        parentFolder: folder1_1Id,
      }),
    );

    documentDrive = driveDocumentReducer(
      documentDrive,
      addFolder({
        id: folder2Id,
        name: "Folder 2",
      }),
    );

    documentDrive = driveDocumentReducer(
      documentDrive,
      addFolder({
        id: folder3Id,
        name: "Folder 3",
      }),
    );
  });

  describe("moveNode", () => {
    it("should move a node to a different parent", () => {
      const srcFolder = folder1_1Id;
      const targetParentFolder = folder2Id;

      documentDrive = driveDocumentReducer(
        documentDrive,
        moveNode({
          srcFolder,
          targetParentFolder,
        }),
      );

      const movedNode = documentDrive.state.global.nodes.find(
        (node: any) => node.id === srcFolder,
      );

      expect(movedNode?.parentFolder).toBe(targetParentFolder);
    });

    it("should move a node to the root of the drive when parentFolder is not provided", () => {
      const srcFolder = folder1_1Id;

      documentDrive = driveDocumentReducer(
        documentDrive,
        moveNode({
          srcFolder,
        }),
      );

      const movedNode = documentDrive.state.global.nodes.find(
        (node: any) => node.id === srcFolder,
      );

      expect(movedNode?.parentFolder).toBe(null);
    });

    it("should move a node to the root of the drive when parentFolder is null", () => {
      const srcFolder = folder1_1Id;

      documentDrive = driveDocumentReducer(
        documentDrive,
        moveNode({
          srcFolder,
          targetParentFolder: null,
        }),
      );

      const movedNode = documentDrive.state.global.nodes.find(
        (node: any) => node.id === srcFolder,
      );

      expect(movedNode?.parentFolder).toBe(null);
    });

    it("should throw an error when the srcFolder node does not exist", () => {
      const srcFolder = "invalid";
      const targetParentFolder = folder2Id;

      const document = driveDocumentReducer(
        documentDrive,
        moveNode({
          srcFolder,
          targetParentFolder,
        }),
      );

      expect(document.operations.global).toHaveLength(6);
      expect(document.operations.global[5]).toMatchObject({
        type: "MOVE_NODE",
        input: { srcFolder: "invalid", targetParentFolder: folder2Id },
        scope: "global",
        index: 5,
        skip: 0,
        error: "Node with id invalid not found",
      });

      expect(document.operations.global[5].hash).toBe(
        document.operations.global[4].hash,
      );
    });
  });

  describe("copyNode", () => {
    it("should copy a node to a different parent", () => {
      const srcId = folder1_1Id;
      const targetId = folder1_1Id + "-copy";
      const targetParentFolder = folder2Id;
      const initialNodesLength = documentDrive.state.global.nodes.length;

      documentDrive = driveDocumentReducer(
        documentDrive,
        copyNode({
          srcId,
          targetId,
          targetParentFolder,
        }),
      );

      const copiedNode = documentDrive.state.global.nodes.find(
        (node: any) => node.id === targetId,
      );

      expect(documentDrive.state.global.nodes.length).toBe(
        initialNodesLength + 1,
      );
      expect(copiedNode?.parentFolder).toBe(targetParentFolder);
    });

    it("should copy a node to the root of the drive when parentFolder is not provided", () => {
      const srcId = folder1_1Id;
      const targetId = folder1_1Id + "-copy";
      const initialNodesLength = documentDrive.state.global.nodes.length;

      documentDrive = driveDocumentReducer(
        documentDrive,
        copyNode({
          srcId,
          targetId,
        }),
      );

      const copiedNode = documentDrive.state.global.nodes.find(
        (node: any) => node.id === targetId,
      );

      expect(documentDrive.state.global.nodes.length).toBe(
        initialNodesLength + 1,
      );
      expect(copiedNode?.parentFolder).toBe(null);
    });

    it("should copy a node to the root of the drive when parentFolder is null", () => {
      const srcId = folder1_1Id;
      const targetId = folder1_1Id + "-copy";
      const initialNodesLength = documentDrive.state.global.nodes.length;

      documentDrive = driveDocumentReducer(
        documentDrive,
        copyNode({
          srcId,
          targetId,
          targetParentFolder: null,
        }),
      );

      const copiedNode = documentDrive.state.global.nodes.find(
        (node: any) => node.id === targetId,
      );

      expect(documentDrive.state.global.nodes.length).toBe(
        initialNodesLength + 1,
      );
      expect(copiedNode?.parentFolder).toBe(null);
    });

    it("should throw an error when the srcId node does not exist", () => {
      const srcId = "invalid";
      const targetId = folder1_1Id + "-copy";
      const targetParentFolder = folder2Id;

      const document = driveDocumentReducer(
        documentDrive,
        copyNode({
          srcId,
          targetId,
          targetParentFolder,
        }),
      );

      expect(document.operations.global).toHaveLength(6);
      expect(document.operations.global[5]).toMatchObject({
        type: "COPY_NODE",
        input: {
          srcId: "invalid",
          targetId: folder1_1Id + "-copy",
          targetParentFolder: folder2Id,
        },
        scope: "global",
        index: 5,
        skip: 0,
        error: "Node with id invalid not found",
      });

      expect(document.operations.global[5].hash).toBe(
        document.operations.global[4].hash,
      );
    });

    it("should copy a node when a new name when targetName is provided", () => {
      const srcId = folder1_1Id;
      const targetId = folder1_1Id + "-copy";
      const targetName = "New Name";
      const targetParentFolder = folder2Id;
      const initialNodesLength = documentDrive.state.global.nodes.length;

      documentDrive = driveDocumentReducer(
        documentDrive,
        copyNode({
          srcId,
          targetId,
          targetName,
          targetParentFolder,
        }),
      );

      const copiedNode = documentDrive.state.global.nodes.find(
        (node: any) => node.id === targetId,
      );

      expect(documentDrive.state.global.nodes.length).toBe(
        initialNodesLength + 1,
      );
      expect(copiedNode?.name).toBe(targetName);
      expect(copiedNode?.parentFolder).toBe(targetParentFolder);
    });

    it("should copy a node with src name if targetName is not provided", () => {
      const srcId = folder1_1Id;
      const targetId = folder1_1Id + "-copy";
      const targetParentFolder = folder2Id;
      const initialNodesLength = documentDrive.state.global.nodes.length;

      documentDrive = driveDocumentReducer(
        documentDrive,
        copyNode({
          srcId,
          targetId,
          targetParentFolder,
        }),
      );

      const copiedNode = documentDrive.state.global.nodes.find(
        (node: any) => node.id === targetId,
      );

      expect(documentDrive.state.global.nodes.length).toBe(
        initialNodesLength + 1,
      );
      expect(copiedNode?.name).toBe("Folder 1.1");
      expect(copiedNode?.parentFolder).toBe(targetParentFolder);
    });

    it("should copy a node with src name if targetName is null", () => {
      const srcId = folder1_1Id;
      const targetId = folder1_1Id + "-copy";
      const targetParentFolder = folder2Id;
      const initialNodesLength = documentDrive.state.global.nodes.length;

      documentDrive = driveDocumentReducer(
        documentDrive,
        copyNode({
          srcId,
          targetId,
          targetName: null,
          targetParentFolder,
        }),
      );

      const copiedNode = documentDrive.state.global.nodes.find(
        (node: any) => node.id === targetId,
      );

      expect(documentDrive.state.global.nodes.length).toBe(
        initialNodesLength + 1,
      );
      expect(copiedNode?.name).toBe("Folder 1.1");
      expect(copiedNode?.parentFolder).toBe(targetParentFolder);
    });
  });
});

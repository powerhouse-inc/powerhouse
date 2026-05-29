/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import {
  addFile,
  addFolder,
  copyNode,
  deleteNode,
  moveNode,
  updateFile,
  updateNode,
} from "../../gen/node/creators.js";
import { driveDocumentReducer } from "../../gen/reducer.js";
import {
  AddFileInputSchema,
  AddFolderInputSchema,
  CopyNodeInputSchema,
  DeleteNodeInputSchema,
  FileNodeSchema,
  MoveNodeInputSchema,
  NodeSchema,
  UpdateFileInputSchema,
  UpdateNodeInputSchema,
} from "../../gen/schema/zod.js";
import { driveCreateDocument } from "../../gen/utils.js";
import { beforeEach, describe, expect, it } from "vitest";
import { generateMock } from "./generate-mock.js";
import { createDocumentWithNodes } from "./test-factories.js";

describe("Node Operations", () => {
  let document: DocumentDriveDocument;

  beforeEach(() => {
    document = driveCreateDocument();
  });

  it("should handle addFile operation", () => {
    const input = generateMock(AddFileInputSchema());
    const updatedDocument = driveDocumentReducer(document, addFile(input));

    expect(updatedDocument.operations.global!).toHaveLength(1);
    expect(updatedDocument.operations.global![0].action.type).toBe("ADD_FILE");
    expect(updatedDocument.operations.global![0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global![0].index).toEqual(0);
  });
  // SKIP: documents a known bug — ADD_FILE silently drops the node when the
  // name contains a non-ASCII character because isValidName (src/utils.ts) only
  // permits ASCII URL characters. Un-skip once isValidName allows Unicode.
  it.skip("should add a file node when the name contains a non-ASCII character (em-dash)", () => {
    const input = generateMock(AddFileInputSchema());
    // Em-dash U+2014, common in human-authored titles.
    input.name = "Concord v1 — delivery plan";

    const updatedDocument = driveDocumentReducer(document, addFile(input));

    // The operation must succeed without recording an error.
    expect(updatedDocument.operations.global![0].error).toBeUndefined();

    // The node must be present in the projected state with the given name.
    const node = updatedDocument.state.global.nodes.find(
      (n) => n.id === input.id,
    );
    expect(node).toBeDefined();
    expect(node!.name).toBe("Concord v1 — delivery plan");
  });
  it("should prevent name collisions in addFile operation when parent is a folder", () => {
    const firstInput = generateMock(AddFileInputSchema());
    const secondInput = generateMock(AddFileInputSchema());
    const thirdInput = generateMock(AddFileInputSchema());
    firstInput.name = "test";
    secondInput.name = "test";
    thirdInput.name = "test (copy) 1";
    secondInput.parentFolder = firstInput.parentFolder;
    thirdInput.parentFolder = firstInput.parentFolder;
    // Nodes are sorted by id; assign ids matching the expected order so the
    // positional assertions below are deterministic (secondInput is inserted
    // first and keeps "test", firstInput becomes "test (copy) 1", etc.).
    secondInput.id = "node-1";
    firstInput.id = "node-2";
    thirdInput.id = "node-3";
    const updatedDocument = driveDocumentReducer(
      document,
      addFile(secondInput),
    );
    const secondUpdatedDocument = driveDocumentReducer(
      updatedDocument,
      addFile(firstInput),
    );
    const thirdUpdatedDocument = driveDocumentReducer(
      secondUpdatedDocument,
      addFile(thirdInput),
    );
    const nodeNames = thirdUpdatedDocument.state.global.nodes.map(
      (node) => node.name,
    );
    expect(new Set(nodeNames).size).toBe(nodeNames.length);
    expect(nodeNames[0]).toBe("test");
    expect(nodeNames[1]).toBe("test (copy) 1");
    expect(nodeNames[2]).toBe("test (copy) 1 (copy) 1");
  });
  it("should prevent name collisions in addFile operation when parent is a drive", () => {
    const firstInput = generateMock(AddFileInputSchema());
    const secondInput = generateMock(AddFileInputSchema());
    const thirdInput = generateMock(AddFileInputSchema());
    firstInput.name = "test";
    secondInput.name = "test";
    thirdInput.name = "test (copy) 1";
    firstInput.parentFolder = null;
    secondInput.parentFolder = null;
    thirdInput.parentFolder = null;
    // Nodes are sorted by id; assign ids matching insertion/expected order.
    secondInput.id = "node-1";
    firstInput.id = "node-2";
    thirdInput.id = "node-3";
    const updatedDocument = driveDocumentReducer(
      document,
      addFile(secondInput),
    );
    const secondUpdatedDocument = driveDocumentReducer(
      updatedDocument,
      addFile(firstInput),
    );
    const thirdUpdatedDocument = driveDocumentReducer(
      secondUpdatedDocument,
      addFile(thirdInput),
    );
    const nodeNames = thirdUpdatedDocument.state.global.nodes.map(
      (node) => node.name,
    );
    expect(new Set(nodeNames).size).toBe(nodeNames.length);
    expect(nodeNames[0]).toBe("test");
    expect(nodeNames[1]).toBe("test (copy) 1");
    expect(nodeNames[2]).toBe("test (copy) 1 (copy) 1");
  });
  it("should handle addFolder operation", () => {
    const input = generateMock(AddFolderInputSchema());
    const updatedDocument = driveDocumentReducer(document, addFolder(input));

    expect(updatedDocument.operations.global!).toHaveLength(1);
    expect(updatedDocument.operations.global![0].action.type).toBe(
      "ADD_FOLDER",
    );
    expect(updatedDocument.operations.global![0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global![0].index).toEqual(0);
  });
  it("should prevent name collisions in addFolder operation when parent is a folder", () => {
    const firstInput = generateMock(AddFolderInputSchema());
    const secondInput = generateMock(AddFolderInputSchema());
    const thirdInput = generateMock(AddFolderInputSchema());
    firstInput.name = "test";
    secondInput.name = "test";
    thirdInput.name = "test (copy) 1";
    secondInput.parentFolder = firstInput.parentFolder;
    thirdInput.parentFolder = firstInput.parentFolder;
    // Nodes are sorted by id; assign ids matching insertion/expected order.
    secondInput.id = "node-1";
    firstInput.id = "node-2";
    thirdInput.id = "node-3";
    const updatedDocument = driveDocumentReducer(
      document,
      addFolder(secondInput),
    );
    const secondUpdatedDocument = driveDocumentReducer(
      updatedDocument,
      addFolder(firstInput),
    );
    const thirdUpdatedDocument = driveDocumentReducer(
      secondUpdatedDocument,
      addFolder(thirdInput),
    );
    const nodeNames = thirdUpdatedDocument.state.global.nodes.map(
      (node) => node.name,
    );
    expect(new Set(nodeNames).size).toBe(nodeNames.length);
    expect(nodeNames[0]).toBe("test");
    expect(nodeNames[1]).toBe("test (copy) 1");
    expect(nodeNames[2]).toBe("test (copy) 1 (copy) 1");
  });

  it("should prevent name collisions in addFolder operation when parent is a drive", () => {
    const firstInput = generateMock(AddFolderInputSchema());
    const secondInput = generateMock(AddFolderInputSchema());
    const thirdInput = generateMock(AddFolderInputSchema());
    firstInput.name = "test";
    secondInput.name = "test";
    thirdInput.name = "test (copy) 1";
    firstInput.parentFolder = null;
    secondInput.parentFolder = null;
    thirdInput.parentFolder = null;
    // Nodes are sorted by id; assign ids matching insertion/expected order.
    secondInput.id = "node-1";
    firstInput.id = "node-2";
    thirdInput.id = "node-3";
    const updatedDocument = driveDocumentReducer(
      document,
      addFolder(secondInput),
    );
    const secondUpdatedDocument = driveDocumentReducer(
      updatedDocument,
      addFolder(firstInput),
    );
    const thirdUpdatedDocument = driveDocumentReducer(
      secondUpdatedDocument,
      addFolder(thirdInput),
    );
    const nodeNames = thirdUpdatedDocument.state.global.nodes.map(
      (node) => node.name,
    );
    expect(new Set(nodeNames).size).toBe(nodeNames.length);
    expect(nodeNames[0]).toBe("test");
    expect(nodeNames[1]).toBe("test (copy) 1");
    expect(nodeNames[2]).toBe("test (copy) 1 (copy) 1");
  });

  it("should handle deleteNode operation", () => {
    const input = generateMock(DeleteNodeInputSchema());
    const document = createDocumentWithNodes([input]);
    const updatedDocument = driveDocumentReducer(document, deleteNode(input));

    expect(updatedDocument.operations.global!).toHaveLength(1);
    expect(updatedDocument.operations.global![0].action.type).toBe(
      "DELETE_NODE",
    );
    expect(updatedDocument.operations.global![0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global![0].index).toEqual(0);
  });

  it("should handle updateFile operation", () => {
    const input = generateMock(UpdateFileInputSchema());
    const updatedDocument = driveDocumentReducer(document, updateFile(input));

    expect(updatedDocument.operations.global!).toHaveLength(1);
    expect(updatedDocument.operations.global![0].action.type).toBe(
      "UPDATE_FILE",
    );
    expect(updatedDocument.operations.global![0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global![0].index).toEqual(0);
  });
  it("should handle name collisions in updateFile operation", () => {
    const existingFile1 = generateMock(FileNodeSchema());
    existingFile1.kind = "file";
    existingFile1.id = "node-1";
    const existingFile2 = generateMock(FileNodeSchema());
    existingFile2.kind = "file";
    existingFile2.id = "node-2";
    existingFile2.parentFolder = existingFile1.parentFolder;
    const input = generateMock(UpdateFileInputSchema());
    input.id = existingFile2.id;
    input.name = existingFile1.name;
    input.parentFolder = existingFile1.parentFolder;
    document.state.global.nodes = [existingFile1, existingFile2];
    const updatedDocument = driveDocumentReducer(document, updateFile(input));

    const nodeNames = updatedDocument.state.global.nodes.map(
      (node) => node.name,
    );
    expect(new Set(nodeNames).size).toBe(nodeNames.length);
    expect(nodeNames[0]).toBe(existingFile1.name);
    expect(nodeNames[1]).toBe(input.name + " (copy) 1");
  });
  it("should handle updateNode operation", () => {
    const input = generateMock(UpdateNodeInputSchema());
    const updatedDocument = driveDocumentReducer(document, updateNode(input));

    expect(updatedDocument.operations.global!).toHaveLength(1);
    expect(updatedDocument.operations.global![0].action.type).toBe(
      "UPDATE_NODE",
    );
    expect(updatedDocument.operations.global![0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global![0].index).toEqual(0);
  });
  it("should handle name collisions in updateNode operation", () => {
    const existingNode1 = generateMock(NodeSchema());
    existingNode1.kind = "file";
    existingNode1.id = "node-1";
    const existingNode2 = generateMock(NodeSchema());
    existingNode2.kind = "file";
    existingNode2.id = "node-2";
    existingNode2.parentFolder = existingNode1.parentFolder;
    const input = generateMock(UpdateNodeInputSchema());
    input.id = existingNode2.id;
    input.name = existingNode1.name;
    input.parentFolder = existingNode1.parentFolder;
    document.state.global.nodes = [existingNode1, existingNode2];
    const updatedDocument = driveDocumentReducer(document, updateNode(input));

    const nodeNames = updatedDocument.state.global.nodes.map(
      (node) => node.name,
    );
    expect(new Set(nodeNames).size).toBe(nodeNames.length);
    expect(nodeNames[0]).toBe(existingNode1.name);
    expect(nodeNames[1]).toBe(input.name + " (copy) 1");
  });
  it("should not add (copy) when renaming a node to its current name", () => {
    const existingNode = generateMock(NodeSchema());
    existingNode.name = "budget";
    existingNode.parentFolder = null;
    document.state.global.nodes = [existingNode];
    const input = generateMock(UpdateNodeInputSchema());
    input.id = existingNode.id;
    input.name = "budget";
    const updatedDocument = driveDocumentReducer(document, updateNode(input));

    const node = updatedDocument.state.global.nodes.find(
      (n) => n.id === existingNode.id,
    );
    expect(node?.name).toBe("budget");
  });
  it("should not add (copy) when renaming a copied node to a unique name", () => {
    const original = generateMock(NodeSchema());
    original.name = "budget";
    original.parentFolder = null;
    const copy = generateMock(NodeSchema());
    copy.name = "budget (copy) 1";
    copy.parentFolder = null;
    document.state.global.nodes = [original, copy];

    const input = generateMock(UpdateNodeInputSchema());
    input.id = copy.id;
    input.name = "my-budget";
    const updatedDocument = driveDocumentReducer(document, updateNode(input));

    const node = updatedDocument.state.global.nodes.find(
      (n) => n.id === copy.id,
    );
    expect(node?.name).toBe("my-budget");
  });
  it("should not add (copy) when the same rename is applied twice (double dispatch)", () => {
    const original = generateMock(NodeSchema());
    original.name = "budget";
    original.parentFolder = null;
    const copy = generateMock(NodeSchema());
    copy.name = "budget (copy) 1";
    copy.parentFolder = null;
    document.state.global.nodes = [original, copy];

    const input = generateMock(UpdateNodeInputSchema());
    input.id = copy.id;
    input.name = "my-budget";

    // First rename
    const firstUpdate = driveDocumentReducer(document, updateNode(input));
    // Second rename with same name (simulates double dispatch from UI)
    const secondUpdate = driveDocumentReducer(firstUpdate, updateNode(input));

    const node = secondUpdate.state.global.nodes.find((n) => n.id === copy.id);
    expect(node?.name).toBe("my-budget");
  });
  it("should use node parentFolder for collision check when parentFolder not in action", () => {
    const folderNode = generateMock(NodeSchema());
    folderNode.id = "folder-1";
    folderNode.kind = "folder";
    folderNode.parentFolder = null;
    folderNode.name = "reports";

    const fileInFolder = generateMock(NodeSchema());
    fileInFolder.name = "budget";
    fileInFolder.parentFolder = "folder-1";

    const rootFile = generateMock(NodeSchema());
    rootFile.name = "my-doc";
    rootFile.parentFolder = null;

    document.state.global.nodes = [folderNode, fileInFolder, rootFile];

    // Rename file in subfolder — should check siblings in subfolder, not root
    const input = generateMock(UpdateNodeInputSchema());
    input.id = fileInFolder.id;
    input.name = "my-doc"; // Same name as root file, but in different folder

    const updatedDocument = driveDocumentReducer(document, updateNode(input));
    const node = updatedDocument.state.global.nodes.find(
      (n) => n.id === fileInFolder.id,
    );
    // Should NOT collide because the file is in a subfolder, not at root
    expect(node?.name).toBe("my-doc");
  });
  it("should handle copyNode operation", () => {
    const input = generateMock(CopyNodeInputSchema());
    const document = createDocumentWithNodes([
      {
        id: input.srcId,
        name: "Node 1",
      },
      {
        id: input.targetId,
        name: "Node 2",
      },
    ]);
    const updatedDocument = driveDocumentReducer(document, copyNode(input));

    expect(updatedDocument.operations.global!).toHaveLength(1);
    expect(updatedDocument.operations.global![0].action.type).toBe("COPY_NODE");
    expect(updatedDocument.operations.global![0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global![0].index).toEqual(0);
  });
  it("should handle duplicated id when copy a node", () => {
    const input = generateMock(CopyNodeInputSchema());
    const document = createDocumentWithNodes([
      {
        id: "1",
        name: "Node 1",
      },
      {
        id: "2",
        name: "Node 2",
      },
    ]);

    const updatedDocument = driveDocumentReducer(
      document,
      copyNode({
        ...input,
        srcId: "1",
        targetId: "1",
      }),
    );

    expect(updatedDocument.state.global.nodes).toMatchObject([
      { id: "1", name: "Node 1" },
      { id: "2", name: "Node 2" },
    ]);

    expect(updatedDocument.operations.global!).toHaveLength(1);
    expect(updatedDocument.operations.global![0]).toMatchObject({
      index: 0,
      skip: 0,
      type: "COPY_NODE",
      error: "Node with id 1 already exists",
    });
  });
  it("should handle name collisions in copyNode operation", () => {
    const existingNode = generateMock(NodeSchema());
    existingNode.kind = "file";
    existingNode.id = "node-1";
    const input = generateMock(CopyNodeInputSchema());
    input.srcId = existingNode.id;
    input.targetId = "node-2";
    input.targetName = existingNode.name;
    input.targetParentFolder = existingNode.parentFolder;
    document.state.global.nodes = [existingNode];
    const updatedDocument = driveDocumentReducer(document, copyNode(input));

    const nodeNames = updatedDocument.state.global.nodes.map(
      (node) => node.name,
    );
    expect(new Set(nodeNames).size).toBe(nodeNames.length);
    expect(nodeNames[0]).toBe(existingNode.name);
    expect(nodeNames[1]).toBe(input.targetName + " (copy) 1");
  });
  it("should handle name collisions in copyNode operation when parent is drive", () => {
    const existingNode = generateMock(NodeSchema());
    existingNode.kind = "file";
    existingNode.id = "node-1";
    const input = generateMock(CopyNodeInputSchema());
    existingNode.parentFolder = null;
    input.srcId = existingNode.id;
    input.targetId = "node-2";
    input.targetName = existingNode.name;
    input.targetParentFolder = null;
    document.state.global.nodes = [existingNode];
    const updatedDocument = driveDocumentReducer(document, copyNode(input));

    const nodeNames = updatedDocument.state.global.nodes.map(
      (node) => node.name,
    );
    expect(new Set(nodeNames).size).toBe(nodeNames.length);
    expect(nodeNames[0]).toBe(existingNode.name);
    expect(nodeNames[1]).toBe(input.targetName + " (copy) 1");
  });
  it("should handle name collisions in copyNode operation", () => {
    const existingNode = generateMock(NodeSchema());
    existingNode.kind = "file";
    existingNode.id = "node-1";
    const input = generateMock(CopyNodeInputSchema());
    input.srcId = existingNode.id;
    input.targetId = "node-2";
    input.targetName = existingNode.name;
    input.targetParentFolder = existingNode.parentFolder;
    document.state.global.nodes = [existingNode];
    const updatedDocument = driveDocumentReducer(document, copyNode(input));

    const nodeNames = updatedDocument.state.global.nodes.map(
      (node) => node.name,
    );
    expect(new Set(nodeNames).size).toBe(nodeNames.length);
    expect(nodeNames[0]).toBe(existingNode.name);
    expect(nodeNames[1]).toBe(input.targetName + " (copy) 1");
  });
  it("should handle moveNode operation", () => {
    const input = generateMock(MoveNodeInputSchema());
    const document = createDocumentWithNodes([
      {
        id: input.srcFolder,
        name: "Node 1",
      },
      {
        id: input.targetParentFolder ?? undefined,
        name: "Node 2",
      },
    ]);
    const updatedDocument = driveDocumentReducer(document, moveNode(input));

    expect(updatedDocument.operations.global!).toHaveLength(1);
    expect(updatedDocument.operations.global![0].action.type).toBe("MOVE_NODE");
    expect(updatedDocument.operations.global![0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global![0].index).toEqual(0);
  });
  it("should handle name collisions in moveNode operation", () => {
    const existingNode = generateMock(NodeSchema());
    existingNode.name = "test";
    existingNode.kind = "file";
    existingNode.id = "node-1";
    const existingNode2 = generateMock(NodeSchema());
    existingNode2.name = "test";
    existingNode2.kind = "file";
    existingNode2.id = "node-2";
    const input = generateMock(MoveNodeInputSchema());
    input.srcFolder = existingNode2.id;
    input.targetParentFolder = existingNode.parentFolder;
    document.state.global.nodes = [existingNode, existingNode2];
    const updatedDocument = driveDocumentReducer(document, moveNode(input));

    const nodeNames = updatedDocument.state.global.nodes.map(
      (node) => node.name,
    );
    expect(new Set(nodeNames).size).toBe(nodeNames.length);
    expect(nodeNames[0]).toBe("test");
    expect(nodeNames[1]).toBe("test (copy) 1");
  });
  it("should handle name collisions in moveNode operation when parent is drive", () => {
    const existingNode = generateMock(NodeSchema());
    existingNode.name = "test";
    existingNode.parentFolder = null;
    existingNode.kind = "file";
    existingNode.id = "node-1";
    const existingNode2 = generateMock(NodeSchema());
    existingNode2.name = "test";
    existingNode2.kind = "file";
    existingNode2.id = "node-2";
    const input = generateMock(MoveNodeInputSchema());
    input.srcFolder = existingNode2.id;
    input.targetParentFolder = null;
    document.state.global.nodes = [existingNode, existingNode2];
    const updatedDocument = driveDocumentReducer(document, moveNode(input));

    const nodeNames = updatedDocument.state.global.nodes.map(
      (node) => node.name,
    );
    expect(new Set(nodeNames).size).toBe(nodeNames.length);
    expect(nodeNames[0]).toBe("test");
    expect(nodeNames[1]).toBe("test (copy) 1");
  });
  it("should not allow moving folder to descendent", () => {
    // Mock data setup
    const nodes = [
      { id: "1", parentFolder: null, kind: "folder", name: "Root" },
      { id: "2", parentFolder: "1", kind: "folder", name: "Child" },
      { id: "3", parentFolder: "2", kind: "folder", name: "Subchild" },
    ];

    document.state.global.nodes = nodes;

    // move folder to descendent
    const updatedDocument = driveDocumentReducer(
      document,
      moveNode({
        srcFolder: "1",
        targetParentFolder: "3",
      }),
    );

    expect(updatedDocument.state.global.nodes).toMatchObject(nodes);
    expect(updatedDocument.operations.global!).toHaveLength(1);
    expect(updatedDocument.operations.global![0]).toMatchObject({
      type: "MOVE_NODE",
      input: { srcFolder: "1", targetParentFolder: "3" },
      scope: "global",
      index: 0,
      skip: 0,
      error:
        "Circular Reference Error: Cannot move a folder to one of its descendants",
    });
  });
  it("should not allow making folder its own parent", () => {
    // Mock data setup
    const nodes = [
      { id: "1", parentFolder: null, kind: "folder", name: "Root" },
      { id: "2", parentFolder: "1", kind: "folder", name: "Child" },
      { id: "3", parentFolder: "2", kind: "folder", name: "Subchild" },
    ];

    document.state.global.nodes = nodes;

    const updatedDocument = driveDocumentReducer(
      document,
      moveNode({
        srcFolder: "1",
        targetParentFolder: "1",
      }),
    );

    expect(updatedDocument.state.global.nodes).toMatchObject(nodes);
    expect(updatedDocument.operations.global!).toHaveLength(1);
    expect(updatedDocument.operations.global![0]).toMatchObject({
      type: "MOVE_NODE",
      input: { srcFolder: "1", targetParentFolder: "1" },
      scope: "global",
      index: 0,
      skip: 0,
      error:
        "Circular Reference Error: Attempting to move a node to its current parent folder",
    });
  });

  it("should allow a file and folder to share a name in the same parent (addFile after addFolder)", () => {
    const folderInput = generateMock(AddFolderInputSchema());
    folderInput.name = "Reports";
    folderInput.parentFolder = null;

    const fileInput = generateMock(AddFileInputSchema());
    fileInput.name = "Reports";
    fileInput.parentFolder = null;

    const afterFolder = driveDocumentReducer(document, addFolder(folderInput));
    const afterFile = driveDocumentReducer(afterFolder, addFile(fileInput));

    const folderNode = afterFile.state.global.nodes.find(
      (n) => n.id === folderInput.id,
    );
    const fileNode = afterFile.state.global.nodes.find(
      (n) => n.id === fileInput.id,
    );
    expect(folderNode?.name).toBe("Reports");
    expect(folderNode?.kind).toBe("folder");
    expect(fileNode?.name).toBe("Reports");
    expect(fileNode?.kind).toBe("file");
  });

  it("should allow a file and folder to share a name in the same parent (addFolder after addFile)", () => {
    const fileInput = generateMock(AddFileInputSchema());
    fileInput.name = "Reports";
    fileInput.parentFolder = null;

    const folderInput = generateMock(AddFolderInputSchema());
    folderInput.name = "Reports";
    folderInput.parentFolder = null;

    const afterFile = driveDocumentReducer(document, addFile(fileInput));
    const afterFolder = driveDocumentReducer(afterFile, addFolder(folderInput));

    const fileNode = afterFolder.state.global.nodes.find(
      (n) => n.id === fileInput.id,
    );
    const folderNode = afterFolder.state.global.nodes.find(
      (n) => n.id === folderInput.id,
    );
    expect(fileNode?.name).toBe("Reports");
    expect(fileNode?.kind).toBe("file");
    expect(folderNode?.name).toBe("Reports");
    expect(folderNode?.kind).toBe("folder");
  });

  it("should allow moveNode to place a file into a folder containing a same-named folder", () => {
    document.state.global.nodes = [
      { id: "destFolder", parentFolder: null, kind: "folder", name: "Inbox" },
      {
        id: "siblingFolder",
        parentFolder: "destFolder",
        kind: "folder",
        name: "Reports",
      },
      {
        id: "movingFile",
        parentFolder: null,
        kind: "file",
        name: "Reports",
        documentType: "any",
      },
    ];

    const updatedDocument = driveDocumentReducer(
      document,
      moveNode({
        srcFolder: "movingFile",
        targetParentFolder: "destFolder",
      }),
    );

    const moved = updatedDocument.state.global.nodes.find(
      (n) => n.id === "movingFile",
    );
    expect(moved?.name).toBe("Reports");
    expect(moved?.parentFolder).toBe("destFolder");
  });

  it("should allow copyNode to place a file copy alongside a same-named folder", () => {
    document.state.global.nodes = [
      {
        id: "siblingFolder",
        parentFolder: null,
        kind: "folder",
        name: "Reports",
      },
      {
        id: "srcFile",
        parentFolder: null,
        kind: "file",
        name: "Reports",
        documentType: "any",
      },
    ];

    const updatedDocument = driveDocumentReducer(
      document,
      copyNode({
        srcId: "srcFile",
        targetId: "copiedFile",
        targetName: "Reports",
        targetParentFolder: null,
      }),
    );

    const copied = updatedDocument.state.global.nodes.find(
      (n) => n.id === "copiedFile",
    );
    expect(copied?.name).toBe("Reports (copy) 1");
    expect(copied?.kind).toBe("file");
  });

  it("should still rename when adding a second file with the same name (regression)", () => {
    const firstInput = generateMock(AddFileInputSchema());
    firstInput.name = "Reports";
    firstInput.parentFolder = null;

    const secondInput = generateMock(AddFileInputSchema());
    secondInput.name = "Reports";
    secondInput.parentFolder = null;

    const afterFirst = driveDocumentReducer(document, addFile(firstInput));
    const afterSecond = driveDocumentReducer(afterFirst, addFile(secondInput));

    const first = afterSecond.state.global.nodes.find(
      (n) => n.id === firstInput.id,
    );
    const second = afterSecond.state.global.nodes.find(
      (n) => n.id === secondInput.id,
    );
    expect(first?.name).toBe("Reports");
    expect(second?.name).toBe("Reports (copy) 1");
  });
});

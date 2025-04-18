/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from "@powerhousedao/codegen";
import { beforeEach, describe, expect, it } from "vitest";
import * as creators from "../../gen/node/creators.js";
import { reducer } from "../../gen/reducer.js";
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
import { DocumentDriveDocument } from "../../gen/types.js";
import { createDocument } from "../../gen/utils.js";

describe("Node Operations", () => {
  let document: DocumentDriveDocument;

  beforeEach(() => {
    document = createDocument();
  });

  it("should handle addFile operation", () => {
    const input = generateMock(AddFileInputSchema());
    const updatedDocument = reducer(document, creators.addFile(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe("ADD_FILE");
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
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
    const updatedDocument = reducer(document, creators.addFile(secondInput));
    const secondUpdatedDocument = reducer(
      updatedDocument,
      creators.addFile(firstInput),
    );
    const thirdUpdatedDocument = reducer(
      secondUpdatedDocument,
      creators.addFile(thirdInput),
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
    const updatedDocument = reducer(document, creators.addFile(secondInput));
    const secondUpdatedDocument = reducer(
      updatedDocument,
      creators.addFile(firstInput),
    );
    const thirdUpdatedDocument = reducer(
      secondUpdatedDocument,
      creators.addFile(thirdInput),
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
    const updatedDocument = reducer(document, creators.addFolder(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe("ADD_FOLDER");
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
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
    const updatedDocument = reducer(document, creators.addFolder(secondInput));
    const secondUpdatedDocument = reducer(
      updatedDocument,
      creators.addFolder(firstInput),
    );
    const thirdUpdatedDocument = reducer(
      secondUpdatedDocument,
      creators.addFolder(thirdInput),
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
    const updatedDocument = reducer(document, creators.addFolder(secondInput));
    const secondUpdatedDocument = reducer(
      updatedDocument,
      creators.addFolder(firstInput),
    );
    const thirdUpdatedDocument = reducer(
      secondUpdatedDocument,
      creators.addFolder(thirdInput),
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
    const document = createDocument({
      state: {
        global: {
          // @ts-expect-error mock
          nodes: [input],
        },
      },
    });
    const updatedDocument = reducer(document, creators.deleteNode(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe("DELETE_NODE");
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle updateFile operation", () => {
    const input = generateMock(UpdateFileInputSchema());
    const updatedDocument = reducer(document, creators.updateFile(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe("UPDATE_FILE");
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle name collisions in updateFile operation", () => {
    const existingFile1 = generateMock(FileNodeSchema());
    const existingFile2 = generateMock(FileNodeSchema());
    existingFile2.parentFolder = existingFile1.parentFolder;
    const input = generateMock(UpdateFileInputSchema());
    input.id = existingFile2.id;
    input.name = existingFile1.name;
    input.parentFolder = existingFile1.parentFolder;
    document.state.global.nodes = [existingFile1, existingFile2];
    const updatedDocument = reducer(document, creators.updateFile(input));

    const nodeNames = updatedDocument.state.global.nodes.map(
      (node) => node.name,
    );
    expect(new Set(nodeNames).size).toBe(nodeNames.length);
    expect(nodeNames[0]).toBe(existingFile1.name);
    expect(nodeNames[1]).toBe(input.name + " (copy) 1");
  });
  it("should handle updateNode operation", () => {
    const input = generateMock(UpdateNodeInputSchema());
    const updatedDocument = reducer(document, creators.updateNode(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe("UPDATE_NODE");
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle name collisions in updateNode operation", () => {
    const existingNode1 = generateMock(NodeSchema());
    const existingNode2 = generateMock(NodeSchema());
    existingNode2.parentFolder = existingNode1.parentFolder;
    const input = generateMock(UpdateNodeInputSchema());
    input.id = existingNode2.id;
    input.name = existingNode1.name;
    input.parentFolder = existingNode1.parentFolder;
    document.state.global.nodes = [existingNode1, existingNode2];
    const updatedDocument = reducer(document, creators.updateNode(input));

    const nodeNames = updatedDocument.state.global.nodes.map(
      (node) => node.name,
    );
    expect(new Set(nodeNames).size).toBe(nodeNames.length);
    expect(nodeNames[0]).toBe(existingNode1.name);
    expect(nodeNames[1]).toBe(input.name + " (copy) 1");
  });
  it("should handle copyNode operation", () => {
    const input = generateMock(CopyNodeInputSchema());
    const document = createDocument({
      state: {
        global: {
          nodes: [
            // @ts-expect-error mock
            {
              id: input.srcId,
              name: "Node 1",
            },
            // @ts-expect-error mock
            {
              id: input.targetId,
              name: "Node 2",
            },
          ],
        },
      },
    });
    const updatedDocument = reducer(document, creators.copyNode(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe("COPY_NODE");
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle duplicated id when copy a node", () => {
    const input = generateMock(CopyNodeInputSchema());
    const document = createDocument({
      state: {
        global: {
          nodes: [
            // @ts-expect-error mock
            {
              id: "1",
              name: "Node 1",
            },
            // @ts-expect-error mock
            {
              id: "2",
              name: "Node 2",
            },
          ],
        },
      },
    });

    const updatedDocument = reducer(
      document,
      creators.copyNode({
        ...input,
        srcId: "1",
        targetId: "1",
      }),
    );

    expect(updatedDocument.state.global.nodes).toMatchObject([
      { id: "1", name: "Node 1" },
      { id: "2", name: "Node 2" },
    ]);

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0]).toMatchObject({
      index: 0,
      skip: 0,
      type: "COPY_NODE",
      error: "Node with id 1 already exists",
    });
  });
  it("should handle name collisions in copyNode operation", () => {
    const existingNode = generateMock(NodeSchema());
    const input = generateMock(CopyNodeInputSchema());
    input.srcId = existingNode.id;
    input.targetName = existingNode.name;
    input.targetParentFolder = existingNode.parentFolder;
    document.state.global.nodes = [existingNode];
    const updatedDocument = reducer(document, creators.copyNode(input));

    const nodeNames = updatedDocument.state.global.nodes.map(
      (node) => node.name,
    );
    expect(new Set(nodeNames).size).toBe(nodeNames.length);
    expect(nodeNames[0]).toBe(existingNode.name);
    expect(nodeNames[1]).toBe(input.targetName + " (copy) 1");
  });
  it("should handle name collisions in copyNode operation when parent is drive", () => {
    const existingNode = generateMock(NodeSchema());
    const input = generateMock(CopyNodeInputSchema());
    existingNode.parentFolder = null;
    input.srcId = existingNode.id;
    input.targetName = existingNode.name;
    input.targetParentFolder = null;
    document.state.global.nodes = [existingNode];
    const updatedDocument = reducer(document, creators.copyNode(input));

    const nodeNames = updatedDocument.state.global.nodes.map(
      (node) => node.name,
    );
    expect(new Set(nodeNames).size).toBe(nodeNames.length);
    expect(nodeNames[0]).toBe(existingNode.name);
    expect(nodeNames[1]).toBe(input.targetName + " (copy) 1");
  });
  it("should handle name collisions in copyNode operation", () => {
    const existingNode = generateMock(NodeSchema());
    const input = generateMock(CopyNodeInputSchema());
    input.srcId = existingNode.id;
    input.targetName = existingNode.name;
    input.targetParentFolder = existingNode.parentFolder;
    document.state.global.nodes = [existingNode];
    const updatedDocument = reducer(document, creators.copyNode(input));

    const nodeNames = updatedDocument.state.global.nodes.map(
      (node) => node.name,
    );
    expect(new Set(nodeNames).size).toBe(nodeNames.length);
    expect(nodeNames[0]).toBe(existingNode.name);
    expect(nodeNames[1]).toBe(input.targetName + " (copy) 1");
  });
  it("should handle moveNode operation", () => {
    const input = generateMock(MoveNodeInputSchema());
    const document = createDocument({
      state: {
        global: {
          nodes: [
            // @ts-expect-error mock
            {
              id: input.srcFolder,
              name: "Node 1",
            },
            {
              // @ts-expect-error mock
              id: input.targetParentFolder,
              name: "Node 2",
            },
          ],
        },
      },
    });
    const updatedDocument = reducer(document, creators.moveNode(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe("MOVE_NODE");
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle name collisions in moveNode operation", () => {
    const existingNode = generateMock(NodeSchema());
    existingNode.name = "test";
    const existingNode2 = generateMock(NodeSchema());
    existingNode2.name = "test";
    const input = generateMock(MoveNodeInputSchema());
    input.srcFolder = existingNode2.id;
    input.targetParentFolder = existingNode.parentFolder;
    document.state.global.nodes = [existingNode, existingNode2];
    const updatedDocument = reducer(document, creators.moveNode(input));

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
    const existingNode2 = generateMock(NodeSchema());
    existingNode2.name = "test";
    const input = generateMock(MoveNodeInputSchema());
    input.srcFolder = existingNode2.id;
    input.targetParentFolder = null;
    document.state.global.nodes = [existingNode, existingNode2];
    const updatedDocument = reducer(document, creators.moveNode(input));

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
    const updatedDocument = reducer(
      document,
      creators.moveNode({
        srcFolder: "1",
        targetParentFolder: "3",
      }),
    );

    expect(updatedDocument.state.global.nodes).toMatchObject(nodes);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0]).toMatchObject({
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

    const updatedDocument = reducer(
      document,
      creators.moveNode({
        srcFolder: "1",
        targetParentFolder: "1",
      }),
    );

    expect(updatedDocument.state.global.nodes).toMatchObject(nodes);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0]).toMatchObject({
      type: "MOVE_NODE",
      input: { srcFolder: "1", targetParentFolder: "1" },
      scope: "global",
      index: 0,
      skip: 0,
      error:
        "Circular Reference Error: Attempting to move a node to its current parent folder",
    });
  });
});

/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import type { FileNode } from "../../gen/schema/types.js";
import type { DocumentDriveNodeOperations } from "../../gen/node/actions.js";
import {
  getDescendants,
  handleTargetNameCollisions,
  insertNodeSorted,
  isFileNode,
  isFolderNode,
  isValidName,
  readNodes,
  sortNodesById,
} from "../utils.js";

export const nodeReducer: DocumentDriveNodeOperations = {
  addFileOperation(state, action, dispatch) {
    const nodes = readNodes(state);
    if (nodes.find((node) => node.id === action.input.id)) {
      throw new Error(`Node with id ${action.input.id} already exists!`);
    }

    if (!isValidName(action.input.name)) {
      throw new Error(
        `Invalid name: '${action.input.name}'. Names must not be empty or contain control characters.`,
      );
    }

    const name = handleTargetNameCollisions({
      nodes,
      srcName: action.input.name,
      srcKind: "file",
      targetParentFolder: action.input.parentFolder || null,
    });

    const fileNode: FileNode = {
      id: action.input.id,
      name,
      kind: "file",
      parentFolder: action.input.parentFolder ?? null,
      documentType: action.input.documentType,
    };
    state.nodes = insertNodeSorted(nodes, fileNode);

    dispatch?.({
      type: "CREATE_CHILD_DOCUMENT",
      input: {
        id: action.input.id,
        documentType: action.input.documentType,
      },
    });
  },
  addFolderOperation(state, action) {
    const nodes = readNodes(state);
    if (nodes.find((node) => node.id === action.input.id)) {
      throw new Error(`Node with id ${action.input.id} already exists!`);
    }

    if (!isValidName(action.input.name)) {
      throw new Error(
        `Invalid name: '${action.input.name}'. Names must not be empty or contain control characters.`,
      );
    }

    const name = handleTargetNameCollisions({
      nodes,
      srcName: action.input.name,
      srcKind: "folder",
      targetParentFolder: action.input.parentFolder || null,
    });

    state.nodes = insertNodeSorted(nodes, {
      ...action.input,
      name,
      kind: "folder",
      parentFolder: action.input.parentFolder ?? null,
    });
  },
  deleteNodeOperation(state, action, dispatch) {
    const nodes = readNodes(state);
    const node = nodes.find((node) => node.id === action.input.id);
    if (!node) {
      throw new Error(`Node with id ${action.input.id} not found`);
    }
    const descendants = getDescendants(node, nodes);
    state.nodes = sortNodesById(
      nodes.filter(
        (node) =>
          node.id !== action.input.id &&
          !descendants.find((descendant) => descendant.id === node.id),
      ),
    );

    [node, ...descendants]
      .filter((node) => isFileNode(node))
      .forEach((node) => {
        dispatch?.({
          type: "DELETE_CHILD_DOCUMENT",
          input: {
            id: node.id,
          },
        });
      });
  },
  updateFileOperation(state, action) {
    if (action.input.name && !isValidName(action.input.name)) {
      throw new Error(
        `Invalid name: '${action.input.name}'. Names must not be empty or contain control characters.`,
      );
    }

    const nodes = readNodes(state);
    state.nodes = sortNodesById(
      nodes.map((node) =>
        node.id === action.input.id
          ? {
              ...node,
              ...{
                name: handleTargetNameCollisions({
                  nodes: nodes.filter((n) => n.id !== action.input.id),
                  srcName: action.input.name ?? node.name,
                  srcKind: "file",
                  targetParentFolder:
                    action.input.parentFolder ?? node.parentFolder,
                }),
                documentType:
                  action.input.documentType ?? (node as FileNode).documentType,
              },
            }
          : node,
      ),
    );
  },
  updateNodeOperation(state, action) {
    if (action.input.name && !isValidName(action.input.name)) {
      throw new Error(
        `Invalid name: '${action.input.name}'. Names must not be empty or contain control characters.`,
      );
    }

    const nodes = readNodes(state);
    state.nodes = sortNodesById(
      nodes.map((node) =>
        node.id === action.input.id
          ? {
              ...node,
              ...{
                name: handleTargetNameCollisions({
                  nodes: nodes.filter((n) => n.id !== action.input.id),
                  srcName: action.input.name ?? node.name,
                  srcKind: node.kind === "file" ? "file" : "folder",
                  targetParentFolder:
                    action.input.parentFolder ?? node.parentFolder,
                }),
                parentFolder:
                  action.input.parentFolder === null ? null : node.parentFolder,
              },
            }
          : node,
      ),
    );
  },
  copyNodeOperation(state, action, dispatch) {
    const nodes = readNodes(state);
    const node = nodes.find((node) => node.id === action.input.srcId);

    if (!node) {
      throw new Error(`Node with id ${action.input.srcId} not found`);
    }

    const duplicatedNode = nodes.find(
      (node) => node.id === action.input.targetId,
    );

    if (duplicatedNode) {
      throw new Error(`Node with id ${action.input.targetId} already exists`);
    }

    const name = handleTargetNameCollisions({
      nodes,
      srcName: action.input.targetName || node.name,
      srcKind: node.kind === "file" ? "file" : "folder",
      targetParentFolder: action.input.targetParentFolder || null,
    });

    const newNode = {
      ...node,
      id: action.input.targetId,
      slug: action.input.targetId,
      name,
      parentFolder: action.input.targetParentFolder || null,
    };

    state.nodes = insertNodeSorted(nodes, newNode);

    const isFile = isFileNode(newNode);
    if (isFile) {
      dispatch?.({
        type: "COPY_CHILD_DOCUMENT",
        input: {
          id: action.input.srcId,
          newId: action.input.targetId,
        },
      });
    }
  },
  moveNodeOperation(state, action) {
    if (action.input.srcFolder === action.input.targetParentFolder) {
      throw new Error(
        "Circular Reference Error: Attempting to move a node to its current parent folder",
      );
    }

    const nodes = readNodes(state);
    const node = nodes.find((node) => node.id === action.input.srcFolder);

    if (!node) {
      throw new Error(`Node with id ${action.input.srcFolder} not found`);
    }

    const name = handleTargetNameCollisions({
      nodes,
      srcName: node.name,
      srcKind: node.kind === "file" ? "file" : "folder",
      targetParentFolder: action.input.targetParentFolder || null,
    });

    if (isFolderNode(node)) {
      const descendants = getDescendants(node, nodes);
      // throw error if moving a folder to one of its descendants
      if (
        descendants.find(
          (descendant) => descendant.id === action.input.targetParentFolder,
        )
      ) {
        throw new Error(
          "Circular Reference Error: Cannot move a folder to one of its descendants",
        );
      }
    }

    state.nodes = sortNodesById(
      nodes.map((node) => {
        if (node.id === action.input.srcFolder) {
          return {
            ...node,
            name,
            parentFolder: action.input.targetParentFolder || null,
          };
        }

        return node;
      }),
    );
  },
};

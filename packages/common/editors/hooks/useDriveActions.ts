/* eslint-disable @typescript-eslint/require-await */ // TODO dispatch should return a promise
import { Document, EditorDispatch } from "document-model/document";
import { generateId as _generateId } from "document-model/utils";
import {
  DocumentDriveAction,
  DocumentDriveDocument,
  actions,
  generateAddNodeAction,
  generateNodesCopy,
  isFileNode,
  isFolderNode,
} from "document-models/document-drive";
import { useMemo } from "react";
import { IDriveContext } from "./useDriveContext";

const generateId = () => _generateId().toString();

/**
 * Retrieves a node from the drive by its ID
 * @param id - The ID of the node to find
 * @param drive - The document drive to search in
 * @returns The found node or undefined
 */
function getNode(id: string, drive: DocumentDriveDocument) {
  return drive.state.global.nodes.find((node) => node.id === id);
}

/**
 * Creates an object containing actions for managing a document drive
 * @param document - The document drive document
 * @param dispatch - Function to dispatch drive actions
 * @param context - The drive context provided by the host application
 */
function createDriveActions(
  document: DocumentDriveDocument,
  dispatch: EditorDispatch<DocumentDriveAction>,
  context: IDriveContext,
) {
  const drive = document;
  const { id: driveId } = drive.state.global;

  const { selectedNode } = context;

  /**
   * Creates a new folder in the drive
   * @param name - Name of the folder
   * @param parentFolder - Optional ID of parent folder
   * @param id - Optional custom ID for the folder
   */
  const addFolder = async (
    name: string,
    parentFolder?: string | null,
    id = generateId(),
  ) => {
    dispatch(
      actions.addFolder({
        id,
        name,
        parentFolder: parentFolder ?? null,
      }),
    );
  };

  /**
   * Creates a new document in the drive
   * @param name - Name of the document
   * @param documentType - Type of document to create
   * @param document - Optional document content
   * @param parentFolder - Optional ID of parent folder
   * @param id - Optional custom ID for the document
   */
  const addDocument = async (
    name: string,
    documentType: string,
    document?: Document,
    parentFolder?: string,
    id = generateId(),
  ) => {
    const action = generateAddNodeAction(
      drive.state.global,
      {
        id,
        name,
        parentFolder: parentFolder ?? null,
        documentType,
        document,
      },
      ["global"],
    );
    dispatch(action);
  };

  /**
   * Adds a file to the drive
   * @param file - File to be added
   * @param parentFolder - Optional ID of parent folder (defaults to selected folder)
   * @param name - Optional custom name for the file
   */
  const addFile = async (
    file: File,
    parentFolder = selectedNode && isFileNode(selectedNode)
      ? undefined
      : selectedNode?.id,
    name: string = file.name.replace(/\.zip$/gim, ""),
  ) => {
    const folder = parentFolder ? getNode(parentFolder, drive) : undefined;

    if (parentFolder && !folder) {
      throw new Error(`Parent folder with id "${parentFolder}" not found`);
    }

    if (folder && !isFolderNode(folder)) {
      throw new Error(
        `Parent folder with id "${parentFolder}" is not a folder`,
      );
    }

    await context.addFile(file, driveId, name, parentFolder);
  };

  /**
   * Deletes a node from the drive
   * @param id - ID of the node to delete
   */
  const deleteNode = async (id: string) => {
    dispatch(actions.deleteNode({ id }));
  };

  /**
   * Renames a node in the drive
   * @param id - ID of the node to rename
   * @param name - New name for the node
   */
  const renameNode = async (id: string, name: string) => {
    dispatch(actions.updateNode({ id, name }));
  };

  /**
   * Moves a node to a new parent folder
   * @param sourceId - ID of the node to move
   * @param targetId - ID of the target parent folder
   */
  const moveNode = async (sourceId: string, targetId: string) => {
    dispatch(
      actions.moveNode({
        srcFolder: sourceId,
        targetParentFolder: targetId,
      }),
    );
  };

  /**
   * Copies a node to a new location
   * @param sourceId - ID of the node to copy
   * @param targetFolderId - Optional ID of the target folder
   */
  const copyNode = async (
    sourceId: string,
    targetFolderId: string | undefined,
  ) => {
    const target = targetFolderId ? getNode(targetFolderId, drive) : undefined;
    if (targetFolderId && !target) {
      throw new Error(`Target node with id "${targetFolderId}" not found`);
    }
    if (target && !isFolderNode(target)) {
      throw new Error(
        `Target node with id "${targetFolderId}" is not a folder`,
      );
    }

    const source = getNode(sourceId, drive);
    if (!source) {
      throw new Error(`Source node with id "${sourceId}" not found`);
    }

    const copyNodesInput = generateNodesCopy(
      {
        srcId: sourceId,
        targetParentFolder: target?.id,
        targetName: source.name,
      },
      generateId,
      drive.state.global.nodes,
    );

    const copyActions = copyNodesInput.map((copyNodeInput) =>
      actions.copyNode(copyNodeInput),
    );

    for (const copyAction of copyActions) {
      dispatch(copyAction); // TODO support batching dispatch
    }
  };

  /**
   * Creates a copy of a node in the same folder
   * @param sourceId - ID of the node to duplicate
   */
  const duplicateNode = async (sourceId: string) => {
    const node = getNode(sourceId, drive);
    if (!node) {
      throw new Error(`Node with id "${sourceId}" not found`);
    }

    await copyNode(node.id, node.parentFolder || undefined);
  };

  return {
    context,
    selectNode: context.selectNode,
    addFolder,
    addFile,
    addDocument,
    deleteNode,
    renameNode,
    moveNode,
    copyNode,
    duplicateNode,
  };
}

/**
 * Hook that provides actions for managing a document drive
 *
 * @param document - The document drive document
 * @param dispatch - Function to dispatch drive actions
 * @param context - The drive context containing UI-related functions
 * @returns Object containing drive management actions
 *
 * @example
 * const {
 *   addFolder,
 *   addFile,
 *   deleteNode,
 *   moveNode
 * } = useDriveActions(document, dispatch, driveContext);
 */
export function useDriveActions(
  document: DocumentDriveDocument,
  dispatch: EditorDispatch<DocumentDriveAction>,
  context: IDriveContext,
) {
  return useMemo(
    () => createDriveActions(document, dispatch, context),
    [document, dispatch, context],
  );
}

export type IDriveActions = ReturnType<typeof createDriveActions>;

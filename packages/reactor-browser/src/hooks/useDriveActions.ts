import {
  type DocumentDriveAction,
  type DocumentDriveDocument,
  addFolder,
  copyNode,
  deleteNode,
  generateAddNodeAction,
  generateNodesCopy,
  isFolderNode,
  moveNode,
  updateNode,
} from "document-drive";
import {
  type EditorDispatch,
  type PHDocument,
  generateId as _generateId,
} from "document-model";
import { useMemo } from "react";
import { type IDriveContext } from "../types/drive-editor.js";

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
 * Actions for managing a document drive
 */
export interface IDriveActions {
  /** The drive context provided by the host application */
  context: IDriveContext;

  /** Selects a node in the drive */
  setSelectedNode: (id: string | undefined) => void;

  /**
   * Creates a new folder in the drive
   * @param name - Name of the folder
   * @param parentFolder - Optional ID of parent folder
   * @param id - Optional custom ID for the folder
   */
  addFolder: (
    name: string,
    parentFolder?: string | null,
    id?: string,
  ) => Promise<void>;

  /**
   * Adds a file to the drive
   * @param file - File to be added
   * @param parentFolder - Optional ID of parent folder (defaults to selected folder)
   * @param name - Optional custom name for the file
   */
  addFile: (file: File, parentFolder?: string, name?: string) => Promise<void>;

  /**
   * Creates a new document in the drive
   * @param name - Name of the document
   * @param documentType - Type of document to create
   * @param document - Optional document content
   * @param parentFolder - Optional ID of parent folder
   * @param id - Optional custom ID for the document
   */
  addDocument: (
    name: string,
    documentType: string,
    document?: PHDocument,
    parentFolder?: string,
    id?: string,
  ) => Promise<void>;

  /**
   * Deletes a node from the drive
   * @param id - ID of the node to delete
   */
  deleteNode: (id: string) => Promise<void>;

  /**
   * Renames a node in the drive
   * @param id - ID of the node to rename
   * @param name - New name for the node
   */
  renameNode: (id: string, name: string) => Promise<void>;

  /**
   * Moves a node to a new parent folder
   * @param sourceId - ID of the node to move
   * @param targetId - ID of the target parent folder
   */
  moveNode: (sourceId: string, targetId: string) => Promise<void>;

  /**
   * Copies a node to a new location
   * @param sourceId - ID of the node to copy
   * @param targetFolderId - Optional ID of the target folder
   */
  copyNode: (
    sourceId: string,
    targetFolderId: string | undefined,
  ) => Promise<void>;

  /**
   * Creates a copy of a node in the same folder
   * @param sourceId - ID of the node to duplicate
   */
  duplicateNode: (sourceId: string) => Promise<void>;
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
): IDriveActions {
  const drive = document;
  const driveId = drive.header.id;

  const handleAddFolder = async (
    name: string,
    parentFolder?: string | null,
    id = generateId(),
  ) => {
    dispatch(
      addFolder({
        id,
        name,
        parentFolder: parentFolder ?? null,
      }),
    );
  };

  const addDocument = async (
    name: string,
    documentType: string,
    document?: PHDocument,
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

  const addFile = async (
    file: File,
    parentFolderId: string | null | undefined,
    name: string = file.name.replace(/\.zip$/gim, ""),
  ) => {
    await context.addFile(file, driveId, name, parentFolderId ?? undefined);
  };

  const handleDeleteNode = async (id: string) => {
    dispatch(deleteNode({ id }));
  };

  const renameNode = async (id: string, name: string) => {
    dispatch(updateNode({ id, name }));
  };

  const handleMoveNode = async (sourceId: string, targetId: string) => {
    dispatch(
      moveNode({
        srcFolder: sourceId,
        targetParentFolder: targetId,
      }),
    );
  };

  const handleCopyNode = async (
    sourceId: string,
    targetFolderId: string | undefined,
  ) => {
    const target = targetFolderId ? getNode(targetFolderId, drive) : undefined;
    if (targetFolderId && !target && targetFolderId !== driveId) {
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
      copyNode(copyNodeInput),
    );

    for (const copyAction of copyActions) {
      dispatch(copyAction); // TODO support batching dispatch
    }
  };

  const duplicateNode = async (sourceId: string) => {
    const node = getNode(sourceId, drive);
    if (!node) {
      throw new Error(`Node with id "${sourceId}" not found`);
    }

    await handleCopyNode(node.id, node.parentFolder || undefined);
  };

  return {
    context,
    setSelectedNode: context.setSelectedNode,
    addFolder: handleAddFolder,
    addFile,
    addDocument,
    deleteNode: handleDeleteNode,
    renameNode,
    moveNode: handleMoveNode,
    copyNode: handleCopyNode,
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
): IDriveActions {
  return useMemo(
    () => createDriveActions(document, dispatch, context),
    [document, dispatch, context],
  );
}

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

export type DriveActionsContext = IDriveContext;

function getNode(id: string, drive: DocumentDriveDocument) {
  return drive.state.global.nodes.find((node) => node.id === id);
}

function createDriveActions(
  dispatch: EditorDispatch<DocumentDriveAction>,
  context: DriveActionsContext,
) {
  const { drive, selectedNode } = context;
  const { id: driveId } = drive.state.global;

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

  const deleteNode = async (id: string) => {
    dispatch(actions.deleteNode({ id }));
  };

  const renameNode = async (id: string, name: string) => {
    dispatch(actions.updateNode({ id, name }));
  };

  const moveNode = async (sourceId: string, targetId: string) => {
    dispatch(
      actions.moveNode({
        srcFolder: sourceId,
        targetParentFolder: targetId,
      }),
    );
  };

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
    createDocument: context.createDocument,
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

export function useDriveActions(
  dispatch: EditorDispatch<DocumentDriveAction>,
  context: DriveActionsContext,
) {
  return useMemo(
    () => createDriveActions(dispatch, context),
    [dispatch, context],
  );
}

export type IDriveActions = ReturnType<typeof createDriveActions>;

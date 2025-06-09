import {
  getDriveSharingType,
  useIsAllowedToCreateDocuments,
  useSelectedNodePath,
  useSetSelectedNodeId,
  type DriveEditorProps,
} from "#state";
import { Breadcrumbs } from "@powerhousedao/design-system";
import {
  addFolder,
  copyNode,
  deleteNode,
  generateNodesCopy,
  moveNode,
  updateNode,
} from "document-drive";
import { generateId as _generateId } from "document-model";
import { useCallback } from "react";
import { CreateDocument } from "./components/create-document.js";
import FolderView from "./components/folder-view.js";
import { DriveLayout } from "./components/layout.js";
import { SearchBar } from "./components/search-bar.js";

const generateId = () => _generateId().toString();

export function Editor(props: DriveEditorProps) {
  const { document: drive, dispatch, className, children, addFile } = props;
  const setSelectedNodeId = useSetSelectedNodeId();
  const selectedNodePath = useSelectedNodePath();
  const sharingType = getDriveSharingType(drive);
  const isAllowedToCreateDocuments = useIsAllowedToCreateDocuments();

  const dispatchAddFolder = useCallback(
    (name: string, parentFolder?: string | null, id = generateId()) => {
      const parentFolderId =
        parentFolder === drive.id ? undefined : parentFolder;
      dispatch(
        addFolder({
          id,
          name,
          parentFolder: parentFolderId,
        }),
      );
    },
    [dispatch],
  );

  const dispatchDeleteNode = useCallback(
    (id: string) => {
      dispatch(deleteNode({ id }));
    },
    [dispatch],
  );

  const dispatchRenameNode = useCallback(
    (id: string, name: string) => {
      dispatch(updateNode({ id, name }));
    },
    [dispatch],
  );

  const dispatchMoveNode = useCallback(
    (sourceId: string, targetId: string) => {
      dispatch(
        moveNode({
          srcFolder: sourceId,
          targetParentFolder: targetId,
        }),
      );
    },
    [dispatch],
  );

  const dispatchCopyNode = useCallback(
    (sourceId: string, targetFolderId: string | undefined) => {
      const source = drive.state.global.nodes.find(
        (node) => node.id === sourceId,
      );
      if (!source) {
        throw new Error(`Source node with id "${sourceId}" not found`);
      }

      const copyNodesInput = generateNodesCopy(
        {
          srcId: sourceId,
          targetParentFolder: targetFolderId,
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
    },
    [dispatch],
  );

  const onAddFile = useCallback(
    (
      file: string | File,
      driveId: string,
      name?: string,
      parentFolder?: string,
    ) => {
      const parentFolderId =
        parentFolder === driveId ? undefined : parentFolder;
      addFile(file, driveId, name, parentFolderId).catch(console.error);
    },
    [addFile],
  );

  return (
    <DriveLayout className={className}>
      {children}
      <DriveLayout.Header>
        <Breadcrumbs
          breadcrumbs={selectedNodePath}
          createEnabled={isAllowedToCreateDocuments}
          onCreate={dispatchAddFolder}
          onBreadcrumbSelected={setSelectedNodeId}
        />
        <SearchBar />
      </DriveLayout.Header>
      <DriveLayout.Content>
        <FolderView
          sharingType={sharingType}
          onRenameNode={dispatchRenameNode}
          onDeleteNode={dispatchDeleteNode}
          onAddFile={onAddFile}
          onCopyNode={dispatchCopyNode}
          onMoveNode={dispatchMoveNode}
        />
      </DriveLayout.Content>
      <DriveLayout.Footer>
        <CreateDocument />
      </DriveLayout.Footer>
    </DriveLayout>
  );
}

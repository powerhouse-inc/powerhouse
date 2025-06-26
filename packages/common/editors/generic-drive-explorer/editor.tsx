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
import { useUnwrappedSelectedDocument } from "../../state/documents.js";
import { getDriveSharingType } from "../../state/drives.js";
import { useUnwrappedSelectedFolder } from "../../state/folders.js";
import {
  useNodePath,
  useSetSelectedNode,
  useUnwrappedNodes,
} from "../../state/nodes.js";
import { useIsAllowedToCreateDocuments } from "../../state/permissions.js";
import { type DriveEditorProps } from "../../state/types.js";
import { CreateDocument } from "./components/create-document.js";
import FolderView from "./components/folder-view.js";
import { DriveLayout } from "./components/layout.js";
import { SearchBar } from "./components/search-bar.js";

const generateId = () => _generateId().toString();

export function Editor(props: DriveEditorProps) {
  const { document: drive, dispatch, className, children, addFile } = props;
  const selectedDocument = useUnwrappedSelectedDocument();
  const selectedFolder = useUnwrappedSelectedFolder();
  const nodes = useUnwrappedNodes();
  const setSelectedNode = useSetSelectedNode();
  const loadableSelectedNodePath = useNodePath(
    selectedDocument?.id ?? selectedFolder?.id,
  );
  const sharingType = getDriveSharingType(drive);
  const isAllowedToCreateDocuments = useIsAllowedToCreateDocuments();

  const dispatchAddFolder = useCallback(
    (name: string, parentFolder?: string | null, id = generateId()) => {
      dispatch(
        addFolder({
          id,
          name,
          parentFolder,
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
    (name: string, id: string) => {
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
      addFile(file, driveId, name, parentFolder)
        .then((node) => {
          setSelectedNode(node.id);
        })
        .catch(console.error);
    },
    [addFile],
  );

  const onBreadcrumbSelected = useCallback(
    (documentId: string) => {
      setSelectedNode(documentId);
    },
    [setSelectedNode],
  );

  return (
    <DriveLayout className={className}>
      {children}
      <DriveLayout.Header>
        {loadableSelectedNodePath.state === "hasData" && (
          <Breadcrumbs
            breadcrumbs={loadableSelectedNodePath.data ?? []}
            createEnabled={isAllowedToCreateDocuments}
            onCreate={dispatchAddFolder}
            onBreadcrumbSelected={onBreadcrumbSelected}
          />
        )}
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

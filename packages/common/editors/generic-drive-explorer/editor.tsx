import {
  Breadcrumbs,
  useBreadcrumbs,
  useDrop,
} from "@powerhousedao/design-system";
import { type DriveEditorProps } from "@powerhousedao/reactor-browser";
import { useDriveActionsWithUiNodes } from "@powerhousedao/reactor-browser/hooks/useDriveActionsWithUiNodes";
import {
  DriveContextProvider,
  useDriveContext,
} from "@powerhousedao/reactor-browser/hooks/useDriveContext";
import {
  FILE,
  useUiNodesContext,
} from "@powerhousedao/reactor-browser/hooks/useUiNodesContext";
import { type DocumentDriveDocument } from "document-drive";
import type React from "react";
import { useMemo } from "react";
import { CreateDocument } from "./components/create-document.js";
import FolderView from "./components/folder-view.js";
import { DriveLayout } from "./components/layout.js";
import { SearchBar } from "./components/search-bar.js";

export type IGenericDriveExplorerEditorProps = {
  className?: string;
  children?: React.ReactNode;
};

export type IProps = DriveEditorProps<DocumentDriveDocument> &
  React.HTMLProps<HTMLDivElement>;

export function BaseEditor(props: IProps) {
  const { document, dispatch, className, children } = props;

  const { id: driveId } = document;
  const {
    showSearchBar,
    isAllowedToCreateDocuments,
    documentModels,
    showCreateDocumentModal,
  } = useDriveContext();
  const {
    driveNodes,
    selectedNode,
    selectedNodePath,
    getNodeById,
    setSelectedNode,
  } = useUiNodesContext();

  const driveNode = useMemo(
    () => driveNodes.find((n) => n.id === driveId),
    [driveNodes, driveId],
  );

  const {
    addDocument,
    addFile,
    addFolder,
    renameNode,
    deleteNode,
    moveNode,
    copyNode,
    duplicateNode,
  } = useDriveActionsWithUiNodes(document, dispatch);

  const { isDropTarget, dropProps } = useDrop({
    uiNode: selectedNode,
    onAddFile: addFile,
    onCopyNode: copyNode,
    onMoveNode: moveNode,
  });

  const { breadcrumbs, onBreadcrumbSelected } = useBreadcrumbs({
    selectedNodePath,
    getNodeById,
    setSelectedNode,
  });

  if (!driveNode) {
    return <div>Drive not found</div>;
  } else if (selectedNode?.kind === FILE) {
    return <></>;
  }

  return (
    <DriveLayout className={className}>
      {children}
      <DriveLayout.Header>
        <Breadcrumbs
          breadcrumbs={breadcrumbs}
          createEnabled={isAllowedToCreateDocuments}
          onCreate={addFolder}
          onBreadcrumbSelected={onBreadcrumbSelected}
        />
        {showSearchBar && <SearchBar />}
      </DriveLayout.Header>
      <DriveLayout.Content>
        <FolderView
          node={selectedNode || driveNode}
          onSelectNode={setSelectedNode}
          onRenameNode={renameNode}
          onDuplicateNode={duplicateNode}
          onDeleteNode={deleteNode}
          onAddFile={addFile}
          onCopyNode={copyNode}
          onMoveNode={moveNode}
          isDropTarget={isDropTarget}
          isAllowedToCreateDocuments={isAllowedToCreateDocuments}
        />
      </DriveLayout.Content>
      <DriveLayout.Footer>
        {isAllowedToCreateDocuments && (
          <CreateDocument
            documentModels={documentModels}
            createDocument={showCreateDocumentModal}
          />
        )}
      </DriveLayout.Footer>
    </DriveLayout>
  );
}

export default function Editor(props: IProps) {
  return (
    <DriveContextProvider value={props.context}>
      <BaseEditor {...props} />
    </DriveContextProvider>
  );
}

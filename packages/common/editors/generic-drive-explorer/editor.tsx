import {
  Breadcrumbs,
  FILE,
  useBreadcrumbs,
  useDrop,
  useUiNodesContext,
} from "@powerhousedao/design-system";
import { useDriveActionsWithUiNodes } from "@powerhousedao/reactor-browser/hooks/useDriveActionsWithUiNodes";
import { useDriveContext } from "@powerhousedao/reactor-browser/hooks/useDriveContext";
import { DocumentDriveDocument } from "document-drive";
import { DocumentModelModule, EditorProps } from "document-model";
import React, { useCallback, useMemo } from "react";
import { CreateDocument } from "./components/create-document.js";
import FolderView from "./components/folder-view.js";
import { DriveLayout } from "./components/layout.js";
import { SearchBar } from "./components/search-bar.js";

export type IGenericDriveExplorerEditorProps = {
  className?: string;
  children?: React.ReactNode;
};

export type IProps = EditorProps<DocumentDriveDocument> &
  React.HTMLProps<HTMLDivElement>;

export default function Editor(props: IProps) {
  const { document, dispatch, className, children } = props;

  const {
    state: {
      global: { id },
    },
  } = document;
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
    () => driveNodes.find((n) => n.id === id),
    [driveNodes, id],
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

  const onCreateDocument = useCallback(
    async (documentModel: DocumentModelModule) => {
      const { name } = await showCreateDocumentModal(documentModel);
      const document = documentModel.utils.createDocument();
      await addDocument(
        name,
        documentModel.documentModelName,
        document,
        selectedNode?.id,
      );
    },
    [addDocument, showCreateDocumentModal, selectedNode?.id],
  );

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
            createDocument={onCreateDocument}
          />
        )}
      </DriveLayout.Footer>
    </DriveLayout>
  );
}

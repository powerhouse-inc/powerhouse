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
import { type DocumentModelModule } from "document-model";
import type React from "react";
import { useCallback, useMemo } from "react";
/* import { useDocuments, useSelectedDocument } from "../../state/documents.js";
import { useDrives, useSelectedDrive } from "../../state/drives.js";
import { useSelectedFolder } from "../../state/folders.js";
import { useReactor } from "../../state/reactor.js"; */
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
  /*   const loadableReactor = useReactor();
  const loadableDrives = useDrives();
  const loadableDocuments = useDocuments();
  const loadableSelectedDrive = useSelectedDrive();
  const loadableSelectedFolder = useSelectedFolder();
  const loadableSelectedDocument = useSelectedDocument();
  console.log("in base editor", {
    loadableReactor,
    loadableDrives,
    loadableDocuments,
    loadableSelectedDrive,
    loadableSelectedFolder,
    loadableSelectedDocument,
  }); */
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

  const onCreateDocument = useCallback(
    async (documentModel: DocumentModelModule) => {
      const { name } = await showCreateDocumentModal(documentModel);
      const document = documentModel.utils.createDocument();
      await addDocument(
        name,
        documentModel.documentModel.name,
        document,
        selectedNode?.id,
      );
    },
    [addDocument, showCreateDocumentModal, selectedNode?.id],
  );

  const { isDropTarget: isDropTargetFolder, dropProps: dropPropsFolder } =
    useDrop({
      uiNode: selectedNode,
      onAddFile: addFile,
      onCopyNode: copyNode,
      onMoveNode: moveNode,
    });

  const { isDropTarget, dropProps } = useDrop({
    uiNode: selectedNode?.kind === "FOLDER" ? selectedNode : null,
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
      <DriveLayout.Content
        {...dropProps}
        className={isDropTarget ? "rounded-xl bg-blue-100" : ""}
      >
        <FolderView
          node={selectedNode || driveNode}
          onSelectNode={setSelectedNode}
          onRenameNode={renameNode}
          onDuplicateNode={duplicateNode}
          onDeleteNode={deleteNode}
          onAddFile={addFile}
          onCopyNode={copyNode}
          onMoveNode={moveNode}
          isAllowedToCreateDocuments={isAllowedToCreateDocuments}
          isDropTarget={isDropTargetFolder}
          {...dropPropsFolder}
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

export default function Editor(props: IProps) {
  return (
    <DriveContextProvider value={props.context}>
      <BaseEditor {...props} />
    </DriveContextProvider>
  );
}

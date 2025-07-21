import {
  Breadcrumbs,
  useBreadcrumbs,
  useDrop,
} from "@powerhousedao/design-system";
import { type DriveEditorProps } from "@powerhousedao/reactor-browser";
import {
  DriveContextProvider,
  useDriveContext,
} from "@powerhousedao/reactor-browser/hooks/useDriveContext";
import {
  getDriveSharingType,
  makeFolderNodeFromDrive,
  useSelectedNodePath,
  useSetSelectedNode,
  useUnwrappedSelectedDrive,
  useUnwrappedSelectedFolder,
} from "@powerhousedao/state";
import { type DocumentDriveDocument } from "document-drive";
import { type DocumentModelModule } from "document-model";
import type React from "react";
import { useCallback } from "react";
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

  const {
    header: { id: driveId },
  } = document;
  const {
    showSearchBar,
    isAllowedToCreateDocuments,
    documentModels,
    getSyncStatusSync,
    addDocument,
    showCreateDocumentModal,
    onRenameNode,
    onDuplicateNode,
    onAddFolder,
    onAddFile,
    onCopyNode,
    onMoveNode,
    onAddAndSelectNewFolder,
    showDeleteNodeModal,
  } = useDriveContext();
  const selectedDrive = useUnwrappedSelectedDrive();
  const selectedFolder = useUnwrappedSelectedFolder();
  const selectedDriveAsFolderNode = makeFolderNodeFromDrive(selectedDrive);
  const selectedNodePath = useSelectedNodePath();
  const setSelectedNode = useSetSelectedNode();
  const onCreateDocument = useCallback(
    async (documentModel: DocumentModelModule) => {
      const { name } = await showCreateDocumentModal(documentModel);
      const document = documentModel.utils.createDocument();
      await addDocument(
        driveId,
        name,
        documentModel.documentModel.name,
        selectedFolder?.id,
        document,
      );
    },
    [addDocument, showCreateDocumentModal, selectedFolder?.id],
  );

  const { isDropTarget, dropProps } = useDrop({
    node: selectedDriveAsFolderNode,
    onAddFile,
    onCopyNode,
    onMoveNode,
  });

  const { breadcrumbs, onBreadcrumbSelected } = useBreadcrumbs({
    selectedNodePath,
    setSelectedNode,
  });
  const sharingType = getDriveSharingType(document);

  if (!selectedDrive) {
    return <div>Drive not found</div>;
  }

  return (
    <DriveLayout className={className}>
      {children}
      <DriveLayout.Header>
        <Breadcrumbs
          breadcrumbs={breadcrumbs}
          createEnabled={isAllowedToCreateDocuments}
          onCreate={onAddAndSelectNewFolder}
          onBreadcrumbSelected={onBreadcrumbSelected}
        />
        {showSearchBar && <SearchBar />}
      </DriveLayout.Header>
      <DriveLayout.Content
        {...dropProps}
        className={isDropTarget ? "rounded-xl bg-blue-100" : ""}
      >
        <FolderView
          node={selectedFolder ?? selectedDriveAsFolderNode}
          sharingType={sharingType}
          getSyncStatusSync={getSyncStatusSync}
          setSelectedNode={setSelectedNode}
          onRenameNode={onRenameNode}
          onDuplicateNode={onDuplicateNode}
          onAddFolder={onAddFolder}
          onAddFile={onAddFile}
          onCopyNode={onCopyNode}
          onMoveNode={onMoveNode}
          onAddAndSelectNewFolder={onAddAndSelectNewFolder}
          showDeleteNodeModal={showDeleteNodeModal}
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

export default function Editor(props: IProps) {
  return (
    <DriveContextProvider value={props.context}>
      <BaseEditor {...props} />
    </DriveContextProvider>
  );
}

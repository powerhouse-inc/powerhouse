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
    useSelectedDrive,
    useSelectedFolder,
    useSelectedNodePath,
    useSetSelectedNode,
} from "@powerhousedao/state";
import { type DocumentDriveDocument } from "document-drive";
import { type DocumentModelModule } from "document-model";
import type React from "react";
import { useCallback } from "react";
import { CreateDocument } from "./components/create-document.js";
import FolderView from "./components/folder-view.js";
import { DriveLayout } from "./components/layout.js";
import { SearchBar } from "./components/search-bar.js";

export type GenericDriveExplorerEditorProps =
  DriveEditorProps<DocumentDriveDocument> & React.HTMLProps<HTMLDivElement>;

export function BaseEditor(props: GenericDriveExplorerEditorProps) {
  const { document, className, children } = props;

  const {
    showSearchBar,
    isAllowedToCreateDocuments,
    documentModels,
    getSyncStatusSync,
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
  const selectedDrive = useSelectedDrive();
  const selectedFolder = useSelectedFolder();
  const selectedDriveAsFolderNode = makeFolderNodeFromDrive(selectedDrive);
  const selectedNodePath = useSelectedNodePath();
  const setSelectedNode = useSetSelectedNode();
  const onCreateDocument = useCallback(
    (documentModel: DocumentModelModule) => {
      showCreateDocumentModal(documentModel);
    },
    [showCreateDocumentModal],
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

export default function Editor(props: GenericDriveExplorerEditorProps) {
  return (
    <DriveContextProvider value={props.context}>
      <BaseEditor {...props} />
    </DriveContextProvider>
  );
}

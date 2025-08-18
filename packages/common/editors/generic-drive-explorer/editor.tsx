import {
  Breadcrumbs,
  useBreadcrumbs,
  useDrop,
} from "@powerhousedao/design-system";
import {
  DriveContextProvider,
  getDriveSharingType,
  getSyncStatusSync,
  makeFolderNodeFromDrive,
  setSelectedNode,
  useDocumentModelModules,
  useDriveContext,
  useSelectedDrive,
  useSelectedFolder,
  useSelectedNodePath,
  useUserPermissions,
  type DriveEditorProps,
} from "@powerhousedao/reactor-browser";
import { type DocumentDriveDocument } from "document-drive";
import { type DocumentModelModule } from "document-model";
import type React from "react";
import { CreateDocument } from "./components/create-document.js";
import FolderView from "./components/folder-view.js";
import { DriveLayout } from "./components/layout.js";
import { SearchBar } from "./components/search-bar.js";

export type GenericDriveExplorerEditorProps = DriveEditorProps &
  React.HTMLProps<HTMLDivElement>;

export function BaseEditor(props: GenericDriveExplorerEditorProps) {
  const { document, className, children } = props;
  const unsafeCastOfDocument = document as DocumentDriveDocument;

  const {
    showSearchBar,
    showCreateDocumentModal,
    onRenameNode,
    onDuplicateNode,
    onAddFolder,
    onAddFile,
    onCopyNode,
    onMoveNode,
    showDeleteNodeModal,
  } = useDriveContext();
  const [selectedDrive] = useSelectedDrive();
  const selectedFolder = useSelectedFolder();
  const selectedDriveAsFolderNode = makeFolderNodeFromDrive(selectedDrive);
  const documentModels = useDocumentModelModules();
  const selectedNodePath = useSelectedNodePath();
  const userPermissions = useUserPermissions();
  const isAllowedToCreateDocuments =
    userPermissions?.isAllowedToCreateDocuments ?? false;
  const onCreateDocument = (documentModel: DocumentModelModule) => {
    showCreateDocumentModal(documentModel);
  };
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
  const sharingType = getDriveSharingType(unsafeCastOfDocument);

  if (!selectedDrive) {
    return <div>Drive not found</div>;
  }

  async function onAddAndSelectNewFolder(name: string) {
    await onAddFolder(name, selectedFolder);
    setSelectedNode(selectedFolder);
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
            documentModels={documentModels?.filter(
              (module) =>
                module.documentModel.id !== "powerhouse/document-drive",
            )}
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

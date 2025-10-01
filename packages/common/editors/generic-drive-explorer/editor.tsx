import {
  CreateDocument,
  DriveLayout,
  FolderView,
  SearchBar,
} from "@powerhousedao/common";
import {
  Breadcrumbs,
  useBreadcrumbs,
  useDrop,
} from "@powerhousedao/design-system";
import type { DriveEditorProps } from "@powerhousedao/reactor-browser";
import {
  getSyncStatusSync,
  makeFolderNodeFromDrive,
  setSelectedNode,
  showCreateDocumentModal,
  showDeleteNodeModal,
  useDocumentModelModules,
  useNodeActions,
  useSelectedDriveDocument,
  useSelectedFolder,
  useSelectedNodePath,
  useShowSearchBar,
  useUserPermissions,
} from "@powerhousedao/reactor-browser";
import { getDriveSharingType } from "document-drive";
import type { DocumentModelModule } from "document-model";
import React from "react";

type GenericDriveExplorerEditorProps = DriveEditorProps &
  React.HTMLProps<HTMLDivElement>;

export function Editor(props: GenericDriveExplorerEditorProps) {
  const { className, children } = props;
  const [selectedDrive] = useSelectedDriveDocument();
  const {
    onRenameNode,
    onDuplicateNode,
    onAddFolder,
    onAddFile,
    onCopyNode,
    onMoveNode,
  } = useNodeActions();
  const selectedFolder = useSelectedFolder();
  const selectedDriveAsFolderNode = makeFolderNodeFromDrive(selectedDrive);
  const documentModels = useDocumentModelModules();
  const selectedNodePath = useSelectedNodePath();
  const { isAllowedToCreateDocuments } = useUserPermissions();
  const showSearchBar = useShowSearchBar();
  const onCreateDocument = (documentModel: DocumentModelModule) => {
    showCreateDocumentModal(documentModel.documentModel.global.id);
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
  const sharingType = getDriveSharingType(selectedDrive);

  async function onAddAndSelectNewFolder(name: string) {
    await onAddFolder(name, selectedFolder);
    setSelectedNode(selectedFolder);
  }

  const showDocumentEditor = !!children;

  return (
    <DriveLayout className={className}>
      {!showDocumentEditor && (
        <DriveLayout.Header>
          <Breadcrumbs
            breadcrumbs={breadcrumbs}
            createEnabled={isAllowedToCreateDocuments}
            onCreate={onAddAndSelectNewFolder}
            onBreadcrumbSelected={onBreadcrumbSelected}
          />
          {showSearchBar && <SearchBar />}
        </DriveLayout.Header>
      )}
      {showDocumentEditor ? (
        children
      ) : (
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
            showDeleteNodeModal={(node) => showDeleteNodeModal(node.id)}
            isAllowedToCreateDocuments={isAllowedToCreateDocuments}
          />
        </DriveLayout.Content>
      )}
      {!showDocumentEditor && (
        <DriveLayout.Footer>
          {isAllowedToCreateDocuments && (
            <CreateDocument
              documentModels={
                documentModels?.filter(
                  (module) =>
                    module.documentModel.global.id !==
                    "powerhouse/document-drive",
                ) as unknown as DocumentModelModule[]
              }
              createDocument={onCreateDocument}
            />
          )}
        </DriveLayout.Footer>
      )}
    </DriveLayout>
  );
}

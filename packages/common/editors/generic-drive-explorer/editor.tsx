import { Breadcrumbs, useBreadcrumbs } from "@powerhousedao/design-system";
import { type DocumentDriveDocument } from "document-drive";
import { type DocumentModelModule } from "document-model";
import { useCallback } from "react";
import { useSelectedNodePath, useSetSelectedNodeId } from "./atoms.js";
import { CreateDocument } from "./components/create-document.js";
import FolderView from "./components/folder-view.js";
import { DriveLayout } from "./components/layout.js";
import { SearchBar } from "./components/search-bar.js";
import { type DriveEditorProps } from "./types.js";
import { DriveContextProvider, useDriveContext } from "./useDriveContext.js";

export type IGenericDriveExplorerEditorProps = {
  className?: string;
  children?: React.ReactNode;
};

export type IProps = DriveEditorProps<DocumentDriveDocument> &
  React.HTMLProps<HTMLDivElement>;

export function BaseEditor(props: IProps) {
  const { document, dispatch, className, children } = props;

  const {
    showSearchBar,
    isAllowedToCreateDocuments,
    documentModels,
    onAddDocument,
    onAddFile,
    onAddFolder,
    onRenameNode,
    onDeleteNode,
    onMoveNode,
    onCopyNode,
  } = useDriveContext();
  const setSelectedNodeId = useSetSelectedNodeId();
  const selectedNodePath = useSelectedNodePath();
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

  const { breadcrumbs, onBreadcrumbSelected } = useBreadcrumbs(
    selectedNodePath,
    setSelectedNodeId,
  );

  return (
    <DriveLayout className={className}>
      {children}
      <DriveLayout.Header>
        <Breadcrumbs
          breadcrumbs={breadcrumbs}
          createEnabled={isAllowedToCreateDocuments}
          onCreate={onAddFolder}
          onBreadcrumbSelected={onBreadcrumbSelected}
        />
        {showSearchBar && <SearchBar />}
      </DriveLayout.Header>
      <DriveLayout.Content>
        <FolderView
          onRenameNode={onRenameNode}
          onDeleteNode={onDeleteNode}
          onAddFile={onAddFile}
          onCopyNode={onCopyNode}
          onMoveNode={onMoveNode}
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

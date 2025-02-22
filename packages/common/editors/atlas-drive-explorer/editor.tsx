import { FILE, useDrop, useUiNodesContext } from "@powerhousedao/design-system";
import { DocumentModel, EditorProps } from "document-model/document";
import {
  DocumentDriveAction,
  DocumentDriveLocalState,
  DocumentDriveState,
} from "document-models/document-drive";
import { useDriveActionsWithUiNodes, useDriveContext } from "editors/hooks";
import { useCallback, useMemo } from "react";
import { CreateDocument } from "./components/create-document";
import { EditorLayout } from "./components/EditorLayout";
import FolderView from "./components/folder-view";

export type IGenericDriveExplorerEditorProps = {
  className?: string;
  children?: React.ReactNode;
};

export type IProps = EditorProps<
  DocumentDriveState,
  DocumentDriveAction,
  DocumentDriveLocalState
> &
  React.HTMLProps<HTMLDivElement>;

export default function Editor(props: IProps) {
  const { document, dispatch, className, children } = props;

  const {
    state: {
      global: { id },
    },
  } = document;

  const {
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
    renameNode,
    deleteNode,
    moveNode,
    copyNode,
    duplicateNode,
  } = useDriveActionsWithUiNodes(document, dispatch);

  const onCreateDocument = useCallback(
    async (documentModel: DocumentModel) => {
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

  const { isDropTarget, dropProps } = useDrop({
    uiNode: selectedNode,
    onAddFile: addFile,
    onCopyNode: copyNode,
    onMoveNode: moveNode,
  });

  if (!driveNode) {
    return <div>Drive not found</div>;
  } else if (selectedNode?.kind === FILE) {
    return <></>;
  }

  return (
    <div
      // eslint-disable-next-line tailwindcss/no-custom-classname
      className="atlas-drive-explorer"
      style={{ padding: "0.75rem 0.75rem 0 0.75rem", boxSizing: "content-box" }}
    >
      <EditorLayout>
        <style>
          {`
            .atlas-drive-explorer-header {
              margin-bottom: 1em;
            }

            .atlas-drive-explorer > main {
              border: 1px solid #EEEEEE;
            }
            
            .atlas-drive-explorer > main > aside {
              height: calc(100svh - 2.25rem - 18px);
            }

            .atlas-drive-explorer > main > div {
              height: calc(100svh - 2.25rem - 18px);
              overflow-y: auto;
            }

            .d-none {
              display: none;
            }

            #document-editor-context > div.flex:first-child {
              position: absolute;
              right: 0;
              top: 16px;
            }`}
        </style>
        <h1 className="atlas-drive-explorer-header mt-12 text-2xl font-bold text-gray-900 dark:text-gray-50">
          Altas Drive Explorer
        </h1>
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
        {isAllowedToCreateDocuments && (
          <CreateDocument
            documentModels={documentModels}
            createDocument={onCreateDocument}
          />
        )}
      </EditorLayout>
    </div>
  );
}

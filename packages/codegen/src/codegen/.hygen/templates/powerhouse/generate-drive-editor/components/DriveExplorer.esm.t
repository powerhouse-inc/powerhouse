---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/components/DriveExplorer.tsx"
unless_exists: true
---
import {
  type BaseUiFileNode,
  type BaseUiFolderNode,
  type BaseUiNode,
  type UiFileNode,
  type UiFolderNode,
  type UiNode,
} from "@powerhousedao/design-system";
import { useCallback, useState, useRef, useEffect } from "react";
import type { FileNode, GetDocumentOptions, Node } from "document-drive";
import { FileItemsGrid } from "./FileItemsGrid.js";
import { FolderItemsGrid } from "./FolderItemsGrid.js";
import { FolderTree } from "./FolderTree.js";
import { useTransformedNodes } from "../hooks/useTransformedNodes.js";
import { useSelectedFolderChildren } from "../hooks/useSelectedFolderChildren.js";
import { EditorContainer } from "./EditorContainer.js";
import type { DocumentModelModule } from "document-model";
import { CreateDocumentModal } from "@powerhousedao/design-system";
import { CreateDocument } from "./CreateDocument.js";
import { type DriveEditorContext, useDriveContext } from "@powerhousedao/reactor-browser";

interface DriveExplorerProps {
  driveId: string;
  nodes: Node[];
  onAddFolder: (name: string, parentFolder?: string) => void;
  onDeleteNode: (nodeId: string) => void;
  renameNode: (nodeId: string, name: string) => void;
  onCopyNode: (nodeId: string, targetName: string, parentId?: string) => void;
  context: DriveEditorContext;
}

export function DriveExplorer({
  driveId,
  nodes,
  onDeleteNode,
  renameNode,
  onAddFolder,
  onCopyNode,
  context,
}: DriveExplorerProps) {
  const { getDocumentRevision } = context;

  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const [activeDocumentId, setActiveDocumentId] = useState<
    string | undefined
  >();
  const [openModal, setOpenModal] = useState(false);
  const selectedDocumentModel = useRef<DocumentModelModule | null>(null);
  const { addDocument, documentModels } = useDriveContext();

  // Dummy functions to satisfy component types
  const dummyDuplicateNode = useCallback((node: BaseUiNode) => {
    console.log("Duplicate node:", node);
  }, []);

  const dummyAddFile = useCallback(
    async (file: File, parentNode: BaseUiNode | null) => {
      console.log("Add file:", file, parentNode);
    },
    []
  );

  const dummyMoveNode = useCallback(
    async (uiNode: BaseUiNode, targetNode: BaseUiNode) => {
      console.log("Move node:", uiNode, targetNode);
    },
    []
  );

  const handleNodeSelect = useCallback((node: BaseUiFolderNode) => {
    console.log("Selected node:", node);
    setSelectedNodeId(node.id);
  }, []);

  const handleFileSelect = useCallback((node: BaseUiFileNode) => {
    setActiveDocumentId(node.id);
  }, []);

  const handleEditorClose = useCallback(() => {
    setActiveDocumentId(undefined);
  }, []);

  const onCreateDocument = useCallback(
    async (fileName: string) => {
      setOpenModal(false);

      const documentModel = selectedDocumentModel.current;
      if (!documentModel) return;

      const node = await addDocument(
        driveId,
        fileName,
        documentModel.documentModel.id,
        selectedNodeId,
      );

      selectedDocumentModel.current = null;
      setActiveDocumentId(node.id);
    },
    [addDocument, driveId, selectedNodeId]
  );

  const onSelectDocumentModel = useCallback(
    (documentModel: DocumentModelModule) => {
      selectedDocumentModel.current = documentModel;
      setOpenModal(true);
    },
    []
  );

  const onGetDocumentRevision = useCallback(
    (options?: GetDocumentOptions) => {
      if (!activeDocumentId) return;
      return getDocumentRevision?.(activeDocumentId, options);
    },
    [getDocumentRevision, activeDocumentId],
  );

  const filteredDocumentModels = documentModels;

  // Transform nodes using the custom hook
  const transformedNodes = useTransformedNodes(nodes, driveId);

  // Separate folders and files
  const folders = transformedNodes.filter(
    (node): node is UiFolderNode => node.kind === "FOLDER"
  );
  const files = transformedNodes.filter(
    (node): node is UiFileNode => node.kind === "FILE"
  );

  // Get children of selected folder using the custom hook
  const selectedFolderChildren = useSelectedFolderChildren(
    selectedNodeId,
    folders,
    files
  );

  // Get the active document info from nodes
  const activeDocument = activeDocumentId
    ? files.find((file) => file.id === activeDocumentId)
    : undefined;

  const documentModelModule = activeDocument
    ? context.getDocumentModelModule(activeDocument.documentType)
    : null;

  const editorModule = activeDocument
    ? context.getEditor(activeDocument.documentType)
    : null;

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-64 border-r border-gray-200 p-4 overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">Folders</h2>
        <FolderTree
          folders={folders}
          selectedNodeId={selectedNodeId}
          onSelectNode={handleNodeSelect}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 overflow-y-auto">
        {activeDocument && documentModelModule && editorModule ? (
          <EditorContainer
            context={{
              ...context,
              getDocumentRevision: onGetDocumentRevision,
            }}
            documentId={activeDocumentId!}
            documentType={activeDocument.documentType}
            driveId={driveId}
            onClose={handleEditorClose}
            title={activeDocument.name}
            documentModelModule={documentModelModule}
            editorModule={editorModule}
          />
        ) : (
          <>
            <h2 className="text-lg font-semibold mb-4">Contents</h2>

            {/* Folders Section */}
            <FolderItemsGrid
              folders={selectedFolderChildren.folders}
              onSelectNode={handleNodeSelect}
              onRenameNode={renameNode}
              onDuplicateNode={(uiNode) =>
                onCopyNode(
                  uiNode.id,
                  "Copy of " + uiNode.name,
                  uiNode.parentFolder
                )
              }
              onDeleteNode={onDeleteNode}
              onAddFile={dummyAddFile}
              onCopyNode={async (uiNode, targetNode) =>
                onCopyNode(uiNode.id, "Copy of " + uiNode.name, targetNode.id)
              }
              onMoveNode={dummyMoveNode}
              isAllowedToCreateDocuments={true}
              onAddFolder={onAddFolder}
              parentFolderId={selectedNodeId}
            />

            {/* Files Section */}
            <FileItemsGrid
              files={selectedFolderChildren.files}
              onSelectNode={handleFileSelect}
              onRenameNode={renameNode}
              onDuplicateNode={dummyDuplicateNode}
              onDeleteNode={onDeleteNode}
              isAllowedToCreateDocuments={true}
            />

            {/* Create Document Section */}
            <CreateDocument
              createDocument={onSelectDocumentModel}
              documentModels={filteredDocumentModels}
            />
          </>
        )}
      </div>

      {/* Create Document Modal */}
      <CreateDocumentModal
        onContinue={onCreateDocument}
        onOpenChange={(open) => setOpenModal(open)}
        open={openModal}
      />
    </div>
  );
} 
---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/components/DriveExplorer.tsx"
unless_exists: true
---
import { 
  FolderItem,
  FileItem,
  type SharingType,
  Breadcrumbs,
  useBreadcrumbs,
  useDrop,
} from "@powerhousedao/design-system";
import { useCallback, useState, useRef, useMemo } from "react";
import type { FileNode, FolderNode, Node, GetDocumentOptions } from "document-drive";
import { 
  useNodes,
  useSelectedDrive,
  useSelectedFolder,
  useFolderChildNodesForId,
  useFileChildNodesForId,
  useSetSelectedNode,
  getDriveSharingType,
  makeFolderNodeFromDrive,
} from "@powerhousedao/state";
import { EditorContainer } from "./EditorContainer.js";
import { FolderTree } from "./FolderTree.js";
import type { DocumentModelModule } from "document-model";
import { CreateDocumentModal } from "@powerhousedao/design-system";
import { CreateDocument } from "./CreateDocument.js";
import {
  type DriveEditorContext,
  useDriveContext,
} from "@powerhousedao/reactor-browser";

interface DriveExplorerProps {
  driveId: string;
  onAddFolder: (name: string, parent: Node | undefined) => Promise<FolderNode | undefined>;
  onRenameNode: (newName: string, node: Node) => Promise<Node | undefined>;
  onCopyNode: (src: Node, target: Node | undefined) => Promise<void>;
  onOpenDocument: (node: FileNode) => void;
  showDeleteNodeModal: (node: Node) => void;
  context: DriveEditorContext;
}

/**
 * Main drive explorer component with sidebar navigation and content area.
 * Layout: Left sidebar (folder tree) + Right content area (files/folders + document editor)
 */
export function DriveExplorer({
  driveId,
  onRenameNode,
  onAddFolder: onAddFolderProp,
  onCopyNode,
  onOpenDocument,
  showDeleteNodeModal,
  context,
}: DriveExplorerProps) {

  // === DOCUMENT EDITOR STATE ===
  // Customize document opening/closing behavior here
  const [activeDocumentId, setActiveDocumentId] = useState<
    string | undefined
  >();
  const [openModal, setOpenModal] = useState(false);
  const selectedDocumentModel = useRef<DocumentModelModule | null>(null);
  
  // === DRIVE CONTEXT HOOKS ===
  // Core drive operations and document models
  const { 
    addDocument, 
    documentModels, // Modify this to filter available document types
    getSyncStatusSync,
    isAllowedToCreateDocuments,
    onAddFile,
    onAddFolder,
    onAddAndSelectNewFolder,
    onDuplicateNode,
    onMoveNode,
  } = useDriveContext();
  
  // === STATE MANAGEMENT HOOKS ===
  // Core state hooks for drive navigation
  const nodes = useNodes(); // All nodes in the drive
  const selectedDrive = useSelectedDrive(); // Current drive
  const selectedFolder = useSelectedFolder(); // Currently selected folder
  const setSelectedNode = useSetSelectedNode(); // Function to change selection
  
  // === BREADCRUMB PATH CALCULATION ===
  // Local fix for correct breadcrumb ordering (replaces useSelectedNodePath)
  // TODO: Remove this when state package breadcrumb ordering is fixed
  const selectedNodePath = useMemo(() => {
    if (!nodes || !selectedDrive || !selectedFolder) return [];
    const driveFolderNode = makeFolderNodeFromDrive(selectedDrive);
    
    const path: Node[] = [];
    let current = selectedFolder;
    
    // Build path from current folder up to root
    while (current) {
      path.unshift(current);
      if (!current.parentFolder) break;
      current = nodes.find((n) => n.id === current.parentFolder) as FolderNode;
    }
    
    // Add drive at the beginning
    if (driveFolderNode) {
      path.unshift(driveFolderNode);
    }
    
    return path;
  }, [nodes, selectedDrive, selectedFolder]);
  
  // === COMPUTED VALUES ===
  const selectedNodeId = selectedFolder?.id;
  const sharingType: SharingType = getDriveSharingType(selectedDrive) as SharingType;
  const selectedDriveAsFolderNode = makeFolderNodeFromDrive(selectedDrive);

  // === NAVIGATION SETUP ===
  // Breadcrumbs for folder navigation
  const { breadcrumbs, onBreadcrumbSelected } = useBreadcrumbs({
    selectedNodePath,
    setSelectedNode,
  });

  // Drag & drop functionality for file uploads
  const { isDropTarget, dropProps } = useDrop({
    node: selectedDriveAsFolderNode,
    onAddFile,
    onCopyNode,
    onMoveNode,
  });

  // === FOLDER/FILE CHILDREN ===
  // Get current folder's contents
  const nodeIdForChildren = selectedNodeId === undefined ? null : selectedNodeId;
  const folderChildren = useFolderChildNodesForId(nodeIdForChildren);
  const fileChildren = useFileChildNodesForId(nodeIdForChildren);
  
  // All folders for the sidebar tree view
  const allFolders = nodes?.filter(n => n.kind === "folder") as FolderNode[] || [];

  // === EVENT HANDLERS ===
  // Customize document selection behavior here
  const handleFileSelect = useCallback((nodeId: string | undefined) => {
    if (!nodeId) return;
    const fileNode = nodes?.find(n => n.id === nodeId) as FileNode;
    if (fileNode) {
      onOpenDocument(fileNode);
    }
    setActiveDocumentId(nodeId);
  }, [nodes, onOpenDocument]);

  // Handle folder creation with optional name parameter
  const handleCreateFolder = useCallback(async (folderName?: string) => {
    let name: string | undefined = folderName;
    
    // If no name provided, prompt for it (for manual folder creation)
    if (!name) {
      const promptResult = prompt("Enter folder name:");
      name = promptResult || undefined;
    }
    
    if (name && name.trim()) {
      try {
        await onAddFolder(name.trim(), selectedFolder);
      } catch (error) {
        console.error("Failed to create folder:", error);
      }
    }
  }, [onAddFolder, selectedFolder]);

  // Close document editor and return to folder view
  const handleEditorClose = useCallback(() => {
    setActiveDocumentId(undefined);
  }, []);

  // Handle document creation from modal
  const onCreateDocument = useCallback(
    async (fileName: string) => {
      setOpenModal(false);

      const documentModel = selectedDocumentModel.current;
      if (!documentModel) return;

      try {
        const node = await addDocument(
          driveId,
          fileName,
          documentModel.documentModel.id,
          selectedNodeId,
        );

        selectedDocumentModel.current = null;
        
        if (node) {
          // Customize: Auto-open created document by uncommenting below
          // setActiveDocumentId(node.id);
        }
      } catch (error) {
        console.error("Failed to create document:", error);
      }
    },
    [addDocument, driveId, selectedNodeId],
  );

  // Handle document type selection for creation
  const onSelectDocumentModel = useCallback(
    (documentModel: DocumentModelModule) => {
      selectedDocumentModel.current = documentModel;
      setOpenModal(true);
    },
    [],
  );

  // Document revision handling (placeholder implementation)
  const onGetDocumentRevision = useCallback(
    (_options?: GetDocumentOptions) => {
      if (!activeDocumentId) return;
      return undefined;
    },
    [activeDocumentId],
  );

  // === DOCUMENT EDITOR DATA ===
  // Filter available document types here if needed
  const filteredDocumentModels = documentModels;

  // Get active document and its editor components
  const activeDocument = activeDocumentId
    ? fileChildren.find((file) => file.id === activeDocumentId)
    : undefined;

  const documentModelModule = activeDocument
    ? context.getDocumentModelModule(activeDocument.documentType)
    : null;

  const editorModule = activeDocument
    ? context.getEditor(activeDocument.documentType)
    : null;

  // === RENDER ===
  return (
    <div className="flex h-full">
      {/* === LEFT SIDEBAR: Folder Navigation === */}
      {/* Customize sidebar width by changing w-64 */}
      <div className="w-64 border-r border-gray-200 bg-white overflow-y-auto">
        <div className="p-4">
          {/* Customize sidebar title here */}
          <h2 className="text-lg font-semibold mb-4 text-gray-700">Drive Explorer</h2>
          
          {/* Folder tree navigation component */}
          <FolderTree
            folders={allFolders}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNode}
          />
        </div>
      </div>

      {/* === RIGHT CONTENT AREA: Files/Folders or Document Editor === */}
      <div 
        className={`flex-1 p-4 overflow-y-auto ${isDropTarget ? "bg-blue-50 border-2 border-dashed border-blue-300" : ""}`}
        {...dropProps}
      >
        {/* Conditional rendering: Document editor or folder contents */}
        {activeDocument && documentModelModule && editorModule ? (
          // Document editor view
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
          /* Folder contents view */
          <div className="space-y-6">
            {/* === HEADER SECTION === */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                {/* Folder title */}
                <h2 className="text-lg font-semibold">
                  {selectedFolder ? `Contents of "${selectedFolder.name}"` : "Root Contents"}
                </h2>
                {/* Customize: Add more action buttons here */}
                {isAllowedToCreateDocuments && (
                  <button
                    onClick={() => handleCreateFolder()}
                    className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                  >
                    + New Folder
                  </button>
                )}
              </div>
              
              {/* Navigation breadcrumbs */}
              {breadcrumbs.length > 1 && (
                <div className="border-b border-gray-200 pb-3">
                  <Breadcrumbs
                    breadcrumbs={breadcrumbs}
                    createEnabled={isAllowedToCreateDocuments}
                    onCreate={handleCreateFolder}
                    onBreadcrumbSelected={onBreadcrumbSelected}
                  />
                </div>
              )}
            </div>

            {/* === FOLDERS SECTION === */}
            {/* Customize grid layout by changing grid-cols-1 */}
            {folderChildren.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">📁 Folders</h3>
                <div className="grid grid-cols-1 gap-2">
                  {folderChildren.map((folderNode) => (
                    <FolderItem
                      key={folderNode.id}
                      folderNode={folderNode}
                      isAllowedToCreateDocuments={isAllowedToCreateDocuments}
                      sharingType={sharingType}
                      getSyncStatusSync={getSyncStatusSync}
                      setSelectedNode={setSelectedNode}
                      onAddFile={onAddFile}
                      onCopyNode={onCopyNode}
                      onMoveNode={onMoveNode}
                      onRenameNode={onRenameNode}
                      onDuplicateNode={onDuplicateNode}
                      onAddFolder={onAddFolderProp}
                      onAddAndSelectNewFolder={onAddAndSelectNewFolder}
                      showDeleteNodeModal={showDeleteNodeModal}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* === FILES/DOCUMENTS SECTION === */}
            {/* Customize grid layout by changing grid-cols-1 */}
            {fileChildren.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">📄 Documents</h3>
                <div className="grid grid-cols-1 gap-2">
                  {fileChildren.map((fileNode) => (
                    <FileItem
                      key={fileNode.id}
                      fileNode={fileNode}
                      isAllowedToCreateDocuments={isAllowedToCreateDocuments}
                      sharingType={sharingType}
                      getSyncStatusSync={getSyncStatusSync}
                      setSelectedNode={(nodeId) => handleFileSelect(nodeId)}
                      showDeleteNodeModal={showDeleteNodeModal}
                      onRenameNode={onRenameNode}
                      onDuplicateNode={onDuplicateNode}
                      onAddFile={onAddFile}
                      onCopyNode={onCopyNode}
                      onMoveNode={onMoveNode}
                      onAddFolder={onAddFolderProp}
                      onAddAndSelectNewFolder={onAddAndSelectNewFolder}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* === EMPTY STATE === */}
            {/* Customize empty state message and styling here */}
            {folderChildren.length === 0 && fileChildren.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg">📁 This folder is empty</p>
                <p className="text-sm mt-2">Create your first document or folder below</p>
              </div>
            )}

            {/* === DOCUMENT CREATION SECTION === */}
            {/* Component for creating new documents */}
            <CreateDocument
              createDocument={onSelectDocumentModel}
              documentModels={filteredDocumentModels}
            />
          </div>
        )}
      </div>

      {/* === DOCUMENT CREATION MODAL === */}
      {/* Modal for entering document name after selecting type */}
      <CreateDocumentModal
        onContinue={onCreateDocument}
        onOpenChange={(open) => setOpenModal(open)}
        open={openModal}
      />
    </div>
  );
}
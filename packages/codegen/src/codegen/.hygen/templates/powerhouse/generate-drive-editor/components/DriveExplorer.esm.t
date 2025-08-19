---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/components/DriveExplorer.tsx"
unless_exists: true
---
import {
  Breadcrumbs,
  CreateDocumentModal,
  FileItem,
  FolderItem,
  useBreadcrumbs,
} from "@powerhousedao/design-system";
import {
  addDocument,
  type DriveEditorProps,
  getSyncStatusSync,
  setSelectedNode,
  useAllFolderNodes,
  useDocumentModelModules,
  useDriveContext,
  useDriveSharingType,
  useEditorModules,
  useFileChildNodes,
  useFolderChildNodes,
  useSelectedDrive,
  useSelectedFolder,
  useSelectedNodePath,
  useUserPermissions,
} from "@powerhousedao/reactor-browser";
import type { DocumentModelModule } from "document-model";
import { useCallback, useRef, useState } from "react";
import { CreateDocument } from "./CreateDocument.jsx";
import { EditorContainer } from "./EditorContainer.jsx";
import { FolderTree } from "./FolderTree.jsx";

/**
 * Main drive explorer component with sidebar navigation and content area.
 * Layout: Left sidebar (folder tree) + Right content area (files/folders + document editor)
 */
export function DriveExplorer(props: DriveEditorProps) {
  // === DOCUMENT EDITOR STATE ===
  // Customize document opening/closing behavior here
  const [activeDocumentId, setActiveDocumentId] = useState<
    string | undefined
  >();
  const [openModal, setOpenModal] = useState(false);
  const selectedDocumentModel = useRef<DocumentModelModule | null>(null);
  const editorModules = useEditorModules();
  // === DRIVE CONTEXT HOOKS ===
  // Core drive operations and document models
  const {
    onAddFile,
    onAddFolder,
    onCopyNode,
    onDuplicateNode,
    onMoveNode,
    onRenameNode,
    showDeleteNodeModal,
  } = useDriveContext();

  const { isAllowedToCreateDocuments } = useUserPermissions();
  // === STATE MANAGEMENT HOOKS ===
  // Core state hooks for drive navigation
  const [selectedDrive] = useSelectedDrive(); // Currently selected drive
  const selectedFolder = useSelectedFolder(); // Currently selected folder
  const selectedNodePath = useSelectedNodePath();
  const sharingType = useDriveSharingType(selectedDrive?.header.id);

  // === NAVIGATION SETUP ===
  // Breadcrumbs for folder navigation
  const { breadcrumbs, onBreadcrumbSelected } = useBreadcrumbs({
    selectedNodePath,
    setSelectedNode,
  });

  const folderChildren = useFolderChildNodes();
  const fileChildren = useFileChildNodes();

  // All folders for the sidebar tree view
  const allFolders = useAllFolderNodes();

  // === EVENT HANDLERS ===

  // Handle folder creation with optional name parameter
  const handleCreateFolder = useCallback(
    async (folderName?: string) => {
      let name: string | undefined = folderName;

      // If no name provided, prompt for it (for manual folder creation)
      if (!name) {
        const promptResult = prompt("Enter folder name:");
        name = promptResult || undefined;
      }

      if (name?.trim()) {
        try {
          await onAddFolder(name.trim(), selectedFolder);
        } catch (error) {
          console.error("Failed to create folder:", error);
        }
      }
    },
    [onAddFolder, selectedFolder],
  );

  // Handle document creation from modal
  const onCreateDocument = useCallback(
    async (fileName: string) => {
      setOpenModal(false);

      const documentModel = selectedDocumentModel.current;
      if (!documentModel || !selectedDrive?.header.id) return;

      try {
        const node = await addDocument(
          selectedDrive.header.id,
          fileName,
          documentModel.documentModel.id,
          selectedFolder?.id,
          undefined,
          editorModules?.find((e) =>
            e.documentTypes.includes(documentModel.documentModel.id),
          )?.id,
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
    [addDocument, editorModules, selectedDrive?.header.id, selectedFolder?.id],
  );

  // === DOCUMENT EDITOR DATA ===
  // Filter available document types here if needed
  const documentModelModules = useDocumentModelModules();

  // Get active document and its editor components
  const activeDocument = activeDocumentId
    ? fileChildren.find((file) => file.id === activeDocumentId)
    : undefined;

  const documentModelModule = activeDocument
    ? documentModelModules?.find(
        (m) => m.documentModel.id === activeDocument.documentType,
      )
    : null;

  const editorModule = activeDocument
    ? editorModules?.find((e) =>
        e.documentTypes.includes(activeDocument.documentType),
      )
    : null;

  // === RENDER ===
  return (
    <div className="flex h-full">
      {/* === LEFT SIDEBAR: Folder Navigation === */}
      {/* Customize sidebar width by changing w-64 */}
      <div className="w-64 overflow-y-auto border-r border-gray-200 bg-white">
        <div className="p-4">
          {/* Customize sidebar title here */}
          <h2 className="mb-4 text-lg font-semibold text-gray-700">
            Drive Explorer
          </h2>

          {/* Folder tree navigation component */}
          <FolderTree folders={allFolders} onSelectNode={setSelectedNode} />
        </div>
      </div>

      {/* === RIGHT CONTENT AREA: Files/Folders or Document Editor === */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Conditional rendering: Document editor or folder contents */}
        {activeDocument && documentModelModule && editorModule ? (
          // Document editor view
          <EditorContainer handleClose={() => setActiveDocumentId(undefined)} />
        ) : (
          /* Folder contents view */
          <div className="space-y-6">
            {/* === HEADER SECTION === */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                {/* Folder title */}
                <h2 className="text-lg font-semibold">
                  {selectedFolder
                    ? `Contents of "${selectedFolder.name}"`
                    : "Root Contents"}
                </h2>
                {/* Customize: Add more action buttons here */}
                {isAllowedToCreateDocuments && (
                  <button
                    onClick={() => handleCreateFolder()}
                    className="rounded bg-blue-500 px-3 py-1 text-sm text-white hover:bg-blue-600"
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
                <h3 className="mb-2 text-sm font-medium text-gray-500">
                  📁 Folders
                </h3>
                <div className="grid grid-cols-1 gap-2">
                  {folderChildren.map((folderNode) => (
                    <FolderItem
                      key={folderNode.id}
                      folderNode={folderNode}
                      isAllowedToCreateDocuments={isAllowedToCreateDocuments}
                      sharingType={sharingType || "LOCAL"}
                      getSyncStatusSync={getSyncStatusSync}
                      setSelectedNode={setSelectedNode}
                      onAddFile={onAddFile}
                      onCopyNode={onCopyNode}
                      onMoveNode={onMoveNode}
                      onRenameNode={onRenameNode}
                      onDuplicateNode={onDuplicateNode}
                      onAddFolder={onAddFolder}
                      onAddAndSelectNewFolder={handleCreateFolder}
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
                <h3 className="mb-2 text-sm font-medium text-gray-500">
                  📄 Documents
                </h3>
                <div className="grid grid-cols-1 gap-2">
                  {fileChildren.map((fileNode) => (
                    <FileItem
                      key={fileNode.id}
                      fileNode={fileNode}
                      isAllowedToCreateDocuments={isAllowedToCreateDocuments}
                      sharingType={sharingType || "LOCAL"}
                      getSyncStatusSync={getSyncStatusSync}
                      setSelectedNode={setSelectedNode}
                      showDeleteNodeModal={showDeleteNodeModal}
                      onRenameNode={onRenameNode}
                      onDuplicateNode={onDuplicateNode}
                      onAddFile={onAddFile}
                      onCopyNode={onCopyNode}
                      onMoveNode={onMoveNode}
                      onAddFolder={onAddFolder}
                      onAddAndSelectNewFolder={handleCreateFolder}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* === EMPTY STATE === */}
            {/* Customize empty state message and styling here */}
            {folderChildren.length === 0 && fileChildren.length === 0 && (
              <div className="py-12 text-center text-gray-500">
                <p className="text-lg">📁 This folder is empty</p>
                <p className="mt-2 text-sm">
                  Create your first document or folder below
                </p>
              </div>
            )}

            {/* === DOCUMENT CREATION SECTION === */}
            {/* Component for creating new documents */}
            <CreateDocument />
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

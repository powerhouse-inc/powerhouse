---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/components/DriveExplorer.tsx"
unless_exists: true
---
import {
  Breadcrumbs,
  Button,
  FileItem,
  FolderItem,
  useBreadcrumbs,
} from "@powerhousedao/design-system";
import {
  getDriveSharingType,
  getSyncStatusSync,
  isFileNodeKind,
  isFolderNodeKind,
  setSelectedNode,
  showDeleteNodeModal,
  useNodeActions,
  useNodesInSelectedDrive,
  useNodesInSelectedDriveOrFolder,
  useSelectedDrive,
  useSelectedFolder,
  useSelectedNodePath,
  useUserPermissions,
} from "@powerhousedao/reactor-browser";
import type { EditorProps } from "document-model";
import { useCallback } from "react";
import { CreateDocument } from "./CreateDocument.js";
import { FolderTree } from "./FolderTree.js";

/**
 * Main drive explorer component with sidebar navigation and content area.
 * Layout: Left sidebar (folder tree) + Right content area (files/folders + document editor)
 */
export function DriveExplorer(props: EditorProps) {
  const { children } = props;

  // === DRIVE CONTEXT HOOKS ===
  // Core drive operations and document models
  const {
    onAddFile,
    onAddFolder,
    onCopyNode,
    onDuplicateNode,
    onMoveNode,
    onRenameNode,
  } = useNodeActions();
  const { isAllowedToCreateDocuments } = useUserPermissions();
  // === STATE MANAGEMENT HOOKS ===
  // Core state hooks for drive navigation
  const [selectedDrive] = useSelectedDrive(); // Currently selected drive
  const selectedFolder = useSelectedFolder(); // Currently selected folder
  const selectedNodePath = useSelectedNodePath();
  const sharingType = getDriveSharingType(selectedDrive);

  // === NAVIGATION SETUP ===
  // Breadcrumbs for folder navigation
  const { breadcrumbs, onBreadcrumbSelected } = useBreadcrumbs({
    selectedNodePath,
    setSelectedNode,
  });

  const allNodes = useNodesInSelectedDrive();
  const childNodes = useNodesInSelectedDriveOrFolder();
  const folderChildren = childNodes.filter((n) => isFolderNodeKind(n));
  const fileChildren = childNodes.filter((n) => isFileNodeKind(n));

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

  // if a document is selected then it's editor will be passed as children
  const showDocumentEditor = !!children;

  // === RENDER ===
  return (
    <div className="flex h-full">
      {/* === LEFT SIDEBAR: Folder and File Navigation === */}
      {/* Sidebar component manages its own width, styling, and overflow */}
      <FolderTree />

      {/* === RIGHT CONTENT AREA: Files/Folders or Document Editor === */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Conditional rendering: Document editor or folder contents */}
        {showDocumentEditor ? (
          // Document editor view
          children
        ) : (
          /* Folder contents view */
          <div className="space-y-6 px-6">
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
                  <Button
                    onClick={() => handleCreateFolder()}
                    className="bg-gray-200 p-2 hover:bg-gray-300"
                  >
                    New Folder
                  </Button>
                )}
              </div>

              {/* Navigation breadcrumbs */}
              <div className="border-b border-gray-200 pb-3">
                <Breadcrumbs
                  breadcrumbs={breadcrumbs}
                  createEnabled={isAllowedToCreateDocuments}
                  onCreate={handleCreateFolder}
                  onBreadcrumbSelected={onBreadcrumbSelected}
                />
              </div>
            </div>

            {/* === FOLDERS SECTION === */}
            {folderChildren.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-bold text-gray-600">
                  Folders
                </h3>
                <div className="flex flex-wrap gap-4">
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
                      onAddFolder={onAddFolder}
                      onAddAndSelectNewFolder={handleCreateFolder}
                      showDeleteNodeModal={showDeleteNodeModal}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* === FILES/DOCUMENTS SECTION === */}
            {fileChildren.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-gray-600">
                  Documents
                </h3>
                <div className="flex flex-wrap gap-4">
                  {fileChildren.map((fileNode) => (
                    <FileItem
                      key={fileNode.id}
                      fileNode={fileNode}
                      isAllowedToCreateDocuments={isAllowedToCreateDocuments}
                      sharingType={sharingType}
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
                <p className="text-lg">This folder is empty</p>
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
    </div>
  );
}

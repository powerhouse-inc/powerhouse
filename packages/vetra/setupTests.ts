import "@testing-library/jest-dom";
import { vi } from "vitest";

vi.mock("@powerhousedao/reactor-browser", () => ({
  // Mock hooks
  useSelectedDocument: vi.fn(() => [null, vi.fn()]),
  useSetPHDocumentEditorConfig: vi.fn(),
  useSetPHDriveEditorConfig: vi.fn(),
  useDocumentById: vi.fn(() => [null, vi.fn()]),
  useDocumentTimeline: vi.fn(() => []),
  useNodeParentFolderById: vi.fn(() => null),
  useSelectedNode: vi.fn(() => null),
  useSelectedDrive: vi.fn(() => null),
  useSelectedDocumentId: vi.fn(() => null),
  useAllDocuments: vi.fn(() => []),
  useDrives: vi.fn(() => []),
  useFolderById: vi.fn(() => null),
  useNodeById: vi.fn(() => null),
  usePHModal: vi.fn(() => null),
  useReactor: vi.fn(() => null),
  useGetSwitchboardLink: vi.fn(() => null),
  useNodeActions: vi.fn(() => ({
    addDocument: vi.fn(),
    addFolder: vi.fn(),
    deleteNode: vi.fn(),
    renameNode: vi.fn(),
  })),

  // Mock action functions
  setSelectedNode: vi.fn(),
  setSelectedTimelineItem: vi.fn(),
  showRevisionHistory: vi.fn(),
  exportDocument: vi.fn(),
  setSelectedDrive: vi.fn(),
  showPHModal: vi.fn(),
  closePHModal: vi.fn(),
  addFolder: vi.fn(() => Promise.resolve()),
  addDocument: vi.fn(() => Promise.resolve()),
  deleteNode: vi.fn(() => Promise.resolve()),
  exportFile: vi.fn(() => Promise.resolve()),
  setAllDocuments: vi.fn(),
  setDrives: vi.fn(),
  setVetraPackages: vi.fn(),

  // Mock config setters
  setPHDocumentEditorConfig: vi.fn(),
  setPHDriveEditorConfig: vi.fn(),
  setPHGlobalConfig: vi.fn(),
}));

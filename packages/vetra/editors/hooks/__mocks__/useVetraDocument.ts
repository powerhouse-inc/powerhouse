import { vi } from "vitest";

export const useSelectedDriveVetraPackage = vi.fn(() => {
  const mockDocument = {
    state: {
      global: {
        name: null,
        description: null,
        category: null,
        author: {
          name: null,
          website: null,
        },
        keywords: [],
        githubUrl: null,
        npmUrl: null,
      },
    },
  };
  const mockDispatch = vi.fn();
  return [mockDocument, mockDispatch];
});

export const useSelectedAppModuleDocument = vi.fn(() => {
  const mockDocument = {
    state: {
      global: {
        name: "",
        status: "DRAFT" as const,
        documentTypes: null,
        dragAndDrop: null,
      },
    },
  };
  const mockDispatch = vi.fn();
  return [mockDocument, mockDispatch];
});

export const useSelectedDocumentEditorDocument = vi.fn(() => {
  const mockDocument = {
    state: {
      global: {
        name: "",
        status: "DRAFT" as const,
        documentTypes: [],
      },
    },
  };
  const mockDispatch = vi.fn();
  return [mockDocument, mockDispatch];
});

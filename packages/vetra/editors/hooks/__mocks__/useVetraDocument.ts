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

import { vi } from "vitest";

export const useAvailableDocumentTypes = vi.fn(() => {
  return [
    "powerhouse/document-model",
    "powerhouse/budget-statement",
    "powerhouse/project-tracker",
  ];
});

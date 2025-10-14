import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSelectedDocumentEditorDocument } from "../hooks/useVetraDocument.js";
import { Editor } from "./editor.js";

describe("DocumentEditor Editor", () => {
  let mockDispatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockDispatch = vi.fn();
    vi.mocked(useSelectedDocumentEditorDocument).mockReturnValue([
      {
        state: {
          global: {
            name: "",
            status: "DRAFT",
            documentTypes: [],
          },
        },
      },
      mockDispatch,
    ] as any);
  });

  describe("Core Rendering", () => {
    it("should render all main form sections and labels", () => {
      render(<Editor />);

      expect(screen.getByText("Editor Configuration")).toBeInTheDocument();
      expect(screen.getByText("Editor Name")).toBeInTheDocument();
      expect(screen.getByText("Supported Document Types")).toBeInTheDocument();
      expect(screen.getByText("Confirm")).toBeInTheDocument();
    });

    it("should display existing editor data when document has values", () => {
      vi.mocked(useSelectedDocumentEditorDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "test-editor",
              status: "DRAFT",
              documentTypes: [
                { id: "dt-1", documentType: "powerhouse/document-model" },
              ],
            },
          },
        },
        mockDispatch,
      ] as any);

      render(<Editor />);

      expect(screen.getByDisplayValue("test-editor")).toBeInTheDocument();
      // Check that the document type appears in the list (not just in dropdown)
      const documentTypeElements = screen.getAllByText(
        "powerhouse/document-model",
      );
      expect(documentTypeElements.length).toBeGreaterThan(0);
    });
  });

  describe("Editor Name Input", () => {
    it("should dispatch setEditorName when name changes (debounced)", async () => {
      const user = userEvent.setup();
      render(<Editor />);

      const nameInput = screen.getByLabelText("Editor Name");
      await user.type(nameInput, "new-editor");

      await waitFor(
        () => {
          expect(mockDispatch).toHaveBeenCalledWith(
            expect.objectContaining({
              type: "SET_EDITOR_NAME",
              input: { name: "new-editor" },
            }),
          );
        },
        { timeout: 500 },
      );
    });

    it("should NOT dispatch when new value equals current value", async () => {
      vi.mocked(useSelectedDocumentEditorDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "existing-editor",
              status: "DRAFT",
              documentTypes: [],
            },
          },
        },
        mockDispatch,
      ] as any);

      const user = userEvent.setup();
      render(<Editor />);

      const nameInput = screen.getByLabelText("Editor Name");
      await user.clear(nameInput);
      await user.type(nameInput, "existing-editor");

      await waitFor(() => {
        expect(mockDispatch).not.toHaveBeenCalled();
      });
    });

    it("should NOT dispatch when both old and new values are empty", async () => {
      const user = userEvent.setup();
      render(<Editor />);

      const nameInput = screen.getByLabelText("Editor Name");
      await user.click(nameInput);
      await user.tab();

      await waitFor(() => {
        expect(mockDispatch).not.toHaveBeenCalled();
      });
    });
  });

  describe("Document Types Management", () => {
    it("should add document type from dropdown", async () => {
      const user = userEvent.setup();
      render(<Editor />);

      const select = screen.getByLabelText("Supported Document Types");
      await user.selectOptions(select, "powerhouse/document-model");

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "ADD_DOCUMENT_TYPE",
          input: expect.objectContaining({
            documentType: "powerhouse/document-model",
            id: expect.any(String),
          }),
        }),
      );
    });

    it("should replace existing document type when adding new one", async () => {
      vi.mocked(useSelectedDocumentEditorDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "test-editor",
              status: "DRAFT",
              documentTypes: [
                { id: "dt-1", documentType: "powerhouse/document-model" },
              ],
            },
          },
        },
        mockDispatch,
      ] as any);

      const user = userEvent.setup();
      render(<Editor />);

      const select = screen.getByLabelText("Supported Document Types");
      await user.selectOptions(select, "powerhouse/budget-statement");

      // Should first remove the existing type
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "REMOVE_DOCUMENT_TYPE",
          input: { id: "dt-1" },
        }),
      );

      // Then add the new type
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "ADD_DOCUMENT_TYPE",
          input: expect.objectContaining({
            documentType: "powerhouse/budget-statement",
            id: expect.any(String),
          }),
        }),
      );
    });

    it("should remove document type", async () => {
      vi.mocked(useSelectedDocumentEditorDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "test-editor",
              status: "DRAFT",
              documentTypes: [
                { id: "dt-1", documentType: "powerhouse/document-model" },
              ],
            },
          },
        },
        mockDispatch,
      ] as any);

      const user = userEvent.setup();
      render(<Editor />);

      // Get all instances of the document type text (dropdown + list)
      const documentModelElements = screen.getAllByText(
        "powerhouse/document-model",
      );
      // The second one should be in the list (first is in dropdown)
      const listItem = documentModelElements[1];
      const removeButton = listItem.parentElement?.querySelector("button");

      if (removeButton) {
        await user.click(removeButton);
      }

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "REMOVE_DOCUMENT_TYPE",
          input: { id: "dt-1" },
        }),
      );
    });

    it("should display existing document type", () => {
      vi.mocked(useSelectedDocumentEditorDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "test-editor",
              status: "DRAFT",
              documentTypes: [
                { id: "dt-1", documentType: "powerhouse/document-model" },
              ],
            },
          },
        },
        mockDispatch,
      ] as any);

      render(<Editor />);

      // Check that the document type appears (it will be in both dropdown and list)
      const documentTypeElements = screen.getAllByText(
        "powerhouse/document-model",
      );
      expect(documentTypeElements.length).toBeGreaterThan(0);
    });

    it("should show available document types in dropdown", () => {
      render(<Editor />);

      const select = screen.getByLabelText("Supported Document Types");
      const options = Array.from(select.querySelectorAll("option")).map(
        (opt) => opt.value,
      );

      expect(options).toContain("powerhouse/document-model");
      expect(options).toContain("powerhouse/budget-statement");
      expect(options).toContain("powerhouse/project-tracker");
    });
  });

  describe("Confirm Button", () => {
    it("should dispatch setEditorStatus when confirm clicked", async () => {
      vi.mocked(useSelectedDocumentEditorDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "test-editor",
              status: "DRAFT",
              documentTypes: [
                { id: "dt-1", documentType: "powerhouse/document-model" },
              ],
            },
          },
        },
        mockDispatch,
      ] as any);

      const user = userEvent.setup();
      render(<Editor />);

      const confirmButton = screen.getByText("Confirm");
      await user.click(confirmButton);

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SET_EDITOR_STATUS",
          input: { status: "CONFIRMED" },
        }),
      );
    });

    it("should be disabled when editor name is empty", () => {
      vi.mocked(useSelectedDocumentEditorDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "",
              status: "DRAFT",
              documentTypes: [
                { id: "dt-1", documentType: "powerhouse/document-model" },
              ],
            },
          },
        },
        mockDispatch,
      ] as any);

      render(<Editor />);

      const confirmButton = screen.getByText("Confirm");
      expect(confirmButton).toBeDisabled();
    });

    it("should be disabled when no document types selected", () => {
      vi.mocked(useSelectedDocumentEditorDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "test-editor",
              status: "DRAFT",
              documentTypes: [],
            },
          },
        },
        mockDispatch,
      ] as any);

      render(<Editor />);

      const confirmButton = screen.getByText("Confirm");
      expect(confirmButton).toBeDisabled();
    });

    it("should be hidden when status is CONFIRMED", () => {
      vi.mocked(useSelectedDocumentEditorDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "test-editor",
              status: "CONFIRMED",
              documentTypes: [
                { id: "dt-1", documentType: "powerhouse/document-model" },
              ],
            },
          },
        },
        mockDispatch,
      ] as any);

      render(<Editor />);

      const confirmButton = screen.queryByText("Confirm");
      expect(confirmButton).not.toBeInTheDocument();
    });
  });

  describe("Read-only Mode", () => {
    it("should disable form fields when status is CONFIRMED", () => {
      vi.mocked(useSelectedDocumentEditorDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "test-editor",
              status: "CONFIRMED",
              documentTypes: [
                { id: "dt-1", documentType: "powerhouse/document-model" },
              ],
            },
          },
        },
        mockDispatch,
      ] as any);

      render(<Editor />);

      const nameInput = screen.getByLabelText("Editor Name");
      expect(nameInput).toBeDisabled();

      // Document types dropdown should not be visible in read-only mode
      const select = screen.queryByLabelText("Supported Document Types");
      expect(select).not.toBeInTheDocument();

      // Remove button should not be visible
      const removeButtons = screen.queryAllByText("×");
      expect(removeButtons).toHaveLength(0);
    });

    it("should enable form fields when status is DRAFT", () => {
      vi.mocked(useSelectedDocumentEditorDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "test-editor",
              status: "DRAFT",
              documentTypes: [
                { id: "dt-1", documentType: "powerhouse/document-model" },
              ],
            },
          },
        },
        mockDispatch,
      ] as any);

      render(<Editor />);

      const nameInput = screen.getByLabelText("Editor Name");
      expect(nameInput).not.toBeDisabled();

      // Document types dropdown should be visible
      const select = screen.getByLabelText("Supported Document Types");
      expect(select).toBeInTheDocument();

      // Remove button should be visible
      const removeButtons = screen.queryAllByText("×");
      expect(removeButtons.length).toBeGreaterThan(0);
    });
  });
});

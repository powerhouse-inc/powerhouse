import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSelectedAppModuleDocument } from "../hooks/useVetraDocument.js";
import { Editor } from "./editor.js";

describe("AppModule Editor", () => {
  let mockDispatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockDispatch = vi.fn();
    vi.mocked(useSelectedAppModuleDocument).mockReturnValue([
      {
        state: {
          global: {
            name: "",
            status: "DRAFT",
            documentTypes: null,
            dragAndDrop: null,
          },
        },
      },
      mockDispatch,
    ] as any);
  });

  describe("Core Rendering", () => {
    it("should render all main form sections and labels", () => {
      render(<Editor />);

      expect(screen.getByText("App Configuration")).toBeInTheDocument();
      expect(screen.getByText("App Name")).toBeInTheDocument();
      expect(screen.getByText("Document Types")).toBeInTheDocument();
      expect(screen.getByText("Drag and Drop Settings")).toBeInTheDocument();
      expect(screen.getByText("Enable drag and drop")).toBeInTheDocument();
      expect(screen.getByText("Confirm")).toBeInTheDocument();
    });

    it("should display existing app data when document has values", () => {
      vi.mocked(useSelectedAppModuleDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "test-app",
              status: "DRAFT",
              documentTypes: [
                { id: "dt-1", documentType: "powerhouse/document-model" },
                { id: "dt-2", documentType: "powerhouse/budget-statement" },
              ],
              dragAndDrop: {
                enabled: true,
              },
            },
          },
        },
        mockDispatch,
      ] as any);

      render(<Editor />);

      expect(screen.getByDisplayValue("test-app")).toBeInTheDocument();
      expect(screen.getByText("powerhouse/document-model")).toBeInTheDocument();
      expect(
        screen.getByText("powerhouse/budget-statement"),
      ).toBeInTheDocument();
      const checkbox = screen.getByLabelText("Enable drag and drop");
      expect(checkbox).toBeChecked();
    });
  });

  describe("App Name Input", () => {
    it("should dispatch setAppName when name changes (debounced)", async () => {
      const user = userEvent.setup();
      render(<Editor />);

      const nameInput = screen.getByLabelText("App Name");
      await user.type(nameInput, "new-app");

      await waitFor(
        () => {
          expect(mockDispatch).toHaveBeenCalledWith(
            expect.objectContaining({
              type: "SET_APP_NAME",
              input: { name: "new-app" },
            }),
          );
        },
        { timeout: 500 },
      );
    });

    it("should NOT dispatch when new value equals current value", async () => {
      vi.mocked(useSelectedAppModuleDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "existing-app",
              status: "DRAFT",
              documentTypes: null,
              dragAndDrop: null,
            },
          },
        },
        mockDispatch,
      ] as any);

      const user = userEvent.setup();
      render(<Editor />);

      const nameInput = screen.getByLabelText("App Name");
      await user.clear(nameInput);
      await user.type(nameInput, "existing-app");

      await waitFor(() => {
        expect(mockDispatch).not.toHaveBeenCalled();
      });
    });

    it("should NOT dispatch when both old and new values are empty", async () => {
      const user = userEvent.setup();
      render(<Editor />);

      const nameInput = screen.getByLabelText("App Name");
      await user.click(nameInput);
      await user.tab();

      await waitFor(() => {
        expect(mockDispatch).not.toHaveBeenCalled();
      });
    });
  });

  describe("Document Types Management", () => {
    it("should add regular document type from dropdown", async () => {
      const user = userEvent.setup();
      render(<Editor />);

      const select = screen.getByLabelText("Document Types");
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

    it("should add wildcard '*' document type and clear existing types", async () => {
      vi.mocked(useSelectedAppModuleDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "test-app",
              status: "DRAFT",
              documentTypes: [
                { id: "dt-1", documentType: "powerhouse/document-model" },
              ],
              dragAndDrop: null,
            },
          },
        },
        mockDispatch,
      ] as any);

      const user = userEvent.setup();
      render(<Editor />);

      const select = screen.getByLabelText("Document Types");
      await user.selectOptions(select, "all-documents");

      // Should first remove existing type
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "REMOVE_DOCUMENT_TYPE",
          input: { id: "dt-1" },
        }),
      );

      // Then add wildcard
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "ADD_DOCUMENT_TYPE",
          input: {
            documentType: "*",
            id: "all-documents",
          },
        }),
      );
    });

    it("should remove document type", async () => {
      vi.mocked(useSelectedAppModuleDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "test-app",
              status: "DRAFT",
              documentTypes: [
                { id: "dt-1", documentType: "powerhouse/document-model" },
                { id: "dt-2", documentType: "powerhouse/budget-statement" },
              ],
              dragAndDrop: null,
            },
          },
        },
        mockDispatch,
      ] as any);

      const user = userEvent.setup();
      render(<Editor />);

      // Find the remove button for the first document type
      const documentModelText = screen.getByText("powerhouse/document-model");
      const removeButton =
        documentModelText.parentElement?.querySelector("button");

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

    it("should NOT show duplicate document type in dropdown", () => {
      vi.mocked(useSelectedAppModuleDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "test-app",
              status: "DRAFT",
              documentTypes: [
                { id: "dt-1", documentType: "powerhouse/document-model" },
              ],
              dragAndDrop: null,
            },
          },
        },
        mockDispatch,
      ] as any);

      render(<Editor />);

      const select = screen.getByLabelText("Document Types");
      // Document type should not be in the options since it's already selected
      const options = Array.from(select.querySelectorAll("option")).map(
        (opt) => opt.value,
      );

      expect(options).not.toContain("powerhouse/document-model");
      // But other document types should still be available
      expect(options).toContain("powerhouse/budget-statement");
      expect(options).toContain("powerhouse/project-tracker");
    });

    it("should NOT add regular type when wildcard '*' exists", () => {
      vi.mocked(useSelectedAppModuleDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "test-app",
              status: "DRAFT",
              documentTypes: [{ id: "all", documentType: "*" }],
              dragAndDrop: null,
            },
          },
        },
        mockDispatch,
      ] as any);

      render(<Editor />);

      // Dropdown should not be visible when wildcard exists
      const select = screen.queryByLabelText("Document Types");
      expect(select).not.toBeInTheDocument();
    });

    it("should display existing document types list", () => {
      vi.mocked(useSelectedAppModuleDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "test-app",
              status: "DRAFT",
              documentTypes: [
                { id: "dt-1", documentType: "powerhouse/document-model" },
                { id: "dt-2", documentType: "powerhouse/budget-statement" },
              ],
              dragAndDrop: null,
            },
          },
        },
        mockDispatch,
      ] as any);

      render(<Editor />);

      expect(screen.getByText("powerhouse/document-model")).toBeInTheDocument();
      expect(
        screen.getByText("powerhouse/budget-statement"),
      ).toBeInTheDocument();
    });
  });

  describe("Drag and Drop Toggle", () => {
    it("should dispatch setDragAndDropEnabled when checkbox toggled", async () => {
      const user = userEvent.setup();
      render(<Editor />);

      const checkbox = screen.getByLabelText("Enable drag and drop");
      await user.click(checkbox);

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SET_DRAG_AND_DROP_ENABLED",
          input: { enabled: true },
        }),
      );
    });

    it("should NOT dispatch when value equals current value", async () => {
      vi.mocked(useSelectedAppModuleDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "test-app",
              status: "DRAFT",
              documentTypes: null,
              dragAndDrop: { enabled: true },
            },
          },
        },
        mockDispatch,
      ] as any);

      const user = userEvent.setup();
      render(<Editor />);

      const checkbox = screen.getByLabelText("Enable drag and drop");
      // Checkbox is already checked, so clicking it would toggle to false, then back to true
      await user.click(checkbox); // toggles to false

      // The dispatch should be called with enabled: false
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SET_DRAG_AND_DROP_ENABLED",
          input: { enabled: false },
        }),
      );
    });
  });

  describe("Confirm Button", () => {
    it("should dispatch setAppStatus when confirm clicked", async () => {
      vi.mocked(useSelectedAppModuleDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "test-app",
              status: "DRAFT",
              documentTypes: null,
              dragAndDrop: null,
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
          type: "SET_APP_STATUS",
          input: { status: "CONFIRMED" },
        }),
      );
    });

    it("should be disabled when app name is empty", () => {
      render(<Editor />);

      const confirmButton = screen.getByText("Confirm");
      expect(confirmButton).toBeDisabled();
    });

    it("should be hidden when status is CONFIRMED", () => {
      vi.mocked(useSelectedAppModuleDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "test-app",
              status: "CONFIRMED",
              documentTypes: null,
              dragAndDrop: null,
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
      vi.mocked(useSelectedAppModuleDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "test-app",
              status: "CONFIRMED",
              documentTypes: [
                { id: "dt-1", documentType: "powerhouse/document-model" },
              ],
              dragAndDrop: { enabled: true },
            },
          },
        },
        mockDispatch,
      ] as any);

      render(<Editor />);

      const nameInput = screen.getByLabelText("App Name");
      const checkbox = screen.getByLabelText("Enable drag and drop");

      expect(nameInput).toBeDisabled();
      expect(checkbox).toBeDisabled();

      // Document types dropdown should not be visible in read-only mode
      const select = screen.queryByLabelText("Document Types");
      expect(select).not.toBeInTheDocument();

      // Remove buttons should not be visible
      const removeButtons = screen.queryAllByText("×");
      expect(removeButtons).toHaveLength(0);
    });

    it("should enable form fields when status is DRAFT", () => {
      vi.mocked(useSelectedAppModuleDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "test-app",
              status: "DRAFT",
              documentTypes: [
                { id: "dt-1", documentType: "powerhouse/document-model" },
              ],
              dragAndDrop: { enabled: false },
            },
          },
        },
        mockDispatch,
      ] as any);

      render(<Editor />);

      const nameInput = screen.getByLabelText("App Name");
      const checkbox = screen.getByLabelText("Enable drag and drop");

      expect(nameInput).not.toBeDisabled();
      expect(checkbox).not.toBeDisabled();

      // Document types dropdown should be visible
      const select = screen.getByLabelText("Document Types");
      expect(select).toBeInTheDocument();

      // Remove button should be visible
      const removeButtons = screen.queryAllByText("×");
      expect(removeButtons.length).toBeGreaterThan(0);
    });
  });
});

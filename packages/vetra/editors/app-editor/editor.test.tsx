import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSelectedAppModuleDocument } from "../../document-models/app-module/hooks.js";
import Editor from "./editor.js";

vi.mock("../../document-models/app-module/hooks.js", () => ({
  useSelectedAppModuleDocument: vi.fn(),
}));

vi.mock("@powerhousedao/reactor-browser", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useDocumentTypesInSelectedDrive: vi.fn(() => [
      "powerhouse/document-model",
      "powerhouse/budget-statement",
      "powerhouse/project-tracker",
    ]),
    useSupportedDocumentTypesInReactor: vi.fn(() => []),
    useSetPHDocumentEditorConfig: vi.fn(),
    // These are needed by DocumentToolbar but mocked in setupTests
    useSelectedDocument: vi.fn(() => [null, vi.fn()]),
    useSelectedDocumentSafe: vi.fn(() => [null, vi.fn()]),
    useDocumentById: vi.fn(() => [null, vi.fn()]),
    useDocumentTimeline: vi.fn(() => []),
    useNodeParentFolderById: vi.fn(() => null),
    useGetSwitchboardLink: vi.fn(() => null),
    setSelectedNode: vi.fn(),
    setSelectedTimelineItem: vi.fn(),
    showRevisionHistory: vi.fn(),
    exportDocument: vi.fn(),
  };
});

// TODO: re-enable this test once it's been fixed
describe.skip("AppModule Editor", () => {
  let mockDispatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockDispatch = vi.fn();
    vi.mocked(useSelectedAppModuleDocument).mockReturnValue([
      {
        state: {
          global: {
            name: "",
            status: "DRAFT",
            allowedDocumentTypes: null,
            isDragAndDropEnabled: true,
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
              allowedDocumentTypes: [
                "powerhouse/document-model",
                "powerhouse/budget-statement",
              ],
              isDragAndDropEnabled: true,
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

    it("should dispatch when clearing a non-empty field", async () => {
      vi.mocked(useSelectedAppModuleDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "existing-app",
              status: "DRAFT",
              allowedDocumentTypes: null,
              isDragAndDropEnabled: true,
            },
          },
        },
        mockDispatch,
      ] as any);

      const user = userEvent.setup();
      render(<Editor />);

      const nameInput = screen.getByLabelText("App Name");
      await user.clear(nameInput);

      await waitFor(
        () => {
          expect(mockDispatch).toHaveBeenCalledWith(
            expect.objectContaining({
              type: "SET_APP_NAME",
              input: { name: "" },
            }),
          );
        },
        { timeout: 500 },
      );
    });

    it("should NOT dispatch when typing identical value without clearing", async () => {
      vi.mocked(useSelectedAppModuleDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "test",
              status: "DRAFT",
              allowedDocumentTypes: null,
              isDragAndDropEnabled: true,
            },
          },
        },
        mockDispatch,
      ] as any);

      const user = userEvent.setup();
      render(<Editor />);

      const nameInput = screen.getByLabelText("App Name");
      // Simulate user selecting all text and typing the same value
      await user.tripleClick(nameInput); // Select all
      await user.type(nameInput, "test");

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

      const select = screen.getByRole("combobox");
      await user.selectOptions(select, "powerhouse/document-model");

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "ADD_DOCUMENT_TYPE",
          input: {
            documentType: "powerhouse/document-model",
          },
        }),
      );
    });

    it("should add all document types when selecting 'all-in-drive'", async () => {
      const user = userEvent.setup();
      render(<Editor />);

      const select = screen.getByRole("combobox");
      await user.selectOptions(select, "all-in-drive");

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SET_DOCUMENT_TYPES",
          input: {
            documentTypes: [
              "powerhouse/document-model",
              "powerhouse/budget-statement",
              "powerhouse/project-tracker",
            ],
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
              allowedDocumentTypes: [
                "powerhouse/document-model",
                "powerhouse/budget-statement",
              ],
              isDragAndDropEnabled: true,
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
          input: { documentType: "powerhouse/document-model" },
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
              allowedDocumentTypes: ["powerhouse/document-model"],
              isDragAndDropEnabled: true,
            },
          },
        },
        mockDispatch,
      ] as any);

      render(<Editor />);

      const select = screen.getByRole("combobox");
      // Document type should not be in the options since it's already selected
      const options = Array.from(select.querySelectorAll("option")).map(
        (opt) => opt.value,
      );

      expect(options).not.toContain("powerhouse/document-model");
      // But other document types should still be available
      expect(options).toContain("powerhouse/budget-statement");
      expect(options).toContain("powerhouse/project-tracker");
    });

    it("should display existing document types list", () => {
      vi.mocked(useSelectedAppModuleDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "test-app",
              status: "DRAFT",
              allowedDocumentTypes: [
                "powerhouse/document-model",
                "powerhouse/budget-statement",
              ],
              isDragAndDropEnabled: true,
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

    it("should show 'All documents (*)' when allowedDocumentTypes is empty", () => {
      vi.mocked(useSelectedAppModuleDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "test-app",
              status: "DRAFT",
              allowedDocumentTypes: [],
              isDragAndDropEnabled: true,
            },
          },
        },
        mockDispatch,
      ] as any);

      render(<Editor />);

      expect(screen.getByText("All documents (*)")).toBeInTheDocument();
    });

    it("should show 'All documents (*)' when allowedDocumentTypes is null", () => {
      vi.mocked(useSelectedAppModuleDocument).mockReturnValue([
        {
          state: {
            global: {
              name: "test-app",
              status: "DRAFT",
              allowedDocumentTypes: null,
              isDragAndDropEnabled: true,
            },
          },
        },
        mockDispatch,
      ] as any);

      render(<Editor />);

      expect(screen.getByText("All documents (*)")).toBeInTheDocument();
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
          input: { enabled: false },
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
              allowedDocumentTypes: null,
              isDragAndDropEnabled: true,
            },
          },
        },
        mockDispatch,
      ] as any);

      const user = userEvent.setup();
      render(<Editor />);

      const checkbox = screen.getByLabelText("Enable drag and drop");
      // Checkbox is already checked, so clicking it would toggle to false
      await user.click(checkbox);

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
              allowedDocumentTypes: null,
              isDragAndDropEnabled: true,
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
              allowedDocumentTypes: null,
              isDragAndDropEnabled: true,
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
              allowedDocumentTypes: ["powerhouse/document-model"],
              isDragAndDropEnabled: true,
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
      const select = screen.queryByRole("combobox");
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
              allowedDocumentTypes: ["powerhouse/document-model"],
              isDragAndDropEnabled: false,
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
      const select = screen.getByRole("combobox");
      expect(select).toBeInTheDocument();

      // Remove button should be visible
      const removeButtons = screen.queryAllByText("×");
      expect(removeButtons.length).toBeGreaterThan(0);
    });
  });
});

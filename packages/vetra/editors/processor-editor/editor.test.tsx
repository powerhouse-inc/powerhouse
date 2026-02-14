import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { utils } from "../../document-models/processor-module/utils.js";
import { useSelectedProcessorModuleDocument } from "../hooks/useVetraDocument.js";
import Editor from "./editor.js";

vi.mock("../hooks/useVetraDocument.js", () => ({
  useSelectedProcessorModuleDocument: vi.fn(),
}));

vi.mock("../hooks/useAvailableDocumentTypes.js", () => ({
  useAvailableDocumentTypes: vi.fn(() => [
    "powerhouse/document-model",
    "powerhouse/budget-statement",
    "powerhouse/project-tracker",
  ]),
}));

describe("ProcessorModule Editor", () => {
  let mockDispatch: ReturnType<typeof vi.fn>;
  const document = utils.createDocument();

  beforeEach(() => {
    mockDispatch = vi.fn();
    vi.mocked(useSelectedProcessorModuleDocument).mockReturnValue([
      document,
      mockDispatch,
    ]);
  });

  describe("Core Rendering", () => {
    it("should render all main form sections and labels", () => {
      render(<Editor />);

      expect(screen.getByText("Processor Configuration")).toBeInTheDocument();
      expect(screen.getByText("Processor Name")).toBeInTheDocument();
      expect(screen.getByText("Type")).toBeInTheDocument();
      expect(screen.getByText("Document Types")).toBeInTheDocument();
      expect(screen.getByText("Confirm")).toBeInTheDocument();
    });

    it("should display existing processor data when document has values", () => {
      const document = utils.createDocument({
        global: {
          name: "test-processor",
          type: "analytics",
          status: "DRAFT",
          documentTypes: [
            { id: "dt-1", documentType: "powerhouse/document-model" },
            { id: "dt-2", documentType: "powerhouse/budget-statement" },
          ],
          processorApps: ["connect"],
        },
      });

      vi.mocked(useSelectedProcessorModuleDocument).mockReturnValue([
        document,
        mockDispatch,
      ]);

      render(<Editor />);

      expect(screen.getByDisplayValue("test-processor")).toBeInTheDocument();

      // Check that the type select has the correct value
      const typeSelect = screen.getByLabelText("Type") as HTMLSelectElement;
      expect(typeSelect.value).toBe("analytics");

      expect(screen.getByText("powerhouse/document-model")).toBeInTheDocument();
      expect(
        screen.getByText("powerhouse/budget-statement"),
      ).toBeInTheDocument();
    });
  });

  describe("Processor Name Input", () => {
    it("should dispatch setProcessorName when name changes (debounced)", async () => {
      const user = userEvent.setup();
      render(<Editor />);

      const nameInput = screen.getByLabelText("Processor Name");
      await user.type(nameInput, "new-processor");

      await waitFor(
        () => {
          expect(mockDispatch).toHaveBeenCalledWith(
            expect.objectContaining({
              type: "SET_PROCESSOR_NAME",
              input: { name: "new-processor" },
            }),
          );
        },
        { timeout: 500 },
      );
    });

    it("should dispatch when clearing a non-empty field", async () => {
      const document = utils.createDocument({
        global: {
          name: "existing-processor",
          type: "",
          status: "DRAFT",
          documentTypes: [],
          processorApps: [],
        },
      });
      vi.mocked(useSelectedProcessorModuleDocument).mockReturnValue([
        document,
        mockDispatch,
      ]);

      const user = userEvent.setup();
      render(<Editor />);

      const nameInput = screen.getByLabelText("Processor Name");
      await user.clear(nameInput);

      await waitFor(
        () => {
          expect(mockDispatch).toHaveBeenCalledWith(
            expect.objectContaining({
              type: "SET_PROCESSOR_NAME",
              input: { name: "" },
            }),
          );
        },
        { timeout: 500 },
      );
    });

    it("should NOT dispatch when typing identical value without clearing", async () => {
      const document = utils.createDocument({
        global: {
          name: "test",
          type: "",
          status: "DRAFT",
          documentTypes: [],
          processorApps: [],
        },
      });
      vi.mocked(useSelectedProcessorModuleDocument).mockReturnValue([
        document,
        mockDispatch,
      ]);

      const user = userEvent.setup();
      render(<Editor />);

      const nameInput = screen.getByLabelText("Processor Name");
      await user.tripleClick(nameInput);
      await user.type(nameInput, "test");

      await waitFor(() => {
        expect(mockDispatch).not.toHaveBeenCalled();
      });
    });

    it("should NOT dispatch when both old and new values are empty", async () => {
      const user = userEvent.setup();
      render(<Editor />);

      const nameInput = screen.getByLabelText("Processor Name");
      await user.click(nameInput);
      await user.tab();

      await waitFor(() => {
        expect(mockDispatch).not.toHaveBeenCalled();
      });
    });
  });

  describe("Processor Type Dropdown", () => {
    it("should dispatch setProcessorType when type changes (debounced)", async () => {
      const user = userEvent.setup();
      render(<Editor />);

      const typeSelect = screen.getByLabelText("Type");
      await user.selectOptions(typeSelect, "analytics");

      await waitFor(
        () => {
          expect(mockDispatch).toHaveBeenCalledWith(
            expect.objectContaining({
              type: "SET_PROCESSOR_TYPE",
              input: { type: "analytics" },
            }),
          );
        },
        { timeout: 500 },
      );
    });

    it("should NOT dispatch when selecting same type", async () => {
      const document = utils.createDocument({
        global: {
          name: "test-processor",
          type: "analytics",
          status: "DRAFT",
          documentTypes: [],
          processorApps: [],
        },
      });
      vi.mocked(useSelectedProcessorModuleDocument).mockReturnValue([
        document,
        mockDispatch,
      ]);

      const user = userEvent.setup();
      render(<Editor />);

      const typeSelect = screen.getByLabelText("Type");
      // Select the same type that's already set
      await user.selectOptions(typeSelect, "analytics");

      // Wait to ensure debounce has time to fire (if it would)
      await new Promise((resolve) => setTimeout(resolve, 400));

      // Should NOT have dispatched because "analytics" is already the current value
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("should show correct type options", () => {
      render(<Editor />);

      const typeSelect = screen.getByLabelText("Type");
      const options = Array.from(typeSelect.querySelectorAll("option")).map(
        (opt) => opt.value,
      );

      expect(options).toContain("analytics");
      expect(options).toContain("relational");
    });
  });

  describe("Document Types Management", () => {
    it("should add document type from dropdown", async () => {
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

    it("should remove document type", async () => {
      const document = utils.createDocument({
        global: {
          name: "test-processor",
          type: "analytics",
          status: "DRAFT",
          documentTypes: [
            { id: "dt-1", documentType: "powerhouse/document-model" },
            { id: "dt-2", documentType: "powerhouse/budget-statement" },
          ],
          processorApps: [],
        },
      });
      vi.mocked(useSelectedProcessorModuleDocument).mockReturnValue([
        document,
        mockDispatch,
      ]);

      const user = userEvent.setup();
      render(<Editor />);

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
      const document = utils.createDocument({
        global: {
          name: "test-processor",
          type: "analytics",
          status: "DRAFT",
          documentTypes: [
            { id: "dt-1", documentType: "powerhouse/document-model" },
          ],
          processorApps: [],
        },
      });
      vi.mocked(useSelectedProcessorModuleDocument).mockReturnValue([
        document,
        mockDispatch,
      ]);

      render(<Editor />);

      const select = screen.getByLabelText("Document Types");
      const options = Array.from(select.querySelectorAll("option")).map(
        (opt) => opt.value,
      );

      expect(options).not.toContain("powerhouse/document-model");
      expect(options).toContain("powerhouse/budget-statement");
      expect(options).toContain("powerhouse/project-tracker");
    });

    it("should add multiple document types", async () => {
      const user = userEvent.setup();
      render(<Editor />);

      const select = screen.getByLabelText("Document Types");

      await user.selectOptions(select, "powerhouse/document-model");
      await user.selectOptions(select, "powerhouse/budget-statement");

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "ADD_DOCUMENT_TYPE",
          input: expect.objectContaining({
            documentType: "powerhouse/document-model",
          }),
        }),
      );

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "ADD_DOCUMENT_TYPE",
          input: expect.objectContaining({
            documentType: "powerhouse/budget-statement",
          }),
        }),
      );
    });

    it("should display existing document types list", () => {
      const document = utils.createDocument({
        global: {
          name: "test-processor",
          type: "analytics",
          status: "DRAFT",
          documentTypes: [
            { id: "dt-1", documentType: "powerhouse/document-model" },
            { id: "dt-2", documentType: "powerhouse/budget-statement" },
          ],
          processorApps: [],
        },
      });
      vi.mocked(useSelectedProcessorModuleDocument).mockReturnValue([
        document,
        mockDispatch,
      ]);

      render(<Editor />);

      expect(screen.getByText("powerhouse/document-model")).toBeInTheDocument();
      expect(
        screen.getByText("powerhouse/budget-statement"),
      ).toBeInTheDocument();
    });
  });

  describe("Confirm Button", () => {
    it("should dispatch setProcessorStatus when confirm clicked", async () => {
      const document = utils.createDocument({
        global: {
          name: "test-processor",
          type: "analytics",
          status: "DRAFT",
          documentTypes: [
            { id: "dt-1", documentType: "powerhouse/document-model" },
          ],
          processorApps: ["connect"],
        },
      });
      vi.mocked(useSelectedProcessorModuleDocument).mockReturnValue([
        document,
        mockDispatch,
      ]);

      const user = userEvent.setup();
      render(<Editor />);

      const confirmButton = screen.getByText("Confirm");
      await user.click(confirmButton);

      expect(mockDispatch).toHaveBeenCalledWith([
        expect.objectContaining({
          type: "SET_PROCESSOR_STATUS",
          input: { status: "CONFIRMED" },
        }),
      ]);
    });

    it("should be disabled when processor name is empty", () => {
      const document = utils.createDocument({
        global: {
          name: "",
          type: "analytics",
          status: "DRAFT",
          documentTypes: [
            { id: "dt-1", documentType: "powerhouse/document-model" },
          ],
          processorApps: ["connect"],
        },
      });
      vi.mocked(useSelectedProcessorModuleDocument).mockReturnValue([
        document,
        mockDispatch,
      ]);

      render(<Editor />);

      const confirmButton = screen.getByText("Confirm");
      expect(confirmButton).toBeDisabled();
    });

    it("should be disabled when processor type is empty", () => {
      const document = utils.createDocument({
        global: {
          name: "test-processor",
          type: "",
          status: "DRAFT",
          documentTypes: [
            { id: "dt-1", documentType: "powerhouse/document-model" },
          ],
          processorApps: ["connect"],
        },
      });
      vi.mocked(useSelectedProcessorModuleDocument).mockReturnValue([
        document,
        mockDispatch,
      ]);

      render(<Editor />);

      const confirmButton = screen.getByText("Confirm");
      expect(confirmButton).toBeDisabled();
    });

    it("should be disabled when no document types selected", () => {
      const document = utils.createDocument({
        global: {
          name: "test-processor",
          type: "analytics",
          status: "DRAFT",
          documentTypes: [],
          processorApps: ["connect"],
        },
      });
      vi.mocked(useSelectedProcessorModuleDocument).mockReturnValue([
        document,
        mockDispatch,
      ]);

      render(<Editor />);

      const confirmButton = screen.getByText("Confirm");
      expect(confirmButton).toBeDisabled();
    });

    it("should be hidden when status is CONFIRMED", () => {
      const document = utils.createDocument({
        global: {
          name: "test-processor",
          type: "analytics",
          status: "CONFIRMED",
          documentTypes: [
            { id: "dt-1", documentType: "powerhouse/document-model" },
          ],
          processorApps: ["connect"],
        },
      });
      vi.mocked(useSelectedProcessorModuleDocument).mockReturnValue([
        document,
        mockDispatch,
      ]);

      render(<Editor />);

      const confirmButton = screen.queryByText("Confirm");
      expect(confirmButton).not.toBeInTheDocument();
    });
  });

  describe("Read-only Mode", () => {
    it("should disable form fields when status is CONFIRMED", () => {
      const document = utils.createDocument({
        global: {
          name: "test-processor",
          type: "analytics",
          status: "CONFIRMED",
          documentTypes: [
            { id: "dt-1", documentType: "powerhouse/document-model" },
          ],
          processorApps: ["connect"],
        },
      });
      vi.mocked(useSelectedProcessorModuleDocument).mockReturnValue([
        document,
        mockDispatch,
      ]);

      render(<Editor />);

      const nameInput = screen.getByLabelText("Processor Name");
      const typeSelect = screen.getByLabelText("Type");

      expect(nameInput).toBeDisabled();
      expect(typeSelect).toBeDisabled();

      // Document types dropdown should not be visible in read-only mode
      const select = screen.queryByLabelText("Document Types");
      expect(select).not.toBeInTheDocument();

      // Remove buttons should not be visible
      const removeButtons = screen.queryAllByText("×");
      expect(removeButtons).toHaveLength(0);
    });

    it("should enable form fields when status is DRAFT", () => {
      const document = utils.createDocument({
        global: {
          name: "test-processor",
          type: "analytics",
          status: "DRAFT",
          documentTypes: [
            { id: "dt-1", documentType: "powerhouse/document-model" },
          ],
          processorApps: [],
        },
      });
      vi.mocked(useSelectedProcessorModuleDocument).mockReturnValue([
        document,
        mockDispatch,
      ]);

      render(<Editor />);

      const nameInput = screen.getByLabelText("Processor Name");
      const typeSelect = screen.getByLabelText("Type");

      expect(nameInput).not.toBeDisabled();
      expect(typeSelect).not.toBeDisabled();

      // Document types dropdown should be visible
      const select = screen.getByLabelText("Document Types");
      expect(select).toBeInTheDocument();

      // Remove button should be visible
      const removeButtons = screen.queryAllByText("×");
      expect(removeButtons.length).toBeGreaterThan(0);
    });
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Editor from "./editor.js";

// What the host passes the editor: its document and dispatch.
let hosted: [unknown, unknown] = [undefined, undefined];
const setHosted = (value: unknown[]) => {
  hosted = value as [unknown, unknown];
};
const props = () => ({
  document: hosted[0] as never,
  dispatch: hosted[1] as never,
});

vi.mock("@powerhousedao/design-system/connect", () => ({
  DocumentToolbar: () => null,
}));

vi.mock("@powerhousedao/reactor-browser", () => ({
  useSetPHDocumentEditorConfig: vi.fn(),
}));

describe("SubgraphModule Editor", () => {
  let mockDispatch: (...args: any[]) => any;

  beforeEach(() => {
    mockDispatch = vi.fn();
    setHosted([
      {
        state: {
          global: {
            name: "",
            status: "DRAFT",
          },
        },
      },
      mockDispatch,
    ] as any);
  });

  describe("Core Rendering", () => {
    it("should render all main form sections and labels", () => {
      render(<Editor {...props()} />);

      expect(screen.getByText("Subgraph Configuration")).toBeInTheDocument();
      expect(screen.getByText("Subgraph Name")).toBeInTheDocument();
      expect(screen.getByText("Confirm")).toBeInTheDocument();
    });

    it("should display existing subgraph data when document has values", () => {
      setHosted([
        {
          state: {
            global: {
              name: "test-subgraph",
              status: "DRAFT",
            },
          },
        },
        mockDispatch,
      ] as any);

      render(<Editor {...props()} />);

      expect(screen.getByDisplayValue("test-subgraph")).toBeInTheDocument();
    });
  });

  describe("Subgraph Name Input", () => {
    it("should dispatch setSubgraphName when name changes (debounced)", async () => {
      const user = userEvent.setup();
      render(<Editor {...props()} />);

      const nameInput = screen.getByLabelText("Subgraph Name");
      await user.type(nameInput, "new-subgraph");

      await waitFor(
        () => {
          expect(mockDispatch).toHaveBeenCalledWith(
            expect.objectContaining({
              type: "SET_SUBGRAPH_NAME",
              input: { name: "new-subgraph" },
            }),
          );
        },
        { timeout: 500 },
      );
    });

    it("should dispatch when clearing a non-empty field", async () => {
      setHosted([
        {
          state: {
            global: {
              name: "existing-subgraph",
              status: "DRAFT",
            },
          },
        },
        mockDispatch,
      ] as any);

      const user = userEvent.setup();
      render(<Editor {...props()} />);

      const nameInput = screen.getByLabelText("Subgraph Name");
      await user.clear(nameInput);

      await waitFor(
        () => {
          expect(mockDispatch).toHaveBeenCalledWith(
            expect.objectContaining({
              type: "SET_SUBGRAPH_NAME",
              input: { name: "" },
            }),
          );
        },
        { timeout: 500 },
      );
    });

    it("should NOT dispatch when typing identical value without clearing", async () => {
      setHosted([
        {
          state: {
            global: {
              name: "test",
              status: "DRAFT",
            },
          },
        },
        mockDispatch,
      ] as any);

      const user = userEvent.setup();
      render(<Editor {...props()} />);

      const nameInput = screen.getByLabelText("Subgraph Name");
      await user.tripleClick(nameInput);
      await user.type(nameInput, "test");

      await waitFor(() => {
        expect(mockDispatch).not.toHaveBeenCalled();
      });
    });

    it("should NOT dispatch when both old and new values are empty", async () => {
      const user = userEvent.setup();
      render(<Editor {...props()} />);

      const nameInput = screen.getByLabelText("Subgraph Name");
      await user.click(nameInput);
      await user.tab();

      await waitFor(() => {
        expect(mockDispatch).not.toHaveBeenCalled();
      });
    });
  });

  describe("Confirm Button", () => {
    it("should dispatch setSubgraphStatus when confirm clicked", async () => {
      setHosted([
        {
          state: {
            global: {
              name: "test-subgraph",
              status: "DRAFT",
            },
          },
        },
        mockDispatch,
      ] as any);

      const user = userEvent.setup();
      render(<Editor {...props()} />);

      const confirmButton = screen.getByText("Confirm");
      await user.click(confirmButton);

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SET_SUBGRAPH_STATUS",
          input: { status: "CONFIRMED" },
        }),
      );
    });

    it("should be disabled when subgraph name is empty", () => {
      render(<Editor {...props()} />);

      const confirmButton = screen.getByText("Confirm");
      expect(confirmButton).toBeDisabled();
    });

    it("should be hidden when status is CONFIRMED", () => {
      setHosted([
        {
          state: {
            global: {
              name: "test-subgraph",
              status: "CONFIRMED",
            },
          },
        },
        mockDispatch,
      ] as any);

      render(<Editor {...props()} />);

      const confirmButton = screen.queryByText("Confirm");
      expect(confirmButton).not.toBeInTheDocument();
    });
  });

  describe("Read-only Mode", () => {
    it("should disable form field when status is CONFIRMED", () => {
      setHosted([
        {
          state: {
            global: {
              name: "test-subgraph",
              status: "CONFIRMED",
            },
          },
        },
        mockDispatch,
      ] as any);

      render(<Editor {...props()} />);

      const nameInput = screen.getByLabelText("Subgraph Name");
      expect(nameInput).toBeDisabled();

      // Confirm button should not be visible
      const confirmButton = screen.queryByText("Confirm");
      expect(confirmButton).not.toBeInTheDocument();
    });

    it("should enable form field when status is DRAFT", () => {
      setHosted([
        {
          state: {
            global: {
              name: "test-subgraph",
              status: "DRAFT",
            },
          },
        },
        mockDispatch,
      ] as any);

      render(<Editor {...props()} />);

      const nameInput = screen.getByLabelText("Subgraph Name");
      expect(nameInput).not.toBeDisabled();

      // Confirm button should be visible
      const confirmButton = screen.getByText("Confirm");
      expect(confirmButton).toBeInTheDocument();
    });
  });
});

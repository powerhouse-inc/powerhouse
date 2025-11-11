import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSelectedDriveVetraPackage } from "../hooks/useVetraDocument.js";
import Editor from "./editor.js";

vi.mock("../hooks/useVetraDocument.js", () => ({
  useSelectedDriveVetraPackage: vi.fn(),
}));

describe("VetraPackage Editor", () => {
  let mockDispatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockDispatch = vi.fn();
    vi.mocked(useSelectedDriveVetraPackage).mockReturnValue([
      {
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
      },
      mockDispatch,
    ] as any);
  });

  describe("Core Rendering", () => {
    it("should render all main form sections and labels", () => {
      render(<Editor />);

      expect(screen.getByText("Name")).toBeInTheDocument();
      expect(screen.getByText("Description")).toBeInTheDocument();
      expect(screen.getByText("Category")).toBeInTheDocument();
      expect(screen.getByText("Publisher")).toBeInTheDocument();
      expect(screen.getByText("Publisher URL")).toBeInTheDocument();
      expect(screen.getByText("Keywords")).toBeInTheDocument();
      expect(screen.getByText("Github Repository")).toBeInTheDocument();
      expect(screen.getByText("NPM-package")).toBeInTheDocument();
    });
  });

  describe("Initial Data Display", () => {
    it("should display existing package data when document has values", () => {
      vi.mocked(useSelectedDriveVetraPackage).mockReturnValue([
        {
          state: {
            global: {
              name: "test-package",
              description: "A test package",
              category: "Productivity",
              author: {
                name: "John Doe",
                website: "https://johndoe.com",
              },
              keywords: [
                { id: "kw-1", label: "react" },
                { id: "kw-2", label: "typescript" },
              ],
              githubUrl: "https://github.com/test/package",
              npmUrl: "https://npmjs.com/package/test",
            },
          },
        },
        mockDispatch,
      ] as any);

      render(<Editor />);

      expect(screen.getByDisplayValue("test-package")).toBeInTheDocument();
      expect(screen.getByDisplayValue("A test package")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Productivity")).toBeInTheDocument();
      expect(screen.getByDisplayValue("John Doe")).toBeInTheDocument();
      expect(
        screen.getByDisplayValue("https://johndoe.com"),
      ).toBeInTheDocument();
      expect(screen.getByText("react")).toBeInTheDocument();
      expect(screen.getByText("typescript")).toBeInTheDocument();
      expect(
        screen.getByDisplayValue("https://github.com/test/package"),
      ).toBeInTheDocument();
      expect(
        screen.getByDisplayValue("https://npmjs.com/package/test"),
      ).toBeInTheDocument();
    });
  });

  describe("Text Input Fields - Dispatch Verification", () => {
    it("should dispatch setPackageName when name changes", async () => {
      const user = userEvent.setup();
      render(<Editor />);

      const nameInput = screen.getByLabelText("Name");
      await user.type(nameInput, "new-package");

      await waitFor(
        () => {
          expect(mockDispatch).toHaveBeenCalledWith(
            expect.objectContaining({
              type: "SET_PACKAGE_NAME",
              input: { name: "new-package" },
            }),
          );
        },
        { timeout: 500 },
      );
    });

    it("should dispatch setPackageDescription when description changes", async () => {
      const user = userEvent.setup();
      render(<Editor />);

      const descriptionInput = screen.getByLabelText("Description");
      await user.type(descriptionInput, "New description");

      await waitFor(
        () => {
          expect(mockDispatch).toHaveBeenCalledWith(
            expect.objectContaining({
              type: "SET_PACKAGE_DESCRIPTION",
              input: { description: "New description" },
            }),
          );
        },
        { timeout: 500 },
      );
    });

    it("should dispatch setPackageAuthorName when publisher changes", async () => {
      const user = userEvent.setup();
      render(<Editor />);

      const publisherInput = screen.getByLabelText("Publisher");
      await user.type(publisherInput, "Acme Corp");

      await waitFor(
        () => {
          expect(mockDispatch).toHaveBeenCalledWith(
            expect.objectContaining({
              type: "SET_PACKAGE_AUTHOR_NAME",
              input: { name: "Acme Corp" },
            }),
          );
        },
        { timeout: 500 },
      );
    });

    it("should dispatch setPackageAuthorWebsite when publisher URL changes", async () => {
      const user = userEvent.setup();
      render(<Editor />);

      const publisherUrlInput = screen.getByLabelText("Publisher URL");
      await user.type(publisherUrlInput, "https://acme.com");

      await waitFor(
        () => {
          expect(mockDispatch).toHaveBeenCalledWith(
            expect.objectContaining({
              type: "SET_PACKAGE_AUTHOR_WEBSITE",
              input: { website: "https://acme.com" },
            }),
          );
        },
        { timeout: 500 },
      );
    });

    it("should dispatch setPackageGithubUrl when Github repository changes", async () => {
      const user = userEvent.setup();
      render(<Editor />);

      const githubInput = screen.getByLabelText("Github Repository");
      await user.type(githubInput, "https://github.com/acme/test");

      await waitFor(
        () => {
          expect(mockDispatch).toHaveBeenCalledWith(
            expect.objectContaining({
              type: "SET_PACKAGE_GITHUB_URL",
              input: { url: "https://github.com/acme/test" },
            }),
          );
        },
        { timeout: 500 },
      );
    });

    it("should dispatch setPackageNpmUrl when NPM package changes", async () => {
      const user = userEvent.setup();
      render(<Editor />);

      const npmInput = screen.getByLabelText("NPM-package");
      await user.type(npmInput, "https://npmjs.com/package/acme");

      await waitFor(
        () => {
          expect(mockDispatch).toHaveBeenCalledWith(
            expect.objectContaining({
              type: "SET_PACKAGE_NPM_URL",
              input: { url: "https://npmjs.com/package/acme" },
            }),
          );
        },
        { timeout: 500 },
      );
    });
  });

  describe("Conditional Dispatch Logic", () => {
    it("should dispatch when clearing a non-empty field", async () => {
      vi.mocked(useSelectedDriveVetraPackage).mockReturnValue([
        {
          state: {
            global: {
              name: "existing-package",
              description: null,
              category: null,
              author: { name: null, website: null },
              keywords: [],
              githubUrl: null,
              npmUrl: null,
            },
          },
        },
        mockDispatch,
      ] as any);

      const user = userEvent.setup();
      render(<Editor />);

      const nameInput = screen.getByLabelText("Name");
      await user.clear(nameInput);

      await waitFor(
        () => {
          expect(mockDispatch).toHaveBeenCalledWith(
            expect.objectContaining({
              type: "SET_PACKAGE_NAME",
              input: { name: "" },
            }),
          );
        },
        { timeout: 500 },
      );
    });

    it("should NOT dispatch when typing identical value without clearing", async () => {
      vi.mocked(useSelectedDriveVetraPackage).mockReturnValue([
        {
          state: {
            global: {
              name: "test",
              description: null,
              category: null,
              author: { name: null, website: null },
              keywords: [],
              githubUrl: null,
              npmUrl: null,
            },
          },
        },
        mockDispatch,
      ] as any);

      const user = userEvent.setup();
      render(<Editor />);

      const nameInput = screen.getByLabelText("Name");
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

      const nameInput = screen.getByLabelText("Name");
      await user.click(nameInput);
      await user.tab(); // Focus and blur without typing

      await waitFor(() => {
        expect(mockDispatch).not.toHaveBeenCalled();
      });
    });
  });

  describe("Category Selection", () => {
    it("should dispatch category change immediately (no debounce)", async () => {
      const user = userEvent.setup();
      render(<Editor />);

      const categorySelect = screen.getByLabelText("Category");
      await user.selectOptions(categorySelect, "Productivity");

      // Should dispatch immediately without waiting for debounce
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SET_PACKAGE_CATEGORY",
          input: { category: "Productivity" },
        }),
      );
    });
  });

  describe("Debounce Behavior", () => {
    it("should debounce text input changes (300ms delay)", async () => {
      const user = userEvent.setup();
      render(<Editor />);

      const nameInput = screen.getByLabelText("Name");

      // Type multiple characters quickly
      await user.type(nameInput, "test");

      // Should not dispatch immediately
      expect(mockDispatch).not.toHaveBeenCalled();

      // Should dispatch after debounce delay
      await waitFor(
        () => {
          expect(mockDispatch).toHaveBeenCalledWith(
            expect.objectContaining({
              type: "SET_PACKAGE_NAME",
              input: { name: "test" },
            }),
          );
        },
        { timeout: 500 },
      );
    });
  });

  describe("Keywords Management", () => {
    it("should add keyword on Enter with valid input", async () => {
      const user = userEvent.setup();
      render(<Editor />);

      const keywordInput = screen.getByPlaceholderText(
        "Type a keyword and press Enter",
      );
      await user.type(keywordInput, "react{Enter}");

      expect(screen.getByText("react")).toBeInTheDocument();
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "ADD_PACKAGE_KEYWORD",
          input: expect.objectContaining({
            label: "react",
          }),
        }),
      );
    });

    it("should NOT add empty or whitespace-only keyword", async () => {
      const user = userEvent.setup();
      render(<Editor />);

      const keywordInput = screen.getByPlaceholderText(
        "Type a keyword and press Enter",
      );

      // Try to add empty keyword
      await user.type(keywordInput, "{Enter}");
      expect(mockDispatch).not.toHaveBeenCalled();

      // Try to add whitespace-only keyword
      await user.type(keywordInput, "   {Enter}");
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("should display keywords and allow removal", async () => {
      vi.mocked(useSelectedDriveVetraPackage).mockReturnValue([
        {
          state: {
            global: {
              name: null,
              description: null,
              category: null,
              author: { name: null, website: null },
              keywords: [
                { id: "kw-1", label: "react" },
                { id: "kw-2", label: "typescript" },
              ],
              githubUrl: null,
              npmUrl: null,
            },
          },
        },
        mockDispatch,
      ] as any);

      const user = userEvent.setup();
      render(<Editor />);

      expect(screen.getByText("react")).toBeInTheDocument();
      expect(screen.getByText("typescript")).toBeInTheDocument();

      // Find and click the remove button for "react"
      const reactKeyword = screen.getByText("react").closest("span");
      const removeButton = reactKeyword?.querySelector("button");
      if (removeButton) {
        await user.click(removeButton);
      }

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "REMOVE_PACKAGE_KEYWORD",
          input: { id: "kw-1" },
        }),
      );
    });

    it("should dispatch addKeyword action with correct payload", async () => {
      const user = userEvent.setup();
      render(<Editor />);

      // Add keyword
      const keywordInput = screen.getByPlaceholderText(
        "Type a keyword and press Enter",
      );
      await user.type(keywordInput, "testing{Enter}");

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "ADD_PACKAGE_KEYWORD",
          input: expect.objectContaining({
            label: "testing",
            id: expect.any(String),
          }),
        }),
      );
    });
  });
});

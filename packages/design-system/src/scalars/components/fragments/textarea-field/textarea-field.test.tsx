import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithForm } from "@/scalars/lib/testing";
import { TextareaField } from "./textarea-field";

describe("TextareaField Component", () => {
  it("should match snapshot with props", () => {
    const { asFragment } = renderWithForm(
      <TextareaField
        name="textarea"
        label="Default Label"
        description="Default description"
        required
        maxLength={100}
        warnings={["Warning"]}
        errors={["Error"]}
      />,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it("should handle basic props and attributes", () => {
    renderWithForm(
      <TextareaField
        name="textarea"
        label="Test Label"
        required
        disabled
        rows={5}
        spellCheck={true}
      />,
    );

    const textarea = screen.getByRole("textbox");
    const label = screen.getByText("Test Label");

    expect(label.parentElement).toHaveTextContent("*");
    expect(textarea).toBeDisabled();
    expect(textarea).toHaveAttribute("rows", "5");
    expect(textarea).toHaveAttribute("spellcheck", "true");
  });

  it("should handle resize behavior", () => {
    const { rerender } = renderWithForm(<TextareaField name="textarea" />);
    let textarea = screen.getByRole("textbox");
    expect(textarea).toHaveClass("resize-y");

    rerender(<TextareaField name="textarea" autoExpand />);
    textarea = screen.getByRole("textbox");
    expect(textarea).toHaveClass("resize-none", "overflow-hidden");
  });

  describe("Styling and Visual States", () => {
    it("should apply correct styles for different states", async () => {
      const user = userEvent.setup();
      const { rerender } = renderWithForm(<TextareaField name="textarea" />);
      const textarea = screen.getByRole("textbox");

      // Hover state
      await user.hover(textarea);
      expect(textarea).toHaveClass(
        "hover:border-gray-400",
        "dark:hover:border-gray-600",
      );

      // Focus state
      await user.tab();
      expect(textarea).toHaveClass(
        "focus:outline-none",
        "focus:ring-2",
        "focus:ring-gray-900",
        "focus:ring-offset-2",
        "dark:focus:ring-gray-700",
        "dark:focus:ring-offset-0",
        "dark:focus:border-gray-700",
        "dark:focus:bg-gray-900",
      );

      // Custom class
      rerender(
        <TextareaField
          name="textarea"
          // eslint-disable-next-line tailwindcss/no-custom-classname
          className="custom-class"
        />,
      );
      expect(textarea).toHaveClass("custom-class");
    });

    it("should handle resize behavior correctly", () => {
      const { rerender } = renderWithForm(<TextareaField name="textarea" />);
      let textarea = screen.getByRole("textbox");

      // Default resize behavior
      expect(textarea).toHaveClass(
        "min-h-[120px]",
        "resize-y",
        "scrollbar-thin",
        "scrollbar-thumb-gray-300",
        "scrollbar-track-transparent",
        "dark:scrollbar-thumb-gray-600",
      );

      // Auto-expand behavior
      rerender(<TextareaField name="textarea" autoExpand />);
      textarea = screen.getByRole("textbox");
      expect(textarea).toHaveClass("resize-none", "overflow-hidden");
    });
  });

  describe("Messages and Feedback", () => {
    it("should handle warnings and errors", () => {
      renderWithForm(
        <TextareaField
          name="textarea"
          description="Help text"
          warnings={["Warning 1", "Warning 2"]}
          errors={["Error 1", "Error 2"]}
        />,
      );

      expect(screen.getByText("Help text")).toBeInTheDocument();
      expect(screen.getByText("Warning 1")).toBeInTheDocument();
      expect(screen.getByText("Warning 2")).toBeInTheDocument();
      expect(screen.getByText("Error 1")).toBeInTheDocument();
      expect(screen.getByText("Error 2")).toBeInTheDocument();
    });
  });

  describe("Input Handling", () => {
    it("should handle various input methods and transformations", async () => {
      const user = userEvent.setup();

      renderWithForm(
        <TextareaField
          name="textarea"
          value="Initial"
          maxLength={20}
          uppercase
        />,
      );

      const textarea = screen.getByRole("textbox");

      // Regular typing
      await user.type(textarea, " text");
      expect(textarea).toHaveValue("INITIAL TEXT");

      // Emoji input
      await user.clear(textarea);
      await user.type(textarea, "👋🏻");
      expect(textarea).toHaveValue("👋🏻");

      // Paste handling
      await user.clear(textarea);
      // Create a new paste event using JSDOM's Event constructor
      const pasteEvent = new Event("paste", { bubbles: true });
      Object.defineProperty(pasteEvent, "clipboardData", {
        value: {
          getData: () => "Pasted",
        },
      });
      textarea.dispatchEvent(pasteEvent);

      // RTL text handling
      await user.clear(textarea);
      const rtlText = "مرحبا";
      await user.type(textarea, rtlText);
      expect(textarea).toHaveValue(rtlText);
    });
  });

  describe("Form Integration", () => {
    it("should handle form operations", async () => {
      const user = userEvent.setup();
      const handleSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());

      renderWithForm(
        <form onSubmit={handleSubmit}>
          <TextareaField defaultValue="Initial" name="textarea" />
          <button type="submit">Submit</button>
          <button type="reset">Reset</button>
        </form>,
      );

      const textarea = screen.getByRole("textbox");

      // Submit
      await user.click(screen.getByRole("button", { name: "Submit" }));
      expect(handleSubmit).toHaveBeenCalled();

      // Reset
      await user.type(textarea, " modified");
      await user.click(screen.getByRole("button", { name: "Reset" }));
      expect(textarea).toHaveValue("Initial");
    });
  });
});

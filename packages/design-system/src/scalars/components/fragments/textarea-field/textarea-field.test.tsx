// Commented tests are WIP
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextareaField } from "./textarea-field";

describe("TextareaField Component", () => {
  it("should match snapshot with props", () => {
    const { asFragment } = render(
      <TextareaField
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
    render(
      <TextareaField
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
    const { rerender } = render(<TextareaField />);
    let textarea = screen.getByRole("textbox");
    expect(textarea).toHaveClass("resize-y");

    rerender(<TextareaField autoExpand />);
    textarea = screen.getByRole("textbox");
    expect(textarea).toHaveClass("resize-none", "overflow-hidden");
  });

  describe("Styling and Visual States", () => {
    it("should apply correct styles for different states", async () => {
      const user = userEvent.setup();
      const { rerender } = render(<TextareaField />);
      const textarea = screen.getByRole("textbox");

      // Default state
      expect(textarea).toHaveClass("resize-y");

      // Hover state
      await user.hover(textarea);
      expect(textarea).toHaveClass(
        "hover:border-gray-300",
        "dark:hover:border-gray-700",
      );

      // Focus state
      await user.tab();
      expect(textarea).toHaveClass(
        "focus:border-gray-900",
        "focus:ring-2",
        "focus:ring-gray-100",
        "focus:ring-offset-0",
      );

      // Error state
      rerender(<TextareaField errors={["Error"]} />);
      expect(textarea).toHaveClass(
        "border-red-700",
        "bg-red-50/50",
        "dark:border-red-400",
        "dark:bg-red-900/5",
      );

      // Custom class
      rerender(
        <TextareaField
          // eslint-disable-next-line tailwindcss/no-custom-classname
          className="custom-class"
        />,
      );
      expect(textarea).toHaveClass("custom-class");
    });
  });

  describe("Messages and Feedback", () => {
    it("should handle warnings and errors", () => {
      render(
        <TextareaField
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

  /* describe("Input Handling", () => {
    it("should handle various input methods and transformations", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(
        <TextareaField
          value="Initial"
          onChange={onChange}
          maxLength={20}
          trim
          uppercase
        />,
      );

      const textarea = screen.getByRole("textbox");

      // Regular typing
      await user.type(textarea, " text");
      // Check the actual textarea value
      expect(textarea).toHaveValue("INITIAL TEXT");

      // Emoji input
      await user.clear(textarea);
      await user.type(textarea, "👋🏻");
      expect(textarea).toHaveValue("👋🏻");
      expect(screen.getByText("2/10")).toBeInTheDocument();

      // Paste handling
      const pasteData = "Pasted";
      const pasteEvent = new ClipboardEvent("paste", {
        clipboardData: new DataTransfer(),
      });
      pasteEvent.clipboardData?.setData("text/plain", pasteData);
      textarea.dispatchEvent(pasteEvent);

      // RTL text handling
      await user.clear(textarea);
      const rtlText = "مرحبا";
      await user.type(textarea, rtlText);
      expect(textarea).toHaveValue(rtlText);
      expect(textarea).toHaveStyle({ direction: "rtl" });
    });
  }); */

  /* describe("Accessibility", () => {
    it("should handle all accessibility attributes and announcements", () => {
      render(
        <TextareaField
          errors={["Error message"]}
          maxLength={10}
          value="Test"
        />,
      );

      const textarea = screen.getByRole("textbox");
      const counter = screen.getByText("4/10");

      expect(textarea).toHaveAttribute("aria-label", "Text area");
      expect(textarea).toHaveAttribute("aria-invalid", "true");
      expect(counter).toBeInTheDocument();
    });
  }); */

  describe("Form Integration", () => {
    it("should handle form operations", async () => {
      const user = userEvent.setup();
      const handleSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());

      render(
        <form onSubmit={handleSubmit}>
          <TextareaField defaultValue="Initial" name="test" />
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

  /* describe("Performance", () => {
    it("should handle auto-expansion and long content efficiently", async () => {
      vi.useFakeTimers();
      const user = userEvent.setup({ delay: null });
      const onChange = vi.fn();

      render(<TextareaField onChange={onChange} autoExpand />);
      const textarea = screen.getByRole("textbox");
      const initialHeight = textarea.clientHeight;

      // Test long content
      const longText = "a".repeat(1000);
      await user.type(textarea, longText);
      expect(onChange).toHaveBeenCalledTimes(1000);

      // Test auto-expansion
      await user.clear(textarea);
      await user.type(textarea, "Line 1\nLine 2\nLine 3");

      // Check debounced resize
      expect(textarea.clientHeight).toBe(initialHeight);
      vi.runAllTimers();
      expect(textarea.clientHeight).toBeGreaterThan(initialHeight);

      vi.useRealTimers();
    });
  }); */
});

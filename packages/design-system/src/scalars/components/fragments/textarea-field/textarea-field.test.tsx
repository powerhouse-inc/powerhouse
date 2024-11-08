import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextareaField } from "./textarea-field";

describe("TextareaField Component", () => {
  it("should match snapshot with props", () => {
    const { asFragment } = render(
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
    render(
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
    const { rerender } = render(<TextareaField name="textarea" />);
    let textarea = screen.getByRole("textbox");
    expect(textarea).toHaveClass("resize-y");

    rerender(<TextareaField name="textarea" autoExpand />);
    textarea = screen.getByRole("textbox");
    expect(textarea).toHaveClass("resize-none", "overflow-hidden");
  });

  describe("Styling and Visual States", () => {
    it("should apply correct styles for different states", async () => {
      const user = userEvent.setup();
      const { rerender } = render(<TextareaField name="textarea" />);
      const textarea = screen.getByRole("textbox");

      // Default state
      expect(textarea).toHaveClass(
        "flex",
        "w-full",
        "rounded-lg",
        "text-base",
        "leading-normal",
        "font-normal",
        "font-inter",
        "text-gray-900",
        "bg-white",
        "border",
        "border-gray-300",
        "dark:text-gray-100",
        "dark:bg-gray-900",
        "dark:border-gray-700",
      );

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

      // Error state
      rerender(<TextareaField name="textarea" errors={["Error"]} />);
      expect(textarea).toHaveClass(
        "border-red-500",
        "bg-red-50/50",
        "dark:border-red-400",
        "dark:bg-red-900/5",
        "hover:border-red-600",
        "dark:hover:border-red-300",
        "focus:ring-0",
        "focus:ring-offset-0",
        "focus:border-red-500",
        "dark:focus:border-red-400",
      );

      // Warning state
      rerender(<TextareaField name="textarea" warnings={["Warning"]} />);
      expect(textarea).toHaveClass(
        "border-orange-500",
        "bg-orange-50/50",
        "dark:border-orange-400",
        "dark:bg-orange-900/5",
        "hover:border-orange-600",
        "dark:hover:border-orange-300",
        "focus:ring-0",
        "focus:ring-offset-0",
        "focus:border-orange-500",
        "dark:focus:border-orange-400",
      );

      // Disabled state
      rerender(<TextareaField name="textarea" disabled />);
      expect(textarea).toHaveClass(
        "disabled:cursor-not-allowed",
        "disabled:bg-gray-50",
        "disabled:border-gray-200",
        "disabled:text-gray-500",
        "dark:disabled:bg-gray-900/50",
        "dark:disabled:border-gray-800",
        "dark:disabled:text-gray-600",
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
      const { rerender } = render(<TextareaField name="textarea" />);
      let textarea = screen.getByRole("textbox");

      // Default resize behavior
      expect(textarea).toHaveClass(
        "min-h-[120px]",
        "resize-y",
        "scrollbar",
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
      render(
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

  describe("Form Integration", () => {
    it("should handle form operations", async () => {
      const user = userEvent.setup();
      const handleSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());

      render(
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

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
      rerender(<TextareaField name="textarea" errors={["Error"]} />);
      expect(textarea).toHaveClass(
        "border-red-700",
        "bg-red-50/50",
        "dark:border-red-400",
        "dark:bg-red-900/5",
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

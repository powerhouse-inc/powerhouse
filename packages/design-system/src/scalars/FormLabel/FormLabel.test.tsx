import { fireEvent, render, screen } from "@testing-library/react";
import { FormLabel } from "./FormLabel";

describe("FormLabel Component", () => {
  it("should match snapshot", () => {
    const { asFragment } = render(
      <FormLabel data-testid="form-label">label</FormLabel>,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it("should display the correct label text", () => {
    render(<FormLabel>Test Label</FormLabel>);
    expect(screen.getByText("Test Label")).toBeInTheDocument();
  });

  it("should apply custom className", () => {
    // this is a custom class name, not a tailwind class name
    // eslint-disable-next-line tailwindcss/no-custom-classname
    render(<FormLabel className="custom-class">Label</FormLabel>);
    const label = screen.getByText("Label");
    expect(label).toHaveClass("custom-class");
  });

  it("should forward the htmlFor attribute", () => {
    render(<FormLabel htmlFor="test-input">Label</FormLabel>);
    const label = screen.getByText("Label");
    expect(label).toHaveAttribute("for", "test-input");
  });

  it("should render children as expected", () => {
    render(
      <FormLabel>
        Label <span data-testid="child-element">Child</span>
      </FormLabel>,
    );
    expect(screen.getByText("Label")).toBeInTheDocument();
    expect(screen.getByTestId("child-element")).toBeInTheDocument();
  });

  it("should handle click events", () => {
    const handleClick = vi.fn();
    render(<FormLabel onClick={handleClick}>Clickable Label</FormLabel>);
    const label = screen.getByText("Clickable Label");
    fireEvent.click(label);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("should be accessible", () => {
    render(<FormLabel>Accessible Label</FormLabel>);
    const label = screen.getByText("Accessible Label");
    expect(label).toHaveAttribute("role", "label");
  });

  it("should include asterisk in the after element when required", () => {
    render(<FormLabel required>Required Label</FormLabel>);
    const label = screen.getByText("Required Label");
    expect(label).toHaveClass("after:content-['*']");
  });

  it("should have different style and not-allowed cursor when disabled", () => {
    render(<FormLabel disabled>Disabled Label</FormLabel>);
    const label = screen.getByText("Disabled Label");
    expect(label).toHaveClass("text-gray-600");
    expect(label).toHaveClass("cursor-not-allowed");
  });

  it("should display an icon when description is provided", () => {
    render(
      <FormLabel description="This is a description">
        Label with Description
      </FormLabel>,
    );
    const icon = screen.getByTestId("icon-fallback");
    expect(icon).toBeInTheDocument();
  });

  it("should apply custom styles", () => {
    const customStyle = { color: "red", fontWeight: "bold" };
    render(
      <FormLabel data-testid="styled-label" style={customStyle}>
        Styled Label
      </FormLabel>,
    );
    const label = screen.getByTestId("styled-label");
    expect(label.style.color).toBe(customStyle.color);
    expect(label.style.fontWeight).toBe(customStyle.fontWeight);
  });
});
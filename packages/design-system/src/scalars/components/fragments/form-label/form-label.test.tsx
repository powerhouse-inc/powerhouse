import { fireEvent, render, screen } from "@testing-library/react";
import { FormLabel } from "./form-label.js";

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

  it("should display an asterisk when required", () => {
    render(<FormLabel required>Required Label</FormLabel>);
    const asterisk = screen.getByText("*");
    expect(asterisk).toBeInTheDocument();
  });

  it("should have not-allowed cursor when disabled", () => {
    render(<FormLabel disabled>Disabled Label</FormLabel>);
    const label = screen.getByText("Disabled Label");
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

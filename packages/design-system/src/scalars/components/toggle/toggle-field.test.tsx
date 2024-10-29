import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, vi } from "vitest";
import { ToggleField } from "./toggle-field";

describe("ToggleField Component", () => {
  const mockOnChange = vi.fn();

  it("should match snapshot", () => {
    const { asFragment } = render(<ToggleField />);
    expect(asFragment()).toMatchSnapshot();
  });

  it("should render default status without a label on the left", () => {
    render(<ToggleField />);
    expect(screen.queryByText("Test Label")).not.toBeInTheDocument();
  });

  it("should render with a label when label prop is provided", () => {
    render(<ToggleField label="Test Label" />);
    expect(screen.getByText("Test Label")).toBeInTheDocument();
  });

  it("should render checked status without label", () => {
    render(<ToggleField checked={true} />);
    expect(screen.queryByText("Test Label")).not.toBeInTheDocument();
  });

  it("should render checked status with a label on the left", () => {
    render(<ToggleField label="Test Label" checked={true} />);
    expect(screen.getByText("Test Label")).toBeInTheDocument();
  });

  it("should not render the label when not provided", () => {
    render(<ToggleField />);
    expect(screen.queryByText("Test Label")).not.toBeInTheDocument();
  });

  it("should display an error message when hasMessage is true", () => {
    render(<ToggleField label="Test Label" errors={["Error message"]} />);
    expect(screen.getByText("Error message")).toBeInTheDocument();
  });

  it("should call onCheckedChange when clicked", () => {
    render(<ToggleField label="Test Label" onCheckedChange={mockOnChange} />);
    const toggleInput = screen.getByRole("switch");

    fireEvent.click(toggleInput);
    expect(mockOnChange).toHaveBeenCalledTimes(1);
    expect(toggleInput).toBeInTheDocument();
  });

  it("should disable the toggle when disabled prop is true", () => {
    render(
      <ToggleField
        label="Test Label"
        disabled
        onCheckedChange={mockOnChange}
      />,
    );
    const toggleInput = screen.getByRole("switch");
    expect(toggleInput).toBeDisabled();
  });

  it("should render with custom className", () => {
    // this is a custom class name for testing purposes
    // eslint-disable-next-line tailwindcss/no-custom-classname
    render(<ToggleField className="custom-class" />);
    const toggle = screen.getByTestId("custom-class");
    expect(toggle).toHaveClass("custom-class");
  });
});

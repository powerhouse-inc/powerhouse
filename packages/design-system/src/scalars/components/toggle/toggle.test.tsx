import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, vi } from "vitest";
import { Toggle } from "./toggle";

describe("Toggle Component", () => {
  const mockOnChange = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should match snapshot", () => {
    const { asFragment } = render(<Toggle />);
    expect(asFragment()).toMatchSnapshot();
  });

  it("renders default status without a label at the left", () => {
    render(<Toggle />);
    expect(screen.queryByText("Test Label")).not.toBeInTheDocument();
  });

  it("renders default status without a label at the left", () => {
    render(<Toggle label="Test Label" />);
    expect(screen.getByText("Test Label")).toBeInTheDocument();
  });

  it("renders checked status without label", () => {
    render(<Toggle checked={true} />);
    expect(screen.queryByText("Test Label")).not.toBeInTheDocument();
  });

  it("renders defaultd status with a label at the left", () => {
    render(<Toggle label="Test Label" checked={true} />);
    expect(screen.getByText("Test Label")).toBeInTheDocument();
  });

  it("does not render the label when not provided", () => {
    render(<Toggle />);
    expect(screen.queryByText("Test Label")).not.toBeInTheDocument();
  });

  it("displays an error message when hasMessage is true", () => {
    render(
      <Toggle
        label="Test Label"
        errors={[{ code: "201", message: "Error message" }]}
        message="Error message"
        type="error"
      />,
    );
    expect(screen.getByText("Error message")).toBeInTheDocument();
  });

  it("calls onCheckedChange when clicked", () => {
    render(<Toggle label="Test Label" onCheckedChange={mockOnChange} />);
    const toggleInput = screen.getByRole("switch");

    fireEvent.click(toggleInput);
    expect(mockOnChange).toHaveBeenCalledTimes(1);
    expect(toggleInput).toBeInTheDocument();
  });

  it("disables the toggle when disabled prop is true", () => {
    render(
      <Toggle label="Test Label" disabled onCheckedChange={mockOnChange} />,
    );
    const toggleInput = screen.getByRole("switch");
    expect(toggleInput).toBeDisabled();
  });

  it("renders with custom className", () => {
    // this is a custom class name for testing purposes
    // eslint-disable-next-line tailwindcss/no-custom-classname
    render(<Toggle className="custom-class" />);
    const toggle = screen.getByTestId("custom-class");
    expect(toggle).toHaveClass("custom-class");
  });
});

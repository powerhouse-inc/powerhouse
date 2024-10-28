import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CheckboxField } from "./checkbox-field";

describe("CheckboxField", () => {
  it("should render with label", () => {
    render(<CheckboxField label="Test checkbox" />);
    expect(screen.getByText("Test checkbox")).toBeInTheDocument();
  });

  it("should render with description icon", () => {
    render(
      <CheckboxField
        label="Test checkbox"
        description="This is a description"
      />,
    );
    expect(screen.getByTestId("icon-fallback")).toBeInTheDocument();
  });

  it("should handle checked state", () => {
    const handleChange = vi.fn();
    render(
      <CheckboxField
        label="Test checkbox"
        checked={false}
        onChange={handleChange}
      />,
    );

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it("should be disabled when disabled prop is true", () => {
    render(<CheckboxField label="Test checkbox" disabled={true} />);

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeDisabled();
  });

  it("should show required indicator when required", () => {
    render(<CheckboxField label="Test checkbox" required={true} />);

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeRequired();
  });
});

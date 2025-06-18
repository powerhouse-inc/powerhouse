import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CheckboxBase } from "./checkbox-base.js";

describe("Checkbox", () => {
  it("should render a checkbox", () => {
    render(<CheckboxBase />);
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("should handle checked state", () => {
    const handleCheckedChange = vi.fn();
    render(<CheckboxBase onCheckedChange={handleCheckedChange} />);

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(handleCheckedChange).toHaveBeenCalledWith(true);
  });

  it("should be disabled when disabled prop is true", () => {
    render(<CheckboxBase disabled />);
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});

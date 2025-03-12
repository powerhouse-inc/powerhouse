import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Checkbox } from "./checkbox.js";

describe("Checkbox", () => {
  it("should render a checkbox", () => {
    render(<Checkbox />);
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("should handle checked state", () => {
    const handleCheckedChange = vi.fn();
    render(<Checkbox onCheckedChange={handleCheckedChange} />);

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(handleCheckedChange).toHaveBeenCalledWith(true);
  });

  it("should be disabled when disabled prop is true", () => {
    render(<Checkbox disabled />);
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});

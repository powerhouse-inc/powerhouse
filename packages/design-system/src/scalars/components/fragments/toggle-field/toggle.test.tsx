import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import { Toggle } from "./toggle.js";
import { vi } from "vitest";

describe("Toggle Component", () => {
  const defaultProps = {
    onChange: vi.fn(),
    disabled: false,
    checked: false,
    required: false,
  };

  describe("Testing the interactive behavior of the Toggle component", () => {
    it("should call onChange with correct value when clicked", () => {
      const handleChange = vi.fn();
      render(<Toggle {...defaultProps} onChange={handleChange} />);

      const toggle = screen.getByRole("switch");
      fireEvent.click(toggle);

      expect(handleChange).toHaveBeenCalledTimes(1);
      expect(handleChange).toHaveBeenCalledWith(true);
    });

    it("should not call onChange when disabled", () => {
      const handleChange = vi.fn();
      render(
        <Toggle {...defaultProps} disabled={true} onChange={handleChange} />,
      );

      const toggle = screen.getByRole("switch");
      fireEvent.click(toggle);

      expect(handleChange).not.toHaveBeenCalled();
    });

    it("should toggle between checked and unchecked states", () => {
      const handleChange = vi.fn();
      const { rerender } = render(
        <Toggle {...defaultProps} checked={false} onChange={handleChange} />,
      );

      const toggle = screen.getByRole("switch");

      expect(toggle).toHaveAttribute("data-state", "unchecked");

      fireEvent.click(toggle);
      rerender(
        <Toggle {...defaultProps} checked={true} onChange={handleChange} />,
      );

      expect(toggle).toHaveAttribute("data-state", "checked");
    });
  });

  describe("Testing rendering characteristics of the Toggle component", () => {
    it("should render with correct initial checked state", () => {
      render(<Toggle {...defaultProps} checked={true} />);
      const toggle = screen.getByRole("switch");
      expect(toggle).toHaveAttribute("data-state", "checked");
    });

    it("should render as unchecked when checked prop is false", () => {
      render(<Toggle {...defaultProps} checked={false} />);
      const toggle = screen.getByRole("switch");
      expect(toggle).toHaveAttribute("data-state", "unchecked");
    });

    it("should apply disabled styles when disabled", () => {
      render(<Toggle {...defaultProps} disabled={true} checked={true} />);
      const toggle = screen.getByRole("switch");

      expect(toggle).toHaveClass("cursor-not-allowed");
      expect(toggle).toHaveClass("data-[state=checked]:bg-[#C5C7C7]");
    });

    it("should mark as required when disabled prop is true", () => {
      render(<Toggle {...defaultProps} disabled={true} />);
      const toggle = screen.getByRole("switch");

      expect(toggle).toHaveAttribute("disabled");
    });

    it("should apply custom className when provided", () => {
      const customClass = "custom-class";
      render(<Toggle {...defaultProps} className={customClass} />);
      const toggle = screen.getByRole("switch");

      expect(toggle).toHaveClass(customClass);
    });
  });
});

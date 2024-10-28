import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Radio } from "../radio";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";

describe("Radio Component", () => {
  it("should match snapshot", () => {
    const { asFragment } = render(
      <RadioGroupPrimitive.Root>
        <Radio label="Test Label" value="test" />,
      </RadioGroupPrimitive.Root>,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it("renders with required label and value", () => {
    render(
      <RadioGroupPrimitive.Root>
        <Radio label="Test Label" value="test" />,
      </RadioGroupPrimitive.Root>,
    );
    expect(screen.getByText("Test Label")).toBeInTheDocument();
    expect(screen.getByRole("radio")).toHaveAttribute("value", "test");
  });

  it("renders with description", () => {
    render(
      <RadioGroupPrimitive.Root>
        <Radio label="Test Label" value="test" description="Test Description" />
      </RadioGroupPrimitive.Root>,
    );
    // Check that the info icon fallback is rendered
    const iconFallback = screen.getByTestId("icon-fallback");
    expect(iconFallback).toBeInTheDocument();
    expect(iconFallback).toHaveStyle({ width: "16px", height: "16px" });
  });

  it("applies error styles when hasError is true", () => {
    render(
      <RadioGroupPrimitive.Root>
        <Radio label="Test Label" value="test" hasError={true} />,
      </RadioGroupPrimitive.Root>,
    );
    const radio = screen.getByRole("radio");
    expect(radio).toHaveAttribute("aria-invalid", "true");
    expect(radio).toHaveClass("border-red-700");
  });

  it("applies readonly styles and attributes", () => {
    render(
      <RadioGroupPrimitive.Root>
        <Radio label="Test Label" value="test" readOnly={true} />,
      </RadioGroupPrimitive.Root>,
    );
    const radio = screen.getByRole("radio");
    expect(radio).toHaveAttribute("aria-readonly", "true");
    expect(radio).toHaveAttribute("aria-disabled", "true");
    expect(radio).toHaveClass("cursor-not-allowed");
  });

  it("renders with custom className", () => {
    render(
      <RadioGroupPrimitive.Root>
        <Radio label="Test Label" value="test" className="custom-class" />,
      </RadioGroupPrimitive.Root>,
    );
    expect(screen.getByRole("radio")).toHaveClass("custom-class");
  });

  it("uses provided id when specified", () => {
    render(
      <RadioGroupPrimitive.Root>
        <Radio label="Test Label" value="test" id="custom-id" />,
      </RadioGroupPrimitive.Root>,
    );
    expect(screen.getByRole("radio")).toHaveAttribute("id", "custom-id");
  });

  it("generates unique id when not provided", () => {
    render(
      <RadioGroupPrimitive.Root>
        <Radio label="Test Label" value="test" />,
      </RadioGroupPrimitive.Root>,
    );
    const radio = screen.getByRole("radio");
    expect(radio.id).toMatch(/^.*-radio$/); // Check if id ends with -radio
  });
});

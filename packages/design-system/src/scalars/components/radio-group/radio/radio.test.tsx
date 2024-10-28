import { describe, expect, it } from "vitest";
import { Radio } from "../radio";
import { RadioGroup } from "../radio-group";
import { render, screen } from "@testing-library/react";

describe("Radio Component", () => {
  it("should match snapshot", () => {
    const { asFragment } = render(
      <RadioGroup>
        <Radio label="Test Label" value="test" />
      </RadioGroup>,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it("renders with label and value", () => {
    render(
      <RadioGroup>
        <Radio label="Test Label" value="test" />
      </RadioGroup>,
    );
    expect(screen.getByText("Test Label")).toBeInTheDocument();
    expect(screen.getByRole("radio")).toHaveAttribute("value", "test");
  });

  it("renders with description", () => {
    render(
      <RadioGroup>
        <Radio label="Test Label" value="test" description="Test Description" />
      </RadioGroup>,
    );
    // Check that the info icon fallback is rendered
    const iconFallback = screen.getByTestId("icon-fallback");
    expect(iconFallback).toBeInTheDocument();
    expect(iconFallback).toHaveStyle({ width: "16px", height: "16px" });
  });

  it("applies error styles when hasError is true", () => {
    render(
      <RadioGroup>
        <Radio label="Test Label" value="test" hasError={true} />
      </RadioGroup>,
    );
    const radio = screen.getByRole("radio");
    expect(radio).toHaveAttribute("aria-invalid", "true");
    expect(radio).toHaveClass("border-red-700");
  });

  it("applies disabled styles and attributes", () => {
    render(
      <RadioGroup>
        <Radio label="Test Label" value="test" disabled={true} />
      </RadioGroup>,
    );
    const radio = screen.getByRole("radio");
    expect(radio).toHaveAttribute("aria-disabled", "true");
    expect(radio).toHaveClass("cursor-not-allowed");
  });

  it("renders with custom className", () => {
    render(
      <RadioGroup>
        <Radio label="Test Label" value="test" className="custom-class" />
      </RadioGroup>,
    );
    expect(screen.getByRole("radio")).toHaveClass("custom-class");
  });

  it("uses provided id when specified", () => {
    render(
      <RadioGroup>
        <Radio label="Test Label" value="test" id="custom-id" />
      </RadioGroup>,
    );
    expect(screen.getByRole("radio")).toHaveAttribute("id", "custom-id");
  });

  it("generates unique id when not provided", () => {
    render(
      <RadioGroup>
        <Radio label="Test Label" value="test" />
      </RadioGroup>,
    );
    const radio = screen.getByRole("radio");
    expect(radio.id).toMatch(/^.*-radio$/); // Check if id ends with -radio
  });
});

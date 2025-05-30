import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CustomizableRadioGroup } from "./customizable-radio-group.js";
import { Radio } from "./radio.js";

describe("Radio Component", () => {
  it("should match snapshot", () => {
    const { asFragment } = render(
      <CustomizableRadioGroup name="radio-group">
        <Radio label="Test Label" value="test" />
      </CustomizableRadioGroup>,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it("should render with label and value", () => {
    render(
      <CustomizableRadioGroup name="radio-group">
        <Radio label="Test Label" value="test" />
      </CustomizableRadioGroup>,
    );
    expect(screen.getByText("Test Label")).toBeInTheDocument();
    expect(screen.getByRole("radio")).toHaveAttribute("value", "test");
  });

  it("should render with description", () => {
    render(
      <CustomizableRadioGroup name="radio-group">
        <Radio label="Test Label" value="test" description="Test Description" />
      </CustomizableRadioGroup>,
    );
    // Check that the info icon fallback is rendered
    const iconFallback = screen.getByTestId("icon-fallback");
    expect(iconFallback).toBeInTheDocument();
    expect(iconFallback).toHaveStyle({ width: "16px", height: "16px" });
  });

  it("should apply error styles when hasError is true", () => {
    render(
      <CustomizableRadioGroup name="radio-group">
        <Radio label="Test Label" value="test" hasError />
      </CustomizableRadioGroup>,
    );
    const radio = screen.getByRole("radio");
    expect(radio).toHaveAttribute("aria-invalid", "true");
    expect(radio).toHaveClass("border-red-700");
  });

  it("should apply disabled styles and attributes", () => {
    render(
      <CustomizableRadioGroup name="radio-group">
        <Radio label="Test Label" value="test" disabled />
      </CustomizableRadioGroup>,
    );
    const radio = screen.getByRole("radio");
    expect(radio).toHaveAttribute("aria-disabled", "true");
    expect(radio).toHaveClass("cursor-not-allowed");
  });

  it("should render with custom className", () => {
    render(
      <CustomizableRadioGroup name="radio-group">
        {/* Custom className for testing purposes */}
        <Radio label="Test Label" value="test" className="custom-class" />
      </CustomizableRadioGroup>,
    );
    expect(screen.getByRole("radio")).toHaveClass("custom-class");
  });

  it("should use provided id when specified", () => {
    render(
      <CustomizableRadioGroup name="radio-group">
        <Radio label="Test Label" value="test" id="custom-id" />
      </CustomizableRadioGroup>,
    );
    expect(screen.getByRole("radio")).toHaveAttribute("id", "custom-id");
  });

  it("should generate unique id when not provided", () => {
    render(
      <CustomizableRadioGroup name="radio-group">
        <Radio label="Test Label" value="test" />
      </CustomizableRadioGroup>,
    );
    const radio = screen.getByRole("radio");
    // Check that the id ends with -radio
    expect(radio.id).toMatch(/^.*-radio$/);
  });

  it("should select the radio when the label is clicked", async () => {
    const user = userEvent.setup();
    render(
      <CustomizableRadioGroup name="radio-group">
        <Radio label="Test Label" value="test" />
      </CustomizableRadioGroup>,
    );
    const label = screen.getByText("Test Label");
    const radio = screen.getByRole("radio");
    await user.click(label);
    expect(radio).toBeChecked();
  });
});

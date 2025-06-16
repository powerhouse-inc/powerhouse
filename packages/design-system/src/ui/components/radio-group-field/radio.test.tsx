import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { RadioGroup } from "./radio-group.js";
import { Radio } from "./radio.js";

describe("Radio Component", () => {
  it("should match snapshot", () => {
    const { asFragment } = render(
      <RadioGroup name="radio-group">
        <Radio label="Test Label" value="test" />
      </RadioGroup>,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it("should render with label and value", () => {
    render(
      <RadioGroup name="radio-group">
        <Radio label="Test Label" value="test" />
      </RadioGroup>,
    );
    expect(screen.getByText("Test Label")).toBeInTheDocument();
    expect(screen.getByRole("radio")).toHaveAttribute("value", "test");
  });

  it("should render with description", () => {
    render(
      <RadioGroup name="radio-group">
        <Radio label="Test Label" value="test" description="Test Description" />
      </RadioGroup>,
    );
    // Check that the info icon button is rendered
    const iconButton = screen.getByRole("button");
    expect(iconButton).toBeInTheDocument();
    // Check that the SVG is rendered with correct dimensions
    const svg = iconButton.querySelector("svg");
    expect(svg).toHaveStyle({ width: "16px", height: "16px" });
  });

  it("should apply error styles when hasError is true", () => {
    render(
      <RadioGroup name="radio-group">
        <Radio label="Test Label" value="test" hasError />
      </RadioGroup>,
    );
    const radio = screen.getByRole("radio");
    expect(radio).toHaveAttribute("aria-invalid", "true");
    expect(radio).toHaveClass("border-red-700");
  });

  it("should apply disabled styles and attributes", () => {
    render(
      <RadioGroup name="radio-group">
        <Radio label="Test Label" value="test" disabled />
      </RadioGroup>,
    );
    const radio = screen.getByRole("radio");
    expect(radio).toHaveAttribute("aria-disabled", "true");
    expect(radio).toHaveClass("cursor-not-allowed");
  });

  it("should render with custom className", () => {
    render(
      <RadioGroup name="radio-group">
        {/* Custom className for testing purposes */}
        <Radio label="Test Label" value="test" className="custom-class" />
      </RadioGroup>,
    );
    expect(screen.getByRole("radio")).toHaveClass("custom-class");
  });

  it("should use provided id when specified", () => {
    render(
      <RadioGroup name="radio-group">
        <Radio label="Test Label" value="test" id="custom-id" />
      </RadioGroup>,
    );
    expect(screen.getByRole("radio")).toHaveAttribute("id", "custom-id");
  });

  it("should generate unique id when not provided", () => {
    render(
      <RadioGroup name="radio-group">
        <Radio label="Test Label" value="test" />
      </RadioGroup>,
    );
    const radio = screen.getByRole("radio");
    // Check that the id ends with -radio
    expect(radio.id).toMatch(/^.*-radio$/);
  });

  it("should select the radio when the label is clicked", async () => {
    const user = userEvent.setup();
    render(
      <RadioGroup name="radio-group">
        <Radio label="Test Label" value="test" />
      </RadioGroup>,
    );
    const label = screen.getByText("Test Label");
    const radio = screen.getByRole("radio");
    await user.click(label);
    expect(radio).toBeChecked();
  });
});

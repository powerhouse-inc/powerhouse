import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CustomizableRadioGroup } from "./customizable-radio-group.js";
import { Radio } from "./radio.js";

describe("CustomizableRadioGroup Component", () => {
  it("should match snapshot", () => {
    const { asFragment } = render(
      <CustomizableRadioGroup name="radio-group">
        <Radio label="Option 1" value="1" />
        <Radio label="Option 2" value="2" />
      </CustomizableRadioGroup>,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it("should render Radio options with label", () => {
    render(
      <CustomizableRadioGroup name="radio-group">
        <Radio label="Option 1" value="1" />
        <Radio label="Option 2" value="2" />
      </CustomizableRadioGroup>,
    );
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    expect(screen.getByText("Option 1")).toBeInTheDocument();
    expect(screen.getByText("Option 2")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("should call onValueChange when a Radio label is clicked", async () => {
    const onValueChangeMock = vi.fn();
    const user = userEvent.setup();
    render(
      <CustomizableRadioGroup
        name="radio-group"
        onValueChange={onValueChangeMock}
      >
        <Radio label="Option 1" value="1" />
        <Radio label="Option 2" value="2" />
      </CustomizableRadioGroup>,
    );
    await user.click(screen.getByLabelText("Option 1"));
    expect(onValueChangeMock).toHaveBeenCalledTimes(1);
    expect(onValueChangeMock).toHaveBeenCalledWith("1");
  });

  it("should change the value when a different Radio is selected", async () => {
    const user = userEvent.setup();
    render(
      <CustomizableRadioGroup name="radio-group" defaultValue="1">
        <Radio label="Option 1" value="1" />
        <Radio label="Option 2" value="2" />
      </CustomizableRadioGroup>,
    );
    const radio1 = screen.getByLabelText("Option 1");
    const radio2 = screen.getByLabelText("Option 2");
    expect(radio1).toBeChecked();
    expect(radio2).not.toBeChecked();
    await user.click(radio2);
    expect(radio1).not.toBeChecked();
    expect(radio2).toBeChecked();
  });

  it("should handle accessibility (aria-label)", () => {
    render(
      <CustomizableRadioGroup name="radio-group" aria-label="unlabeled group">
        <Radio label="Option 1" value="1" />
      </CustomizableRadioGroup>,
    );
    const radioGroup = screen.getByRole("radiogroup");
    expect(radioGroup).toHaveAttribute("aria-label", "unlabeled group");
  });

  it("should generate unique ids when not provided", () => {
    render(
      <CustomizableRadioGroup name="radio-group">
        <Radio label="Option 1" value="1" />
      </CustomizableRadioGroup>,
    );
    const radioGroup = screen.getByRole("radiogroup");
    expect(radioGroup.id).toMatch(/^.*-radio-group$/);
  });

  it("should use provided id when specified", () => {
    render(
      <CustomizableRadioGroup name="radio-group" id="custom-id">
        <Radio label="Option 1" value="1" />
      </CustomizableRadioGroup>,
    );
    const radioGroup = screen.getByRole("radiogroup");
    expect(radioGroup).toHaveAttribute("id", "custom-id");
  });

  it("should handle required state", () => {
    render(
      <CustomizableRadioGroup name="radio-group" required>
        <Radio label="Option 1" value="1" />
      </CustomizableRadioGroup>,
    );
    const radioGroup = screen.getByRole("radiogroup");
    expect(radioGroup).toHaveAttribute("aria-required", "true");
  });

  it("should handle defaultValue", () => {
    render(
      <CustomizableRadioGroup name="radio-group" defaultValue="2">
        <Radio label="Option 1" value="1" />
        <Radio label="Option 2" value="2" />
      </CustomizableRadioGroup>,
    );
    const selectedRadio = screen.getByLabelText("Option 2");
    expect(selectedRadio).toBeChecked();
  });

  it("should handle value", () => {
    render(
      <CustomizableRadioGroup name="radio-group" value="1">
        <Radio label="Option 1" value="1" />
        <Radio label="Option 2" value="2" />
      </CustomizableRadioGroup>,
    );
    const selectedRadio = screen.getByLabelText("Option 1");
    expect(selectedRadio).toBeChecked();
  });

  it("should apply custom className", () => {
    render(
      // Custom className for testing purposes
      <CustomizableRadioGroup name="radio-group" className="custom-class">
        <Radio label="Option 1" value="1" />
      </CustomizableRadioGroup>,
    );
    const radioGroup = screen.getByRole("radiogroup");
    expect(radioGroup).toHaveClass("custom-class");
  });
});

import { describe, expect, it, vi } from "vitest";
import { Radio } from "../radio";
import { RadioGroup } from "./radio-group";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

describe("RadioGroup Component", () => {
  it("should match snapshot", () => {
    const { asFragment } = render(
      <RadioGroup>
        <Radio label="Option 1" value="1" />
      </RadioGroup>,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it("should render radio options with label", () => {
    render(
      <RadioGroup label="Group Label">
        <Radio label="Option 1" value="1" />
        <Radio label="Option 2" value="2" />
      </RadioGroup>,
    );
    expect(screen.getByText("Group Label")).toBeInTheDocument();
    expect(screen.getByText("Option 1")).toBeInTheDocument();
    expect(screen.getByText("Option 2")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("should call onValueChange when a Radio label is clicked", async () => {
    const onValueChangeMock = vi.fn();
    const user = userEvent.setup();
    render(
      <RadioGroup onValueChange={onValueChangeMock}>
        <Radio label="Option 1" value="1" />
        <Radio label="Option 2" value="2" />
      </RadioGroup>,
    );
    await user.click(screen.getByLabelText("Option 1"));
    expect(onValueChangeMock).toHaveBeenCalledTimes(1);
    expect(onValueChangeMock).toHaveBeenCalledWith("1");
  });

  it("should change the value when a different radio is selected", async () => {
    const user = userEvent.setup();
    render(
      <RadioGroup defaultValue="1">
        <Radio label="Option 1" value="1" />
        <Radio label="Option 2" value="2" />
      </RadioGroup>,
    );
    const radio1 = screen.getByLabelText("Option 1");
    const radio2 = screen.getByLabelText("Option 2");
    expect(radio1).toBeChecked();
    expect(radio2).not.toBeChecked();
    await user.click(radio2);
    expect(radio1).not.toBeChecked();
    expect(radio2).toBeChecked();
  });

  it("should display description when provided", () => {
    render(
      <RadioGroup label="Group Label" description="Group Description">
        <Radio label="Option 1" value="1" />
      </RadioGroup>,
    );
    // Check that the info icon fallback is rendered
    const iconFallback = screen.getByTestId("icon-fallback");
    expect(iconFallback).toBeInTheDocument();
    expect(iconFallback).toHaveStyle({ width: "16px", height: "16px" });
  });

  it("should show error state when errors are provided", () => {
    render(
      <RadioGroup label="Group Label" errors={["Error message"]}>
        <Radio label="Option 1" value="1" />
      </RadioGroup>,
    );
    const radioGroup = screen.getByRole("radiogroup");
    expect(radioGroup).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Error message")).toBeInTheDocument();
  });

  it("should handle no label scenario", () => {
    render(
      <RadioGroup aria-label="unlabeled group">
        <Radio label="Option 1" value="1" />
      </RadioGroup>,
    );
    const radioGroup = screen.getByRole("radiogroup");
    expect(radioGroup).toHaveAttribute("aria-label", "unlabeled group");
  });

  it("should generate unique ids when not provided", () => {
    render(
      <RadioGroup>
        <Radio label="Option 1" value="1" />
      </RadioGroup>,
    );
    const radioGroup = screen.getByRole("radiogroup");
    expect(radioGroup.id).toMatch(/^.*-radio-group$/);
  });

  it("should use provided id when specified", () => {
    render(
      <RadioGroup id="custom-id">
        <Radio label="Option 1" value="1" />
      </RadioGroup>,
    );
    const radioGroup = screen.getByRole("radiogroup");
    expect(radioGroup).toHaveAttribute("id", "custom-id");
  });

  it("should handle required state", () => {
    render(
      <RadioGroup label="Group Label" required>
        <Radio label="Option 1" value="1" />
      </RadioGroup>,
    );
    const radioGroup = screen.getByRole("radiogroup");
    expect(radioGroup).toHaveAttribute("aria-required", "true");
  });

  it("should handle defaultValue", () => {
    render(
      <RadioGroup defaultValue="2">
        <Radio label="Option 1" value="1" />
        <Radio label="Option 2" value="2" />
      </RadioGroup>,
    );
    const selectedRadio = screen.getByLabelText("Option 2");
    expect(selectedRadio).toBeChecked();
  });

  it("should handle controlled value", () => {
    render(
      <RadioGroup value="1">
        <Radio label="Option 1" value="1" />
        <Radio label="Option 2" value="2" />
      </RadioGroup>,
    );
    const selectedRadio = screen.getByLabelText("Option 1");
    expect(selectedRadio).toBeChecked();
  });

  it("should apply custom className", () => {
    render(
      // Custom className for testing purposes
      // eslint-disable-next-line tailwindcss/no-custom-classname
      <RadioGroup className="custom-class">
        <Radio label="Option 1" value="1" />
      </RadioGroup>,
    );
    const radioGroup = screen.getByRole("radiogroup");
    expect(radioGroup).toHaveClass("custom-class");
  });

  it("should handle multiple errors", () => {
    render(
      <RadioGroup label="Group Label" errors={["Error 1", "Error 2"]}>
        <Radio label="Option 1" value="1" />
      </RadioGroup>,
    );
    expect(screen.getByText("Error 1")).toBeInTheDocument();
    expect(screen.getByText("Error 2")).toBeInTheDocument();
  });
});

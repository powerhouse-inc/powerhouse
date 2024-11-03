import { describe, expect, it, vi } from "vitest";
import { RadioGroupField } from "./radio-group-field";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

describe("RadioGroupField Component", () => {
  it("should match snapshot", () => {
    const { asFragment } = render(
      <RadioGroupField radioOptions={[{ label: "Option 1", value: "1" }]} />,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it("should render radio options with label", () => {
    render(
      <RadioGroupField
        label="Group Label"
        radioOptions={[
          { label: "Option 1", value: "1" },
          { label: "Option 2", value: "2" },
        ]}
      />,
    );
    expect(screen.getByText("Group Label")).toBeInTheDocument();
    expect(screen.getByText("Option 1")).toBeInTheDocument();
    expect(screen.getByText("Option 2")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("should call onChange when a Radio label is clicked", async () => {
    const onChangeMock = vi.fn();
    const user = userEvent.setup();
    render(
      <RadioGroupField
        onChange={onChangeMock}
        radioOptions={[
          { label: "Option 1", value: "1" },
          { label: "Option 2", value: "2" },
        ]}
      />,
    );
    await user.click(screen.getByLabelText("Option 1"));
    expect(onChangeMock).toHaveBeenCalledTimes(1);
    expect(onChangeMock).toHaveBeenCalledWith("1");
  });

  it("should change the value when a different radio is selected", async () => {
    const user = userEvent.setup();
    render(
      <RadioGroupField
        defaultValue="1"
        radioOptions={[
          { label: "Option 1", value: "1" },
          { label: "Option 2", value: "2" },
        ]}
      />,
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
      <RadioGroupField
        label="Group Label"
        description="Group Description"
        radioOptions={[{ label: "Option 1", value: "1" }]}
      />,
    );
    // Check that the info icon fallback is rendered
    const iconFallback = screen.getByTestId("icon-fallback");
    expect(iconFallback).toBeInTheDocument();
    expect(iconFallback).toHaveStyle({ width: "16px", height: "16px" });
  });

  it("should show a warning when provided", () => {
    render(
      <RadioGroupField
        label="Group Label"
        warnings={["Warning message"]}
        radioOptions={[{ label: "Option 1", value: "1" }]}
      />,
    );
    expect(screen.getByText("Warning message")).toBeInTheDocument();
  });

  it("should show an error when provided", () => {
    render(
      <RadioGroupField
        label="Group Label"
        errors={["Error message"]}
        radioOptions={[{ label: "Option 1", value: "1" }]}
      />,
    );
    const radioGroup = screen.getByRole("radiogroup");
    expect(radioGroup).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Error message")).toBeInTheDocument();
  });

  it("should have aria-label when no label is provided", () => {
    render(
      <RadioGroupField radioOptions={[{ label: "Option 1", value: "1" }]} />,
    );
    const radioGroup = screen.getByRole("radiogroup");
    expect(radioGroup).toHaveAttribute("aria-label", "Radio group");
  });

  it("should generate unique ids when not provided", () => {
    render(
      <RadioGroupField radioOptions={[{ label: "Option 1", value: "1" }]} />,
    );
    const radioGroup = screen.getByRole("radiogroup");
    expect(radioGroup.id).toMatch(/^.*-radio-group$/);
  });

  it("should use provided id when specified", () => {
    render(
      <RadioGroupField
        id="custom-id"
        radioOptions={[{ label: "Option 1", value: "1" }]}
      />,
    );
    const radioGroup = screen.getByRole("radiogroup");
    expect(radioGroup).toHaveAttribute("id", "custom-id");
  });

  it("should handle required state", () => {
    render(
      <RadioGroupField
        label="Group Label"
        required
        radioOptions={[{ label: "Option 1", value: "1" }]}
      />,
    );
    const radioGroup = screen.getByRole("radiogroup");
    expect(radioGroup).toHaveAttribute("aria-required", "true");
  });

  it("should handle defaultValue", () => {
    render(
      <RadioGroupField
        defaultValue="2"
        radioOptions={[
          { label: "Option 1", value: "1" },
          { label: "Option 2", value: "2" },
        ]}
      />,
    );
    const selectedRadio = screen.getByLabelText("Option 2");
    expect(selectedRadio).toBeChecked();
  });

  it("should handle controlled value", () => {
    render(
      <RadioGroupField
        value="1"
        radioOptions={[
          { label: "Option 1", value: "1" },
          { label: "Option 2", value: "2" },
        ]}
      />,
    );
    const selectedRadio = screen.getByLabelText("Option 1");
    expect(selectedRadio).toBeChecked();
  });

  it("should apply custom className", () => {
    render(
      <RadioGroupField
        // Custom className for testing purposes
        // eslint-disable-next-line tailwindcss/no-custom-classname
        className="custom-class"
        radioOptions={[{ label: "Option 1", value: "1" }]}
      />,
    );
    const radioGroup = screen.getByRole("radiogroup");
    expect(radioGroup).toHaveClass("custom-class");
  });

  it("should handle multiple warnings", () => {
    render(
      <RadioGroupField
        label="Group Label"
        warnings={["Warning 1", "Warning 2"]}
        radioOptions={[{ label: "Option 1", value: "1" }]}
      />,
    );
    expect(screen.getByText("Warning 1")).toBeInTheDocument();
    expect(screen.getByText("Warning 2")).toBeInTheDocument();
  });

  it("should handle multiple errors", () => {
    render(
      <RadioGroupField
        label="Group Label"
        errors={["Error 1", "Error 2"]}
        radioOptions={[{ label: "Option 1", value: "1" }]}
      />,
    );
    expect(screen.getByText("Error 1")).toBeInTheDocument();
    expect(screen.getByText("Error 2")).toBeInTheDocument();
  });

  it("should show both warnings and errors when provided", () => {
    render(
      <RadioGroupField
        label="Group Label"
        warnings={["Warning message"]}
        errors={["Error message"]}
        radioOptions={[{ label: "Option 1", value: "1" }]}
      />,
    );
    expect(screen.getByText("Warning message")).toBeInTheDocument();
    expect(screen.getByText("Error message")).toBeInTheDocument();
  });
});

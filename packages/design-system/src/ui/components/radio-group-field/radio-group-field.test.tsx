import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithForm } from "../../lib/testing.js";
import { RadioGroupField } from "./radio-group-field.js";

describe("RadioGroupField Component", () => {
  it("should match snapshot", () => {
    const { asFragment } = renderWithForm(
      <RadioGroupField
        name="radio-group"
        options={[
          { label: "Option 1", value: "1" },
          { label: "Option 2", value: "2" },
        ]}
      />,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it("should render radio options with label", () => {
    renderWithForm(
      <RadioGroupField
        name="radio-group"
        label="Group Label"
        options={[
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
    renderWithForm(
      <RadioGroupField
        name="radio-group"
        onChange={onChangeMock}
        options={[
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
    renderWithForm(
      <RadioGroupField
        name="radio-group"
        defaultValue="1"
        options={[
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
    renderWithForm(
      <RadioGroupField
        name="radio-group"
        label="Group Label"
        description="Group Description"
        options={[{ label: "Option 1", value: "1" }]}
      />,
    );
    const iconButton = screen.getByRole("button");
    expect(iconButton).toBeInTheDocument();
    // Check that the SVG is rendered with correct dimensions
    const svg = iconButton.querySelector("svg");
    expect(svg).toHaveStyle({ width: "16px", height: "16px" });
  });

  it("should show a warning when provided", () => {
    renderWithForm(
      <RadioGroupField
        name="radio-group"
        label="Group Label"
        warnings={["Warning message"]}
        options={[{ label: "Option 1", value: "1" }]}
      />,
    );
    expect(screen.getByText("Warning message")).toBeInTheDocument();
  });

  it("should show an error when provided", async () => {
    renderWithForm(
      <RadioGroupField
        name="radio-group"
        label="Group Label"
        errors={["Error message"]}
        options={[{ label: "Option 1", value: "1" }]}
      />,
    );
    const radioGroup = screen.getByRole("radiogroup");
    await waitFor(() =>
      expect(radioGroup).toHaveAttribute("aria-invalid", "true"),
    );
    await waitFor(() =>
      expect(screen.getByText("Error message")).toBeInTheDocument(),
    );
  });

  it("should have aria-label when no label is provided", () => {
    renderWithForm(
      <RadioGroupField
        name="radio-group"
        options={[{ label: "Option 1", value: "1" }]}
      />,
    );
    const radioGroup = screen.getByRole("radiogroup");
    expect(radioGroup).toHaveAttribute("aria-label", "Radio group");
  });

  it("should generate unique ids when not provided", () => {
    renderWithForm(
      <RadioGroupField
        name="radio-group"
        options={[{ label: "Option 1", value: "1" }]}
      />,
    );
    const radioGroup = screen.getByRole("radiogroup");
    expect(radioGroup.id).toMatch(/^.*-radio-group$/);
  });

  it("should use provided id when specified", () => {
    renderWithForm(
      <RadioGroupField
        id="custom-id"
        name="radio-group"
        options={[{ label: "Option 1", value: "1" }]}
      />,
    );
    const radioGroup = screen.getByRole("radiogroup");
    expect(radioGroup).toHaveAttribute("id", "custom-id");
  });

  it("should handle required state", () => {
    renderWithForm(
      <RadioGroupField
        name="radio-group"
        label="Group Label"
        required
        options={[{ label: "Option 1", value: "1" }]}
      />,
    );
    const radioGroup = screen.getByRole("radiogroup");
    expect(radioGroup).toHaveAttribute("aria-required", "true");
  });

  it("should handle defaultValue", () => {
    renderWithForm(
      <RadioGroupField
        name="radio-group"
        defaultValue="2"
        options={[
          { label: "Option 1", value: "1" },
          { label: "Option 2", value: "2" },
        ]}
      />,
    );
    const selectedRadio = screen.getByLabelText("Option 2");
    expect(selectedRadio).toBeChecked();
  });

  it("should handle value", () => {
    renderWithForm(
      <RadioGroupField
        name="radio-group"
        value="1"
        options={[
          { label: "Option 1", value: "1" },
          { label: "Option 2", value: "2" },
        ]}
      />,
    );
    const selectedRadio = screen.getByLabelText("Option 1");
    expect(selectedRadio).toBeChecked();
  });

  it("should apply custom className", () => {
    renderWithForm(
      <RadioGroupField
        name="radio-group"
        // Custom className for testing purposes

        className="custom-class"
        options={[{ label: "Option 1", value: "1" }]}
      />,
    );
    const radioGroup = screen.getByRole("radiogroup");
    expect(radioGroup).toHaveClass("custom-class");
  });

  it("should handle multiple warnings", () => {
    renderWithForm(
      <RadioGroupField
        name="radio-group"
        label="Group Label"
        warnings={["Warning 1", "Warning 2"]}
        options={[{ label: "Option 1", value: "1" }]}
      />,
    );
    expect(screen.getByText("Warning 1")).toBeInTheDocument();
    expect(screen.getByText("Warning 2")).toBeInTheDocument();
  });

  it("should handle multiple errors", async () => {
    renderWithForm(
      <RadioGroupField
        name="radio-group"
        label="Group Label"
        errors={["Error 1", "Error 2"]}
        options={[{ label: "Option 1", value: "1" }]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("Error 1")).toBeInTheDocument();
      expect(screen.getByText("Error 2")).toBeInTheDocument();
    });
  });

  it("should show both warnings and errors when provided", async () => {
    renderWithForm(
      <RadioGroupField
        name="radio-group"
        label="Group Label"
        warnings={["Warning message"]}
        errors={["Error message"]}
        options={[{ label: "Option 1", value: "1" }]}
      />,
    );
    expect(screen.getByText("Warning message")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Error message")).toBeInTheDocument(),
    );
  });
});

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumberField } from "./number-field";
describe("NumberField Component", () => {
  const mockOnChange = vi.fn();
  it("should match snapshot", () => {
    const { container } = render(
      <NumberField label="Test Label" name="Label" />,
    );
    expect(container).toMatchSnapshot();
  });

  it("should renders label when label its provided", () => {
    render(
      <NumberField label="Test Label" onChange={mockOnChange} name="Label" />,
    );
    expect(screen.getByLabelText("Test Label")).toBeInTheDocument();
  });

  it("should renders the description when provided", () => {
    render(
      <NumberField
        label="Test Label"
        description="This is a description"
        onChange={mockOnChange}
        name="Label"
      />,
    );
    expect(screen.getByText("This is a description")).toBeInTheDocument();
  });

  it("should renders error messages when provided", () => {
    render(
      <NumberField
        label="Test Label"
        onChange={mockOnChange}
        errors={["Error 1", "Error 2"]}
        name="Label"
      />,
    );
    expect(screen.getByText("Error 1")).toBeInTheDocument();
    expect(screen.getByText("Error 2")).toBeInTheDocument();
  });

  it("should renders warning messages when provided", () => {
    render(
      <NumberField
        label="Test Label"
        onChange={mockOnChange}
        warnings={["Warning 1", "Warning 2"]}
        name="Label"
      />,
    );
    expect(screen.getByText("Warning 1")).toBeInTheDocument();
    expect(screen.getByText("Warning 2")).toBeInTheDocument();
  });

  it("should calls onChange when the input value changes", async () => {
    const user = userEvent.setup();
    render(<NumberField label="Test Label" name="Label" />);
    const input = screen.getByLabelText("Test Label");

    await user.type(input, "10");
    expect(input).toHaveValue(10);
  });

  it("should disables the input when disabled prop is true", () => {
    render(
      <NumberField
        label="Test Label"
        onChange={mockOnChange}
        disabled
        name="Label"
      />,
    );
    const input = screen.getByRole("spinbutton");

    expect(input).toBeDisabled();
  });

  it("should shows the input as required when required prop is true", () => {
    render(
      <NumberField
        label="Test Label"
        onChange={mockOnChange}
        required
        name="Label"
      />,
    );
    expect(screen.getByRole("spinbutton")).toHaveAttribute("required");
  });

  it("should handles autoComplete set to true", () => {
    render(
      <NumberField
        label="Test Label"
        onChange={mockOnChange}
        autoComplete
        name="Label"
      />,
    );
    expect(screen.getByRole("spinbutton")).toHaveAttribute(
      "autocomplete",
      "on",
    );
  });

  it("should handles autoComplete set to false", () => {
    render(
      <NumberField
        label="Test Label"
        onChange={mockOnChange}
        autoComplete={false}
        name="Label"
      />,
    );
    expect(screen.getByLabelText("Test Label")).toHaveAttribute(
      "autocomplete",
      "off",
    );
  });

  it("should renders input with provided className", () => {
    render(
      <NumberField
        label="Test Label"
        // This a custom class for testing no a class for tailwindcss
        // eslint-disable-next-line tailwindcss/no-custom-classname
        className="custom-class"
        onChange={mockOnChange}
        name="Label"
      />,
    );
    expect(screen.getByLabelText("Test Label")).toHaveClass("custom-class");
  });

  it("should supports a defaultValue prop", () => {
    render(
      <NumberField
        label="Test Label"
        defaultValue={5}
        onChange={mockOnChange}
        name="Label"
      />,
    );
    const input = screen.getByRole("spinbutton");

    expect(input).toHaveValue(5);
  });
});

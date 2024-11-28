import React from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumberField } from "./number-field";
import { renderWithForm } from "@/scalars/lib/testing";

describe("NumberField Component", () => {
  const mockOnChange = vi.fn();
  it("should match snapshot", () => {
    const { container } = renderWithForm(
      <NumberField label="Test Label" name="Label" />,
    );
    expect(container).toMatchSnapshot();
  });

  it("should renders label when label its provided", () => {
    renderWithForm(
      <NumberField label="Test Label" onChange={mockOnChange} name="Label" />,
    );
    expect(screen.getByLabelText("Test Label")).toBeInTheDocument();
  });

  it("should renders the description when provided", () => {
    renderWithForm(
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
    renderWithForm(
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
    renderWithForm(
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
    renderWithForm(<NumberField label="Test Label" name="Label" />);
    const input = screen.getByLabelText("Test Label");

    await user.type(input, "10");
    expect(input).toHaveValue(10);
  });

  it("should disables the input when disabled prop is true", () => {
    renderWithForm(
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
    renderWithForm(
      <NumberField
        label="Test Label"
        onChange={mockOnChange}
        required
        name="Label"
      />,
    );
    expect(screen.getByRole("spinbutton")).toHaveAttribute("required");
  });

  it("should supports a defaultValue prop", () => {
    renderWithForm(
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

  // Test for the steps prop
  it("should increment value when increment button is clicked", async () => {
    const user = userEvent.setup();
    renderWithForm(
      <NumberField
        label="Test Label"
        name="Label"
        defaultValue={5}
        step={1}
        onChange={mockOnChange}
      />,
    );

    const incrementButton = screen.getAllByRole("button")[0];

    await user.click(incrementButton);

    expect(mockOnChange).toHaveBeenCalledWith(6);
  });

  it("should decrement value when decrement button is clicked", async () => {
    const user = userEvent.setup();
    renderWithForm(
      <NumberField
        label="Test Label"
        name="Label"
        defaultValue={5}
        step={1}
        onChange={mockOnChange}
      />,
    );

    const decrementButton = screen.getAllByRole("button")[1];
    await user.click(decrementButton);
    expect(mockOnChange).toHaveBeenCalledWith(4);
  });

  it("should not exceed maxValue when increment button is clicked", async () => {
    const user = userEvent.setup();
    renderWithForm(
      <NumberField
        label="Test Label"
        name="Label"
        defaultValue={10}
        maxValue={10}
        step={1}
        onChange={mockOnChange}
      />,
    );

    const incrementButton = screen.getAllByRole("button")[0]; // Botón de incremento
    await user.click(incrementButton);
    expect(mockOnChange).toHaveBeenCalledWith(10);
  });

  it("should not go below minValue when decrement button is clicked", async () => {
    const user = userEvent.setup();
    renderWithForm(
      <NumberField
        label="Test Label"
        name="Label"
        defaultValue={0}
        minValue={0}
        step={1}
        onChange={mockOnChange}
      />,
    );

    const decrementButton = screen.getAllByRole("button")[1];
    await user.click(decrementButton);
    expect(mockOnChange).toHaveBeenCalledWith(0);
  });

  it("should increment or decrement based on step prop", async () => {
    const user = userEvent.setup();
    renderWithForm(
      <NumberField
        label="Test Label"
        name="Label"
        defaultValue={0}
        step={5}
        onChange={mockOnChange}
      />,
    );

    const incrementButton = screen.getAllByRole("button")[0];
    const decrementButton = screen.getAllByRole("button")[1];

    await user.click(incrementButton);
    expect(mockOnChange).toHaveBeenCalledWith(5);

    await user.click(decrementButton);
    expect(mockOnChange).toHaveBeenCalledWith(0);
  });
});

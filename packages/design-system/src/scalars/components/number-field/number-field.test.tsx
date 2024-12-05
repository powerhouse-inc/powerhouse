import React from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumberField } from "./number-field";
import { renderWithForm } from "@/scalars/lib/testing";
import { Form } from "../form/form";
import { Button } from "@/powerhouse/components/button";

describe("NumberField", () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    mockOnChange.mockClear(); // Limpia el mock antes de cada prueba
  });

  it("should match snapshot", () => {
    const { container } = renderWithForm(
      <NumberField label="Test Label" name="Label" value={345} />,
    );
    expect(container).toMatchSnapshot();
  });

  it("should render error messages when provided", () => {
    renderWithForm(
      <NumberField
        label="Test Label"
        onChange={mockOnChange}
        errors={["Error 1", "Error 2"]}
        name="Label"
      />,
    );
    expect(screen.getByText("Test Label")).toBeInTheDocument();
    expect(screen.getByText("Test Label")).toBeInTheDocument();
  });

  it("should pass the correct value on form submission", async () => {
    const mockOnSubmit = vi.fn();
    const user = userEvent.setup();

    // Render a form with NumberField
    renderWithForm(
      <Form onSubmit={mockOnSubmit}>
        {({ formState: { isSubmitting } }) => (
          <div className="flex w-[400px] flex-col gap-4">
            <NumberField label="Number Field" name="Number Field" />
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit"}
            </Button>
          </div>
        )}
      </Form>,
    );

    // Simulate user input
    const input = screen.getByLabelText("Number Field");
    await user.type(input, "42");

    // Submit the form
    const submitButton = screen.getByText("Submit");
    await user.click(submitButton);

    // Assert that the value is passed correctly
    expect(mockOnSubmit).toHaveBeenCalledWith({
      "Number Field": 42,
    });
  });

  it("should render label when label is provided", () => {
    renderWithForm(
      <NumberField label="Test Label" onChange={mockOnChange} name="Label" />,
    );
    expect(screen.getByLabelText("Test Label")).toBeInTheDocument();
  });

  it("should render the description when provided", () => {
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

  it("should render error messages when provided", () => {
    renderWithForm(
      <NumberField
        label="Test Label"
        onChange={mockOnChange}
        errors={["Error 1", "Error 2"]}
        name="Label"
      />,
    );
    expect(screen.getByText("Test Label")).toBeInTheDocument();
    expect(screen.getByText("Test Label")).toBeInTheDocument();
  });

  it("should render warning messages when provided", () => {
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

  it("should call onChange when the input value changes", async () => {
    const user = userEvent.setup();
    renderWithForm(
      <NumberField label="Test Label" name="Label" onChange={mockOnChange} />,
    );
    const input = screen.getByLabelText("Test Label");

    await user.type(input, "10");
    expect(mockOnChange).toHaveBeenCalled();
    expect(input).toHaveValue(10);
  });

  it("should disable the input when disabled prop is true", () => {
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

  it("should show the input as required when required prop is true", () => {
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

  it("should support a defaultValue prop", () => {
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

  // Test for step
  it("should increment the value when increment arrow button is clicked", async () => {
    const user = userEvent.setup();
    renderWithForm(
      <NumberField
        label="Test Label"
        name="Label"
        value={5}
        step={1}
        onChange={mockOnChange}
      />,
    );

    const decrementButton = screen.getAllByRole("button")[0];
    await user.click(decrementButton);

    expect(mockOnChange).toHaveBeenCalledTimes(1);

    const eventArg = mockOnChange.mock
      .calls[0][0] as React.ChangeEvent<HTMLInputElement>;

    expect(eventArg).toBeInstanceOf(Event);

    expect(eventArg.target).toMatchObject({
      value: 6,
    });
  });

  it("should decrement value when decrement button is clicked", async () => {
    const user = userEvent.setup();
    renderWithForm(
      <NumberField
        label="Test Label"
        name="Label"
        value={10}
        step={2}
        onChange={mockOnChange}
      />,
    );

    const decrementButton = screen.getAllByRole("button")[1];
    await user.click(decrementButton);
    const eventArg = mockOnChange.mock
      .calls[0][0] as React.ChangeEvent<HTMLInputElement>;

    expect(eventArg.target).toMatchObject({
      value: 8,
    });
  });

  it("should not exceed maxValue when increment button is clicked, and should not invoke onChange if the value does not change", async () => {
    const user = userEvent.setup();
    renderWithForm(
      <NumberField
        label="Test Label"
        name="Label"
        value={10}
        maxValue={10}
        step={1}
        onChange={mockOnChange}
      />,
    );

    const incrementButton = screen.getAllByRole("button")[0];
    await user.click(incrementButton);

    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it("should not go up of  maxValue when increment button is clicked and should not invoke onChange if the value does not change", async () => {
    const user = userEvent.setup();
    renderWithForm(
      <NumberField
        label="Test Label"
        name="Label"
        value={30}
        maxValue={30}
        step={1}
        onChange={mockOnChange}
      />,
    );

    const decrementButton = screen.getAllByRole("button")[0];
    await user.click(decrementButton);

    expect(mockOnChange).not.toHaveBeenCalled();
  });
  it("should not go below minValue when decrement button is clicked and should not invoke onChange if the value does not change", async () => {
    const user = userEvent.setup();
    renderWithForm(
      <NumberField
        label="Test Label"
        name="Label"
        value={1}
        minValue={1}
        step={1}
        onChange={mockOnChange}
      />,
    );

    const decrementButton = screen.getAllByRole("button")[1];
    await user.click(decrementButton);

    expect(mockOnChange).not.toHaveBeenCalled();
  });
});

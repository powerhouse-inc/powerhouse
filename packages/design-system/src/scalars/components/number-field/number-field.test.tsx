import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      <NumberField
        label="Test Label"
        name="Label"
        value={345}
        trailingZeros
        precision={2}
      />,
    );
    expect(container).toMatchSnapshot();
  });

  it("should pass the correct BigInt value on form submission", async () => {
    const mockOnSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <Form onSubmit={mockOnSubmit}>
        {({ formState: { isSubmitting } }) => (
          <div>
            <NumberField
              label="BigInt Field"
              name="BigInt Field"
              isBigInt
              numericType="PositiveInt"
            />
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit"}
            </Button>
          </div>
        )}
      </Form>,
    );

    // We need to mock the data beforehand to avoid loss of precision
    const bigIntString = "9007199254740993";
    const bigIntValue = BigInt(bigIntString);

    // Simulate user input by directly setting the value
    const input = screen.getByLabelText("BigInt Field");
    fireEvent.change(input, { target: { value: bigIntString } });
    fireEvent.blur(input);

    // Submit the form
    const submitButton = screen.getByText("Submit");
    await user.click(submitButton);
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
      expect(mockOnSubmit).toHaveBeenCalledWith({
        "BigInt Field": bigIntValue,
      });
    });
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

  //New test for the issues
  it("should handle NonPositiveFloat numeric type correctly", async () => {
    const mockOnSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <Form onSubmit={mockOnSubmit}>
        {({ formState: { isSubmitting } }) => (
          <div className="flex w-[400px] flex-col gap-4">
            <NumberField
              label="Float Field"
              name="floatField"
              numericType="NonPositiveFloat"
              precision={2}
            />
            <Button type="submit" disabled={isSubmitting}>
              Submit
            </Button>
          </div>
        )}
      </Form>,
    );

    const input = screen.getByLabelText("Float Field");
    await user.type(input, "-0.90");

    const submitButton = screen.getByText("Submit");
    await user.click(submitButton);

    expect(mockOnSubmit).toHaveBeenCalledWith({
      floatField: -0.9,
    });
  });

  it("should handle NegativeInt numeric type correctly", async () => {
    const mockOnSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <Form onSubmit={mockOnSubmit}>
        {({ formState: { isSubmitting } }) => (
          <div className="flex w-[400px] flex-col gap-4">
            <NumberField
              label="Negative Int Field"
              name="negativeField"
              numericType="NegativeInt"
            />
            <Button type="submit" disabled={isSubmitting}>
              Submit
            </Button>
          </div>
        )}
      </Form>,
    );

    const input = screen.getByLabelText("Negative Int Field");
    await user.type(input, "-87");

    const submitButton = screen.getByText("Submit");
    await user.click(submitButton);

    expect(mockOnSubmit).toHaveBeenCalledWith({
      negativeField: -87,
    });
  });

  it("should show placeholder when value is empty", async () => {
    const placeholder = "Enter a number";
    const user = userEvent.setup();

    renderWithForm(
      <NumberField
        label="Number Field"
        name="numberField"
        placeholder={placeholder}
      />,
    );

    const input = screen.getByLabelText("Number Field");
    await user.clear(input);

    expect(input).toHaveAttribute("placeholder", placeholder);
    expect(input).toHaveValue(null);
  });

  it("should increment/decrement by specified step using keyboard", async () => {
    const user = userEvent.setup();
    const mockOnChange = vi.fn();

    renderWithForm(
      <NumberField
        label="Step Field"
        name="stepField"
        value={10}
        step={2}
        onChange={mockOnChange}
      />,
    );

    const input = screen.getByLabelText("Step Field");
    await user.type(input, "{arrowup}");

    expect(mockOnChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        target: { value: 12 },
      }),
    );

    await user.type(input, "{arrowdown}");

    expect(mockOnChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        target: { value: 10 },
      }),
    );
  });

  it("should handle precision correctly for decimal numbers", async () => {
    const mockOnSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <Form onSubmit={mockOnSubmit}>
        {({ formState: { isSubmitting } }) => (
          <div className="flex w-[400px] flex-col gap-4">
            <NumberField
              label="Precision Field"
              name="precisionField"
              precision={2}
            />
            <Button type="submit" disabled={isSubmitting}>
              Submit
            </Button>
          </div>
        )}
      </Form>,
    );

    const input = screen.getByLabelText("Precision Field");
    await user.type(input, "0.9");

    const submitButton = screen.getByText("Submit");
    await user.click(submitButton);

    expect(mockOnSubmit).toHaveBeenCalledWith({
      precisionField: 0.9,
    });
  });

  it("should accept integer values when numericType is PositiveFloat", async () => {
    const mockOnSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <Form onSubmit={mockOnSubmit}>
        {({ formState: { isSubmitting } }) => (
          <div>
            <NumberField
              label="Positive Float Field"
              name="positiveFloatField"
              numericType="PositiveFloat"
            />
            <Button type="submit" disabled={isSubmitting}>
              Submit
            </Button>
          </div>
        )}
      </Form>,
    );

    const input = screen.getByLabelText("Positive Float Field");
    await user.type(input, "42");

    const submitButton = screen.getByText("Submit");
    await user.click(submitButton);

    expect(mockOnSubmit).toHaveBeenCalledWith({
      positiveFloatField: 42,
    });
  });
});

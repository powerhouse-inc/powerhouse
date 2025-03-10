import { renderWithForm } from "@/scalars/lib/testing";
import { screen } from "@testing-library/react";
import { DatePickerField } from "./date-picker-field";
import userEvent from "@testing-library/user-event";

vi.mock("#powerhouse", () => ({
  Icon: ({ name, className }: { name: string; className?: string }) => (
    <div data-testid={`mock-icon-${name}`} className={className}>
      Mock Icon: {name}
    </div>
  ),
}));
describe("DatePickerField", () => {
  it("should match the snapshot", () => {
    const { container } = renderWithForm(
      <DatePickerField
        label="Test Label"
        name="test-date"
        value="2025-01-01"
      />,
    );
    expect(container).toMatchSnapshot();
  });
  it("should display the label when provided", () => {
    const labelText = "Test Label";
    renderWithForm(<DatePickerField name="test-date" label={labelText} />);
    expect(screen.getByText(labelText)).toBeInTheDocument();
  });

  it("should not render the label when label prop is not provided", () => {
    renderWithForm(<DatePickerField name="test-date" />);
    expect(screen.queryByText("Test Label")).not.toBeInTheDocument();
  });

  it("should mark the label as required when required prop is true", () => {
    renderWithForm(
      <DatePickerField name="test-date" label="Test Label" required />,
    );
    const label = screen.getByText("Test Label");
    const asterisk = screen.getByText("*");
    expect(label).toBeInTheDocument();
    expect(asterisk).toBeInTheDocument();
  });

  it("should mark the label as disabled when disabled prop is true", () => {
    renderWithForm(
      <DatePickerField name="test-date" label="Test Label" disabled />,
    );
    const label = screen.getByText("Test Label");
    expect(label).toHaveClass("cursor-not-allowed");
    expect(label).toHaveClass("text-gray-700");
  });

  it("should respect the minDate prop", async () => {
    renderWithForm(
      <DatePickerField
        showErrorOnBlur
        label="Test Label"
        name="test-date"
        minDate="2023-01-01"
      />,
    );
    const input = screen.getByRole("textbox");
    expect(input).toBeInTheDocument();
    // Intentamos escribir una fecha anterior al minDate
    await userEvent.type(input, "2022-12-31");
    await userEvent.tab(); // Trigger validation on blur
    expect(screen.getByText(/Date must be on or after/i)).toBeInTheDocument();
  });
  it("should respect the maxDate prop", async () => {
    renderWithForm(
      <DatePickerField
        showErrorOnBlur
        label="Test Label"
        name="test-date"
        maxDate="2023-12-31"
      />,
    );

    const input = screen.getByRole("textbox");
    expect(input).toBeInTheDocument();

    // Intentamos escribir una fecha posterior al maxDate
    await userEvent.type(input, "2024-01-01");
    await userEvent.tab(); // Trigger validation on blur
    expect(screen.getByText(/Date must be on or before/i)).toBeInTheDocument();
  });
  it("should allow valid dates within min and max range", async () => {
    renderWithForm(
      <DatePickerField
        label="Test Label"
        name="test-date"
        minDate="2023-01-01"
        maxDate="2023-12-31"
      />,
    );

    const input = screen.getByRole("textbox");
    await userEvent.type(input, "2023-06-15");
    expect(input).toHaveValue("2023-06-15");
  });
});

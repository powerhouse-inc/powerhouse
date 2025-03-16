import { renderWithForm } from "#scalars";
import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { DateField } from "./date-field.js";

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
      <DateField
        label="Test Label"
        name="test-date"
        value="2025-01-01"
        dateFormat="yyyy-MM-dd"
      />,
    );
    expect(container).toMatchSnapshot();
  });
  it("should display the label when provided", () => {
    const labelText = "Test Label";
    renderWithForm(<DateField name="test-date" label={labelText} />);
    expect(screen.getByText(labelText)).toBeInTheDocument();
  });

  it("should not render the label when label prop is not provided", () => {
    renderWithForm(<DateField name="test-date" />);
    expect(screen.queryByText("Test Label")).not.toBeInTheDocument();
  });

  it("should mark the label as required when required prop is true", () => {
    renderWithForm(<DateField name="test-date" label="Test Label" required />);
    const label = screen.getByText("Test Label");
    const asterisk = screen.getByText("*");
    expect(label).toBeInTheDocument();
    expect(asterisk).toBeInTheDocument();
  });

  it("should mark the label as disabled when disabled prop is true", () => {
    renderWithForm(<DateField name="test-date" label="Test Label" disabled />);
    const label = screen.getByText("Test Label");
    expect(label).toHaveClass("cursor-not-allowed");
    expect(label).toHaveClass("text-gray-700");
  });

  it("should disable dates before minDate", async () => {
    renderWithForm(
      <DateField label="Test Label" name="test-date" minDate="2025-01-16" />,
    );

    // 1. Find and click the calendar button to open it
    const calendarTrigger = screen.getByTestId("mock-icon-CalendarTime");
    await userEvent.click(calendarTrigger);

    // 2. Wait for the calendar dialog to be visible
    const calendar = await screen.findByRole("dialog");

    expect(calendar).toBeInTheDocument();

    // 3. Navigate to previous month (December 2022)
    const prevMonthButton = screen.getByTestId("mock-icon-CaretLeft");
    await userEvent.click(prevMonthButton);

    // 4. Find the date button for February 14, 2025
    const dateButton = screen.getByRole("button", {
      name: "Friday, February 14th, 2025",
    });
    // 5. Check that the date button is disabled
    expect(dateButton).toHaveAttribute("tabIndex", "-1");
    expect(dateButton).toHaveClass("disabled:pointer-events-none");
    // 6. Check that the input is empty
    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("");
  });

  it("should disable dates after maxDate", async () => {
    renderWithForm(
      <DateField label="Test Label" name="test-date" maxDate="2025-01-16" />,
    );
    // 1. Find and click the calendar button to open it
    const calendarTrigger = screen.getByTestId("mock-icon-CalendarTime");
    await userEvent.click(calendarTrigger);

    // 2. Wait for the calendar dialog to be visible
    const calendar = await screen.findByRole("dialog");

    expect(calendar).toBeInTheDocument();

    // 3. Navigate to previous month (December 2022)
    const prevMonthButton = screen.getByTestId("mock-icon-CaretLeft");
    await userEvent.click(prevMonthButton);

    const dateButton = screen.getByRole("button", {
      name: "Wednesday, February 26th, 2025",
    });

    // 5. Check that the date button is disabled
    expect(dateButton).toHaveAttribute("tabIndex", "-1");
    expect(dateButton).toHaveClass("disabled:pointer-events-none");
    // 6. Check that the input is empty
    const input = screen.getByRole("textbox");

    expect(input).toHaveValue("");
  });
  // Validate minDate when user add value in the input
  it("should disable dates after minDate when user adds a value in the input", async () => {
    renderWithForm(
      <DateField
        label="Test Label"
        name="test-date"
        minDate="2025-01-16"
        showErrorOnBlur
      />,
    );
    const input = screen.getByRole("textbox");

    expect(input).toBeInTheDocument();
    await userEvent.type(input, "2025-01-10");
    await userEvent.tab();
    expect(screen.getByText(/Date must be on or after/i)).toBeInTheDocument();
  });
});
// Validate maxDate when user add value in the input
it("should disable dates after minDate when user adds a value in the input", async () => {
  renderWithForm(
    <DateField
      label="Test Label"
      name="test-date"
      maxDate="2025-01-16"
      showErrorOnBlur
    />,
  );
  const input = screen.getByRole("textbox");

  expect(input).toBeInTheDocument();
  await userEvent.type(input, "2025-01-20");
  await userEvent.tab();
  expect(screen.getByText(/Date must be on or before/i)).toBeInTheDocument();
});

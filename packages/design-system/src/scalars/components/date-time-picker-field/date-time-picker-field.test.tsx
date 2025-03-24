import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { renderWithForm } from "../../lib/testing.js";
import { DateTimePickerField } from "./date-time-picker-field.js";

vi.mock("#powerhouse", () => ({
  Icon: ({ name, className }: { name: string; className?: string }) => (
    <div data-testid={`mock-icon-${name}`} className={className}>
      Mock Icon: {name}
    </div>
  ),
}));

describe("DateTimePicker", () => {
  it("should match the snapshot", () => {
    const { container } = renderWithForm(
      <DateTimePickerField
        label="Test Label"
        name="test-datetime"
        value="2025-01-01T10:00:00"
        dateFormat="yyyy-MM-dd"
        timeFormat="HH:mm"
      />,
    );
    expect(container).toMatchSnapshot();
  });

  it("should display the label when provided", () => {
    const labelText = "Test Label";
    renderWithForm(
      <DateTimePickerField name="test-datetime" label={labelText} />,
    );
    expect(screen.getByText(labelText)).toBeInTheDocument();
  });

  it("should not render the label when label prop is not provided", () => {
    renderWithForm(<DateTimePickerField name="test-datetime" />);
    expect(screen.queryByText("Test Label")).not.toBeInTheDocument();
  });

  it("should mark the label as required when required prop is true", () => {
    renderWithForm(
      <DateTimePickerField name="test-datetime" label="Test Label" required />,
    );
    const label = screen.getByText("Test Label");
    const asterisk = screen.getByText("*");
    expect(label).toBeInTheDocument();
    expect(asterisk).toBeInTheDocument();
  });

  it("should mark the label as disabled when disabled prop is true", () => {
    renderWithForm(
      <DateTimePickerField name="test-datetime" label="Test Label" disabled />,
    );
    const label = screen.getByText("Test Label");
    expect(label).toHaveClass("cursor-not-allowed");
    expect(label).toHaveClass("text-gray-700");
  });

  it("should disable dates before minDate", async () => {
    renderWithForm(
      <DateTimePickerField
        label="Test Label"
        name="test-datetime"
        minDate="2025-01-16"
      />,
    );

    const calendarTrigger = screen.getByTestId("mock-icon-CalendarTime");
    await userEvent.click(calendarTrigger);

    const calendar = await screen.findByRole("dialog");
    expect(calendar).toBeInTheDocument();

    const prevMonthButton = screen.getByTestId("mock-icon-CaretLeft");
    await userEvent.click(prevMonthButton);

    const dateButton = screen.getByRole("button", {
      name: "Friday, February 14th, 2025",
    });

    expect(dateButton).toHaveAttribute("tabIndex", "-1");
    expect(dateButton).toHaveClass("disabled:pointer-events-none");
  });

  it("should disable dates after maxDate", async () => {
    renderWithForm(
      <DateTimePickerField
        label="Test Label"
        name="test-datetime"
        maxDate="2025-01-16"
      />,
    );

    const calendarTrigger = screen.getByTestId("mock-icon-CalendarTime");
    await userEvent.click(calendarTrigger);

    const calendar = await screen.findByRole("dialog");
    expect(calendar).toBeInTheDocument();

    const nextMonthButton = screen.getByTestId("mock-icon-CaretRight");
    await userEvent.click(nextMonthButton);

    const dateButton = screen.getByRole("button", {
      name: "Wednesday, February 26th, 2025",
    });

    expect(dateButton).toHaveAttribute("tabIndex", "-1");
    expect(dateButton).toHaveClass("disabled:pointer-events-none");
  });

  it("should handle time selection correctly", async () => {
    renderWithForm(
      <DateTimePickerField
        label="Test Label"
        name="test-datetime"
        timeFormat="HH:mm"
      />,
    );

    const calendarTrigger = screen.getByTestId("mock-icon-CalendarTime");
    await userEvent.click(calendarTrigger);

    const calendar = await screen.findByRole("dialog");
    expect(calendar).toBeInTheDocument();

    // Switch to time tab
    const timeTab = screen.getByRole("tab", { name: /time/i });
    await userEvent.click(timeTab);

    // Select time
    const hourSelect = screen.getByRole("combobox", { name: /hour/i });
    await userEvent.selectOptions(hourSelect, "10");

    const minuteSelect = screen.getByRole("combobox", { name: /minute/i });
    await userEvent.selectOptions(minuteSelect, "30");

    // Save the selection
    const saveButton = screen.getByRole("button", { name: /save/i });
    await userEvent.click(saveButton);

    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("10:30");
  });

  it("should handle timezone selection when enabled", async () => {
    renderWithForm(
      <DateTimePickerField
        label="Test Label"
        name="test-datetime"
        showTimezoneSelect
        timeFormat="HH:mm"
      />,
    );

    const calendarTrigger = screen.getByTestId("mock-icon-CalendarTime");
    await userEvent.click(calendarTrigger);

    const calendar = await screen.findByRole("dialog");
    expect(calendar).toBeInTheDocument();

    // Switch to time tab
    const timeTab = screen.getByRole("tab", { name: /time/i });
    await userEvent.click(timeTab);

    // Check if timezone select is present
    const timezoneSelect = screen.getByRole("combobox", { name: /timezone/i });
    expect(timezoneSelect).toBeInTheDocument();
  });

  it("should handle 12-hour format correctly", async () => {
    renderWithForm(
      <DateTimePickerField
        label="Test Label"
        name="test-datetime"
        timeFormat="hh:mm a"
      />,
    );

    const calendarTrigger = screen.getByTestId("mock-icon-CalendarTime");
    await userEvent.click(calendarTrigger);

    const calendar = await screen.findByRole("dialog");
    expect(calendar).toBeInTheDocument();

    // Switch to time tab
    const timeTab = screen.getByRole("tab", { name: /time/i });
    await userEvent.click(timeTab);

    // Check for AM/PM selector
    const periodSelect = screen.getByRole("combobox", { name: /period/i });
    expect(periodSelect).toBeInTheDocument();
  });

  it("should handle custom time intervals", async () => {
    renderWithForm(
      <DateTimePickerField
        label="Test Label"
        name="test-datetime"
        timeIntervals={15}
        timeFormat="HH:mm"
      />,
    );

    const calendarTrigger = screen.getByTestId("mock-icon-CalendarTime");
    await userEvent.click(calendarTrigger);

    const calendar = await screen.findByRole("dialog");
    expect(calendar).toBeInTheDocument();

    // Switch to time tab
    const timeTab = screen.getByRole("tab", { name: /time/i });
    await userEvent.click(timeTab);

    // Check if minutes are in 15-minute intervals
    const minuteSelect = screen.getByRole("combobox", {
      name: /minute/i,
    }) as HTMLSelectElement;
    const minuteOptions = Array.from(minuteSelect.options).map(
      (opt) => opt.value,
    );
    expect(minuteOptions).toContain("00");
    expect(minuteOptions).toContain("15");
    expect(minuteOptions).toContain("30");
    expect(minuteOptions).toContain("45");
  });
});

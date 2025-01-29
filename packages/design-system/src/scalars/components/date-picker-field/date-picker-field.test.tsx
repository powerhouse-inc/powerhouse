import { renderWithForm } from "@/scalars/lib/testing";
import { screen } from "@testing-library/react";
import { DatePickerField } from "./date-picker-field";

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
});

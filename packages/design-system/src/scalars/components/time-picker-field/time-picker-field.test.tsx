import { screen } from "@testing-library/react";
import TimePickerField from "./time-picker-field";
import { renderWithForm } from "@/scalars/lib/testing";
vi.mock("@/powerhouse/components/icon/icon", () => ({
  Icon: ({ name, className }: { name: string; className?: string }) => (
    <div data-testid={`mock-icon-${name}`} className={className}>
      Mock Icon: {name}
    </div>
  ),
}));

describe("TimePickerField", () => {
  it("should match the snapshot", () => {
    const { container } = renderWithForm(
      <TimePickerField
        label="Test Label"
        name="test-time"
        id="test-id"
        required
        disabled={false}
      />,
    );
    expect(container).toMatchSnapshot();
  });

  it("should display the label when provided", () => {
    const labelText = "Test Label";
    renderWithForm(<TimePickerField name="test-time" label={labelText} />);
    expect(screen.getByText(labelText)).toBeInTheDocument();
  });

  it("should not render the label when label prop is not provided", () => {
    renderWithForm(<TimePickerField name="test-time" />);
    expect(screen.queryByText("Test Label")).not.toBeInTheDocument();
  });

  it("should mark the label as required when required prop is true", () => {
    renderWithForm(
      <TimePickerField name="test-time" label="Test Label" required />,
    );
    const label = screen.getByText("Test Label");
    const asterisk = screen.getByText("*");
    expect(label).toBeInTheDocument();
    expect(asterisk).toBeInTheDocument();
  });

  it("should mark the label as disabled when disabled prop is true", () => {
    renderWithForm(
      <TimePickerField name="test-time" label="Test Label" disabled />,
    );
    const label = screen.getByText("Test Label");
    expect(label).toHaveClass("cursor-not-allowed");
    expect(label).toHaveClass("text-gray-700");
  });
});

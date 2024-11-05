import { BooleanField } from "./boolean-field";
import { renderWithForm } from "@/scalars/lib/testing";

describe("BooleanField", () => {
  const commonProps = {
    label: "Test Field",
    description: "Test description",
    value: true,
    required: true,
    disabled: false,
    errors: ["Test error"],
    warnings: ["Test warning"],
    className: "test-class",
    onChange: vi.fn(),
  };

  it("should render toggle field when isToggle is true", () => {
    const { container } = renderWithForm(
      <BooleanField name="test" {...commonProps} isToggle={true} />,
    );
    expect(container).toMatchSnapshot();
  });

  it("should render checkbox field when isToggle is false", () => {
    const { container } = renderWithForm(
      <BooleanField name="test" {...commonProps} isToggle={false} />,
    );
    expect(container).toMatchSnapshot();
  });

  it("should pass all props to ToggleField when isToggle is true", () => {
    const { getByRole } = renderWithForm(
      <BooleanField name="test" {...commonProps} isToggle={true} />,
    );
    const toggle = getByRole("switch");
    expect(toggle).toBeChecked();
    expect(toggle).toBeEnabled();
    const toggleLabel = getByRole("label");
    expect(toggleLabel).toHaveAttribute("for", toggle.id);
  });

  it("should pass all props to CheckboxField when isToggle is false", () => {
    const { getByRole } = renderWithForm(
      <BooleanField name="test" {...commonProps} isToggle={false} />,
    );
    const checkbox = getByRole("checkbox");
    expect(checkbox).toBeChecked();
    expect(checkbox).toBeEnabled();
    const checkboxLabel = getByRole("label");
    expect(checkboxLabel).toHaveAttribute("for", checkbox.id);
  });
});

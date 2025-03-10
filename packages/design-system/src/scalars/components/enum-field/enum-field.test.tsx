import { renderWithForm } from "#scalars";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EnumField } from "./enum-field";

describe("EnumField Component", () => {
  const defaultProps = {
    name: "enum",
    variant: "RadioGroup" as const,
    options: [
      { value: "option1", label: "Option 1" },
      { value: "option2", label: "Option 2" },
      { value: "option3", label: "Option 3" },
    ],
  };
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.Element.prototype.scrollTo = vi.fn();

  it("should match snapshot", () => {
    const { asFragment } = renderWithForm(<EnumField {...defaultProps} />);
    expect(asFragment()).toMatchSnapshot();
  });

  it("should match snapshot with Select variant", () => {
    const { asFragment } = renderWithForm(
      <EnumField {...defaultProps} variant="Select" />,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it("should render label when provided", () => {
    renderWithForm(<EnumField {...defaultProps} label="Test Label" />);
    expect(screen.getByText("Test Label")).toBeInTheDocument();
  });

  it("should render description when provided", () => {
    renderWithForm(
      <EnumField
        {...defaultProps}
        variant="Select"
        description="Test description"
      />,
    );
    expect(screen.getByText("Test description")).toBeInTheDocument();
  });

  it("should render warning messages when provided", () => {
    renderWithForm(
      <EnumField {...defaultProps} warnings={["Warning message"]} />,
    );
    expect(screen.getByText("Warning message")).toBeInTheDocument();
  });

  it("should render error messages when provided", async () => {
    renderWithForm(<EnumField {...defaultProps} errors={["Error message"]} />);
    await waitFor(() =>
      expect(screen.getByText("Error message")).toBeInTheDocument(),
    );
  });

  it("should handle value changes in RadioGroup variant", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithForm(
      <EnumField {...defaultProps} value="option1" onChange={onChange} />,
    );

    const radio = screen.getByLabelText("Option 2");
    await user.click(radio);

    expect(onChange).toHaveBeenCalledWith("option2");
  });

  it("should handle value changes in Select variant", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithForm(
      <EnumField
        {...defaultProps}
        variant="Select"
        multiple
        value={["option1"]}
        onChange={onChange}
      />,
    );

    const select = screen.getByRole("combobox");
    await user.click(select);
    await user.click(screen.getByText("Option 2"));
    expect(onChange).toHaveBeenCalledWith(["option1", "option2"]);
  });

  it("should show required indicator when required prop is true", () => {
    renderWithForm(<EnumField {...defaultProps} label="Test Label" required />);
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("should disable the field when disabled prop is true", () => {
    renderWithForm(<EnumField {...defaultProps} variant="Select" disabled />);
    const select = screen.getByRole("combobox");
    expect(select).toBeDisabled();
  });

  it("should default to Select variant when no variant provided and has 7 options", () => {
    const propsWithSevenOptions = {
      name: "enum",
      options: [
        { value: "option1", label: "Option 1" },
        { value: "option2", label: "Option 2" },
        { value: "option3", label: "Option 3" },
        { value: "option4", label: "Option 4" },
        { value: "option5", label: "Option 5" },
        { value: "option6", label: "Option 6" },
        { value: "option7", label: "Option 7" },
      ],
    };
    renderWithForm(<EnumField {...propsWithSevenOptions} />);
    // Verify it renders as a Select
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
});

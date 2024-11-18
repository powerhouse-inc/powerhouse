import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithForm } from "@/scalars/lib/testing";
import { EnumField } from "./enum-field";

describe("EnumField Component", () => {
  const defaultProps = {
    name: "enum",
    variant: "RadioGroup" as const,
    optionLabels: {
      option1: "Option 1",
      option2: "Option 2",
      option3: "Option 3",
    },
  };
  window.HTMLElement.prototype.scrollIntoView = () => {};

  it("should match snapshot", () => {
    const { container } = renderWithForm(<EnumField {...defaultProps} />);
    expect(container).toMatchSnapshot();
  });

  it("should match snapshot with Select variant", () => {
    const { container } = renderWithForm(
      <EnumField {...defaultProps} variant="Select" />,
    );
    expect(container).toMatchSnapshot();
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

  it("should render error messages when provided", () => {
    renderWithForm(<EnumField {...defaultProps} errors={["Error message"]} />);
    expect(screen.getByText("Error message")).toBeInTheDocument();
  });

  it("should disable options specified in disabledOptions", () => {
    renderWithForm(
      <EnumField {...defaultProps} disabledOptions={["option1"]} />,
    );
    const options = screen.getAllByRole("radio");
    expect(options[0]).toBeDisabled();
    expect(options[1]).not.toBeDisabled();
    expect(options[2]).not.toBeDisabled();
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

  it("should transform options based on optionLabels", () => {
    renderWithForm(<EnumField {...defaultProps} />);
    expect(screen.getByText("Option 1")).toBeInTheDocument();
    expect(screen.getByText("Option 2")).toBeInTheDocument();
    expect(screen.getByText("Option 3")).toBeInTheDocument();
  });

  it("should use value as label when no label provided in optionLabels", () => {
    renderWithForm(
      <EnumField
        name="enum"
        variant="RadioGroup"
        optionLabels={{
          option1: "",
          option2: "",
        }}
      />,
    );
    expect(screen.getByText("option1")).toBeInTheDocument();
    expect(screen.getByText("option2")).toBeInTheDocument();
  });
});

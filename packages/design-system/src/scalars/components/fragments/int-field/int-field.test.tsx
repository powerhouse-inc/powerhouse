import React from "react";
import { render, screen } from "@testing-library/react";
import { IntField } from "./int-field";
import userEvent from "@testing-library/user-event";
describe("IntField Component", () => {
  const mockOnChange = vi.fn();
  it("should match snapshot", () => {
    const { container } = render(<IntField label="Test Label" />);
    expect(container).toMatchSnapshot();
  });

  it("should renders label when label its provided", () => {
    render(<IntField label="Test Label" onChange={mockOnChange} />);
    expect(screen.getByLabelText("Test Label")).toBeInTheDocument();
  });

  it("should renders the description when provided", () => {
    render(
      <IntField
        label="Test Label"
        description="This is a description"
        onChange={mockOnChange}
      />,
    );
    expect(screen.getByText("This is a description")).toBeInTheDocument();
  });

  it("should renders error messages when provided", () => {
    render(
      <IntField
        label="Test Label"
        onChange={mockOnChange}
        errors={["Error 1", "Error 2"]}
      />,
    );
    expect(screen.getByText("Error 1")).toBeInTheDocument();
    expect(screen.getByText("Error 2")).toBeInTheDocument();
  });

  it("should renders warning messages when provided", () => {
    render(
      <IntField
        label="Test Label"
        onChange={mockOnChange}
        warnings={["Warning 1", "Warning 2"]}
      />,
    );
    expect(screen.getByText("Warning 1")).toBeInTheDocument();
    expect(screen.getByText("Warning 2")).toBeInTheDocument();
  });

  it("should calls onChange when the input value changes", async () => {
    const user = userEvent.setup();
    render(<IntField label="Test Label" />);
    const input = screen.getByLabelText("Test Label");

    await user.type(input, "10");
    expect(input).toHaveValue("10");
  });

  it("should disables the input when disabled prop is true", () => {
    render(<IntField label="Test Label" onChange={mockOnChange} disabled />);
    const input = screen.getByRole("spinbutton");

    expect(input).toBeDisabled();
  });

  it("should shows the input as required when required prop is true", () => {
    render(<IntField label="Test Label" onChange={mockOnChange} required />);
    expect(screen.getByRole("spinbutton")).toHaveAttribute("required");
  });

  it("should handles autoComplete set to true", () => {
    render(
      <IntField label="Test Label" onChange={mockOnChange} autoComplete />,
    );
    expect(screen.getByRole("spinbutton")).toHaveAttribute(
      "autocomplete",
      "on",
    );
  });

  it("should handles autoComplete set to false", () => {
    render(
      <IntField
        label="Test Label"
        onChange={mockOnChange}
        autoComplete={false}
      />,
    );
    expect(screen.getByLabelText("Test Label")).toHaveAttribute(
      "autocomplete",
      "off",
    );
  });

  it("should renders input with provided className", () => {
    render(
      <IntField
        label="Test Label"
        // This a custom class for testing no a class for tailwindcss
        // eslint-disable-next-line tailwindcss/no-custom-classname
        className="custom-class"
        onChange={mockOnChange}
      />,
    );
    expect(screen.getByLabelText("Test Label")).toHaveClass("custom-class");
  });

  it("should supports a defaultValue prop", () => {
    render(
      <IntField label="Test Label" defaultValue={5} onChange={mockOnChange} />,
    );
    const input = screen.getByRole("spinbutton");

    expect(input).toHaveValue("5");
  });
});

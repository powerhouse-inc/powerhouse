import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectField } from "./select-field";

describe("SelectField Component", () => {
  const defaultOptions = [
    { label: "Option 1", value: "1" },
    { label: "Option 2", value: "2" },
    { label: "Option 3", value: "3", disabled: true },
  ];
  window.HTMLElement.prototype.scrollIntoView = () => {};

  // Basic Rendering Tests
  it("should match snapshot", () => {
    const { asFragment } = render(
      <SelectField name="select" options={defaultOptions} />,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it("should render with default placeholder", () => {
    render(<SelectField name="select" options={defaultOptions} />);
    expect(screen.getByText("Select an option")).toBeInTheDocument();
  });

  it("should render with custom placeholder", () => {
    render(
      <SelectField
        name="select"
        options={defaultOptions}
        placeholder="Custom placeholder"
      />,
    );
    expect(screen.getByText("Custom placeholder")).toBeInTheDocument();
  });

  // Label Tests
  it("should render with label", () => {
    render(
      <SelectField name="select" options={defaultOptions} label="Test Label" />,
    );
    expect(screen.getByText("Test Label")).toBeInTheDocument();
  });

  it("should show required indicator when required", () => {
    render(
      <SelectField
        name="select"
        options={defaultOptions}
        label="Test Label"
        required
      />,
    );
    const select = screen.getByRole("combobox");
    expect(select).toHaveAttribute("aria-required", "true");
  });

  // Selection Behavior Tests
  it("should handle option selection", async () => {
    const onChangeMock = vi.fn();
    const user = userEvent.setup();

    render(
      <SelectField
        name="select"
        options={defaultOptions}
        onChange={onChangeMock}
      />,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByText("Option 1"));

    expect(onChangeMock).toHaveBeenCalledWith("1");
    expect(screen.getByText("Option 1")).toBeInTheDocument();
  });

  it("should not allow selection of disabled options", async () => {
    const onChangeMock = vi.fn();
    const user = userEvent.setup();

    render(
      <SelectField
        name="select"
        options={defaultOptions}
        onChange={onChangeMock}
      />,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByText("Option 3")); // disabled option

    expect(onChangeMock).not.toHaveBeenCalled();
  });

  // Search Functionality Tests
  it("should show search input when searchable is true", async () => {
    const user = userEvent.setup();
    render(<SelectField name="select" options={defaultOptions} searchable />);

    await user.click(screen.getByRole("combobox"));
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

  it("should filter options based on search input", async () => {
    const user = userEvent.setup();
    render(<SelectField name="select" options={defaultOptions} searchable />);

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByPlaceholderText("Search..."), "Option 1");

    expect(screen.getByText("Option 1")).toBeInTheDocument();
    expect(screen.queryByText("Option 2")).not.toBeInTheDocument();
  });

  // // Validation and Error Handling Tests
  it("should display error messages", () => {
    render(
      <SelectField
        name="select"
        options={defaultOptions}
        errors={["This field is required"]}
      />,
    );
    expect(screen.getByText("This field is required")).toBeInTheDocument();
  });

  it("should display warning messages", () => {
    render(
      <SelectField
        name="select"
        options={defaultOptions}
        warnings={["Please review your selection"]}
      />,
    );
    expect(
      screen.getByText("Please review your selection"),
    ).toBeInTheDocument();
  });

  // // Keyboard Navigation Tests
  it("should handle keyboard navigation", async () => {
    const user = userEvent.setup();
    render(<SelectField name="select" options={defaultOptions} />);

    screen.getByRole("combobox").focus(); // Focus the combobox

    await user.keyboard("{Enter}"); // Open dropdown
    expect(screen.getByRole("listbox")).toBeInTheDocument(); // Check for Popover content

    await user.keyboard("{Escape}"); // Close dropdown
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument(); // Check Popover is closed
  });

  // // Edge Cases
  it("should handle empty options array", () => {
    render(<SelectField name="select" options={[]} />);
    expect(screen.getByText("Select an option")).toBeInTheDocument();
  });

  it("should handle value when provided", () => {
    render(<SelectField name="select" options={defaultOptions} value="2" />);
    expect(screen.getByText("Option 2")).toBeInTheDocument();
  });

  // Accessibility Tests
  it("should have correct ARIA attributes", () => {
    render(
      <SelectField
        name="select"
        options={defaultOptions}
        label="Test Label"
        required
        errors={["Error message"]}
      />,
    );

    const select = screen.getByRole("combobox");
    expect(select).toHaveAttribute("aria-required", "true");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select).toHaveAttribute("aria-expanded", "false");
  });

  // Modal Behavior Tests
  it("should render as modal when asModal is true", async () => {
    const user = userEvent.setup();
    render(<SelectField name="select" options={defaultOptions} asModal />);

    await user.click(screen.getByRole("combobox"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  // Multiple Selection Tests
  it("should allow multiple selections when multiple is true", async () => {
    const onChangeMock = vi.fn();
    const user = userEvent.setup();

    render(
      <SelectField
        name="select"
        options={defaultOptions}
        onChange={onChangeMock}
        multiple
      />,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByText("Option 1"));
    expect(onChangeMock).toHaveBeenCalledWith(["1"]);
    await user.click(screen.getByText("Option 2"));
    expect(onChangeMock).toHaveBeenLastCalledWith(["1", "2"]);
  });
});
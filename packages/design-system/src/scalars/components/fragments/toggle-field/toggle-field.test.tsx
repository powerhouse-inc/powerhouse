import { renderWithForm } from "#scalars";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, it, vi } from "vitest";
import { ToggleField } from "./toggle-field";

describe("ToggleField Component", () => {
  const mockOnChange = vi.fn();

  it("should match snapshot", () => {
    const { container } = renderWithForm(<ToggleField name="test" />);
    expect(container).toMatchSnapshot();
  });

  it("should render default status without a label on the left", () => {
    renderWithForm(<ToggleField name="test" />);
    expect(screen.queryByText("Test Label")).not.toBeInTheDocument();
  });

  it("should render with a label when label prop is provided", () => {
    renderWithForm(<ToggleField name="test" label="Test Label" />);
    expect(screen.getByText("Test Label")).toBeInTheDocument();
  });

  it("should render checked status without label", () => {
    renderWithForm(<ToggleField name="test" value={true} />);
    expect(screen.queryByText("Test Label")).not.toBeInTheDocument();
  });

  it("should render checked status with a label on the left", () => {
    renderWithForm(<ToggleField name="test" label="Test Label" value={true} />);
    expect(screen.getByText("Test Label")).toBeInTheDocument();
  });

  it("should not render the label when not provided", () => {
    renderWithForm(<ToggleField name="test" />);
    expect(screen.queryByText("Test Label")).not.toBeInTheDocument();
  });

  it("should display an error message when hasMessage is true", async () => {
    renderWithForm(
      <ToggleField name="test" label="Test Label" errors={["Error message"]} />,
    );
    await waitFor(() =>
      expect(screen.getByText("Error message")).toBeInTheDocument(),
    );
  });

  it("should call onChange when clicked", () => {
    renderWithForm(
      <ToggleField name="test" label="Test Label" onChange={mockOnChange} />,
    );
    const toggleInput = screen.getByRole("switch");

    fireEvent.click(toggleInput);
    expect(mockOnChange).toHaveBeenCalledTimes(1);
    expect(toggleInput).toBeInTheDocument();
  });

  it("should disable the toggle when disabled prop is true", () => {
    renderWithForm(<ToggleField name="test" disabled />);
    const toggle = screen.getByRole("switch");
    expect(toggle).toBeDisabled();
  });

  it("should render with custom className", () => {
    // this is a custom class name for testing purposes
    renderWithForm(<ToggleField name="test" className="custom-class" />);
    const toggle = screen.getByTestId("custom-class");
    expect(toggle).toHaveClass("custom-class");
  });
});

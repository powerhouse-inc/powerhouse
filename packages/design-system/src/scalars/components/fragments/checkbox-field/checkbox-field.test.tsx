import { screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CheckboxField } from "./checkbox-field";
import { renderWithForm } from "@/scalars/lib/testing";

describe("CheckboxField", () => {
  it("should match snapshot", () => {
    const { container } = renderWithForm(
      <CheckboxField name="test" label="Test Label" />,
    );
    expect(container).toMatchSnapshot();
  });

  it("should render with label", () => {
    renderWithForm(<CheckboxField name="test" label="Test checkbox" />);
    expect(screen.getByText("Test checkbox")).toBeInTheDocument();
  });

  it("should render with description icon", () => {
    renderWithForm(
      <CheckboxField
        name="test"
        label="Test checkbox"
        description="This is a description"
      />,
    );
    expect(screen.getByTestId("icon-fallback")).toBeInTheDocument();
  });

  it("should handle checked state", () => {
    const handleChange = vi.fn();
    renderWithForm(
      <CheckboxField
        name="test"
        label="Test checkbox"
        value={false}
        onChange={handleChange}
      />,
    );

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it("should be disabled when disabled prop is true", () => {
    renderWithForm(
      <CheckboxField name="test" label="Test checkbox" disabled />,
    );

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeDisabled();
  });

  it("should show required indicator when required", () => {
    renderWithForm(
      <CheckboxField name="test" label="Test checkbox" required />,
    );

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeRequired();
  });

  it("should render with errors", () => {
    renderWithForm(
      <CheckboxField
        name="test"
        label="Test checkbox"
        errors={["This is an error"]}
      />,
    );
    expect(screen.getByText("This is an error")).toBeInTheDocument();
  });

  it("should render with warnings and errors", () => {
    renderWithForm(
      <CheckboxField
        name="test"
        label="Test checkbox"
        warnings={["This is a warning"]}
        errors={["This is an error"]}
      />,
    );
    expect(screen.getByText("This is a warning")).toBeInTheDocument();
    expect(screen.getByText("This is an error")).toBeInTheDocument();
  });
});
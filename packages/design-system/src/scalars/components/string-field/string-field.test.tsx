import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithForm } from "../../lib/testing.js";
import { StringField } from "./string-field.js";

describe("StringField", () => {
  it("should match snapshot with minimal props", () => {
    const { container } = renderWithForm(<StringField name="test" />);
    expect(container).toMatchSnapshot();
  });

  it("should match snapshot when multiline is true (textarea)", () => {
    const { container } = renderWithForm(<StringField name="test" multiline />);
    expect(container).toMatchSnapshot();
  });

  it("should render label when provided", () => {
    renderWithForm(<StringField name="test" label="Test Label" />);
    expect(screen.getByText("Test Label")).toBeInTheDocument();
  });

  it("should render description when provided", () => {
    renderWithForm(<StringField name="test" description="Test description" />);
    expect(screen.getByText("Test description")).toBeInTheDocument();
  });

  it("should render error messages when provided", async () => {
    renderWithForm(<StringField name="test" errors={["Error message"]} />);
    await waitFor(() =>
      expect(screen.getByText("Error message")).toBeInTheDocument(),
    );
  });

  it("should render warning messages when provided", () => {
    renderWithForm(<StringField name="test" warnings={["Warning message"]} />);
    expect(screen.getByText("Warning message")).toBeInTheDocument();
  });

  it("should render as textarea when multiline is true", () => {
    renderWithForm(<StringField name="test" multiline />);
    expect(screen.getByRole("textbox")).toHaveProperty("tagName", "TEXTAREA");
  });

  it("should render as input when multiline is false", () => {
    renderWithForm(<StringField name="test" />);
    expect(screen.getByRole("textbox")).toHaveProperty("tagName", "INPUT");
  });

  it("should disable input when disabled prop is true", () => {
    renderWithForm(<StringField name="test" disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("should show required indicator when required prop is true", () => {
    renderWithForm(<StringField name="test" label="Test Label" required />);
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("should handle value changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithForm(
      <StringField name="test" value="initial" onChange={onChange} />,
    );
    const input = screen.getByRole("textbox");

    expect(input).toHaveValue("initial");
    await user.type(input, "test");
    expect(onChange).toHaveBeenCalledTimes(4); // Once per character typed
  });
});

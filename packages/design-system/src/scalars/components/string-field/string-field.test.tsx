import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StringField } from "./string-field";

describe("StringField", () => {
  it("should match snapshot with minimal props", () => {
    const { container } = render(<StringField />);
    expect(container).toMatchSnapshot();
  });

  it("should match snapshot when multiline is true (textarea)", () => {
    const { container } = render(<StringField multiline />);
    expect(container).toMatchSnapshot();
  });

  it("should render label when provided", () => {
    render(<StringField label="Test Label" />);
    expect(screen.getByText("Test Label")).toBeInTheDocument();
  });

  it("should render description when provided", () => {
    render(<StringField description="Test description" />);
    expect(screen.getByText("Test description")).toBeInTheDocument();
  });

  it("should render error messages when provided", () => {
    render(<StringField errors={["Error message"]} />);
    expect(screen.getByText("Error message")).toBeInTheDocument();
  });

  it("should render warning messages when provided", () => {
    render(<StringField warnings={["Warning message"]} />);
    expect(screen.getByText("Warning message")).toBeInTheDocument();
  });

  it("should render as textarea when multiline is true", () => {
    render(<StringField multiline />);
    expect(screen.getByRole("textbox")).toHaveProperty("tagName", "TEXTAREA");
  });

  it("should render as input when multiline is false", () => {
    render(<StringField />);
    expect(screen.getByRole("textbox")).toHaveProperty("tagName", "INPUT");
  });

  it("should disable input when disabled prop is true", () => {
    render(<StringField disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("should show required indicator when required prop is true", () => {
    render(<StringField label="Test Label" required />);
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("should handle value changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StringField value="initial" onChange={onChange} />);
    const input = screen.getByRole("textbox");

    expect(input).toHaveValue("initial");
    await user.type(input, "test");
    expect(onChange).toHaveBeenCalledTimes(4); // Once per character typed
  });
});

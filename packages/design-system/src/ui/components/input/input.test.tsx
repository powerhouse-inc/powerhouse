import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Input } from "./input.js";

describe("Input", () => {
  it("should match snapshot", () => {
    const { container } = render(<Input placeholder="Test placeholder" />);
    expect(container).toMatchSnapshot();
  });

  it("should render an input element", () => {
    render(<Input />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("should render with a placeholder", () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText("Enter text")).toBeInTheDocument();
  });

  it("should render with an initial value", () => {
    render(<Input value="Initial text" />);
    expect(screen.getByDisplayValue("Initial text")).toBeInTheDocument();
  });

  it("should be disabled", () => {
    render(<Input disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("should accept user input", async () => {
    const user = userEvent.setup();
    render(<Input />);
    const input = screen.getByRole("textbox");

    await user.type(input, "Hello world");
    expect(input).toHaveValue("Hello world");
  });

  it("should call onChange when value changes", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Input onChange={handleChange} />);

    await user.type(screen.getByRole("textbox"), "a");
    expect(handleChange).toHaveBeenCalled();
  });

  it("should apply custom className", () => {
    // for testing purposes, we disable the custom class name rule

    render(<Input className="custom-class" />);
    expect(screen.getByRole("textbox")).toHaveClass("custom-class");
  });
});

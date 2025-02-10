import { render, screen } from "@testing-library/react";
import { FormMessage } from "./form-message";

describe("FormMessage", () => {
  it("should match snapshot", () => {
    const { asFragment } = render(<FormMessage>message</FormMessage>);
    expect(asFragment()).toMatchSnapshot();
  });

  it("renders children correctly", () => {
    render(<FormMessage>Test message</FormMessage>);
    expect(screen.getByText("Test message")).toBeInTheDocument();
  });

  it("applies correct classes for error type", () => {
    render(<FormMessage type="error">Error message</FormMessage>);
    const message = screen.getByText("Error message");
    expect(message).toHaveClass("text-red-900");
  });

  it("applies correct classes for info type", () => {
    render(<FormMessage type="info">Info message</FormMessage>);
    const message = screen.getByText("Info message");
    expect(message).toHaveClass("text-blue-900");
  });

  it("applies correct classes for warning type", () => {
    render(<FormMessage type="warning">Warning message</FormMessage>);
    const message = screen.getByText("Warning message");
    expect(message).toHaveClass("text-yellow-900");
  });

  it("renders with custom props", () => {
    render(
      <FormMessage type="info" role="alert">
        Info message
      </FormMessage>,
    );
    const message = screen.getByText("Info message");
    expect(message).toHaveAttribute("role", "alert");
  });

  it("renders without children", () => {
    render(<FormMessage type="info" data-testid="form-message" />);
    expect(screen.getByTestId("form-message")).toBeEmptyDOMElement();
  });

  it("renders with custom element", () => {
    render(<FormMessage as="span">Custom element</FormMessage>);
    const element = screen.getByText("Custom element");
    expect(element).toBeInTheDocument();
    expect(element.tagName).toBe("SPAN");
  });

  it("renders with custom className", () => {
    // this is a custom class name for testing purposes
    // eslint-disable-next-line tailwindcss/no-custom-classname
    render(<FormMessage className="custom-class">Custom class</FormMessage>);
    expect(screen.getByText("Custom class")).toHaveClass("custom-class");
  });
});

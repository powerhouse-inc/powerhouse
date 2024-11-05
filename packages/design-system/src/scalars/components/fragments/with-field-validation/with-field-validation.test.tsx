import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { withFieldValidation } from "./with-field-validation";
import { Form } from "../form";
import type { FieldCommonProps, ValidatorHandler } from "../../types";

// Test component that will be wrapped

interface TestComponentProps extends FieldCommonProps<string> {
  onChange?: (value: string) => void;

  // available validation props
  required?: boolean;
  pattern?: RegExp;
  maxLength?: number;
  minLength?: number;
  customValidator?: ValidatorHandler;
}
const TestComponent = ({
  value,
  onChange,
  errors = [],
  name,
}: TestComponentProps) => (
  <div>
    <input
      data-testid="test-input"
      value={value || ""}
      onChange={(e) => onChange?.(e.target.value)}
      name={name}
    />
    {errors.map((error: string, i: number) => (
      <span key={i} data-testid="error-message">
        {error}
      </span>
    ))}
  </div>
);

const WrappedComponent = withFieldValidation<TestComponentProps>(TestComponent);

describe("withFieldValidation", () => {
  it("should render the wrapped component", () => {
    render(
      <Form onSubmit={() => {}}>
        <WrappedComponent name="test" />
      </Form>,
    );
    expect(screen.getByTestId("test-input")).toBeInTheDocument();
  });

  it("should handle required validation", async () => {
    render(
      <Form onSubmit={() => {}}>
        <WrappedComponent name="test" required />
      </Form>,
    );

    const input = screen.getByTestId("test-input");
    await userEvent.click(input);
    await userEvent.keyboard("{Enter}"); // submit the form should fail

    expect(await screen.findByTestId("error-message")).toBeInTheDocument();
  });

  it("should handle pattern validation", async () => {
    render(
      <Form onSubmit={() => {}}>
        <WrappedComponent name="test" pattern={/^[A-Z]+$/} />
      </Form>,
    );

    const input = screen.getByTestId("test-input");
    await userEvent.type(input, "abc");
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByTestId("error-message")).toBeInTheDocument();
  });

  it("should handle maxLength validation", async () => {
    render(
      <Form onSubmit={() => {}}>
        <WrappedComponent name="test" maxLength={3} />
      </Form>,
    );

    const input = screen.getByTestId("test-input");
    await userEvent.type(input, "1234");
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByTestId("error-message")).toBeInTheDocument();
  });

  it("should handle minLength validation", async () => {
    render(
      <Form onSubmit={() => {}}>
        <WrappedComponent name="test" minLength={3} />
      </Form>,
    );

    const input = screen.getByTestId("test-input");
    await userEvent.type(input, "12");
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByTestId("error-message")).toBeInTheDocument();
  });

  it("should handle custom validation", async () => {
    const customValidator = (value: string) => {
      return value === "valid" || "Custom error message";
    };

    render(
      <Form onSubmit={() => {}}>
        <WrappedComponent name="test" customValidator={customValidator} />
      </Form>,
    );

    const input = screen.getByTestId("test-input");
    await userEvent.type(input, "invalid");
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByTestId("error-message")).toBeInTheDocument();
  });

  it("should handle multiple validation rules", async () => {
    render(
      <Form onSubmit={() => {}}>
        <WrappedComponent name="test" required maxLength={5} />
      </Form>,
    );

    const input = screen.getByTestId("test-input");
    await userEvent.type(input, "123456");
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByTestId("error-message")).toBeInTheDocument();
  });

  it("should pass through custom error messages", () => {
    render(
      <Form onSubmit={() => {}}>
        <WrappedComponent name="test" errors={["Custom error"]} />
      </Form>,
    );

    expect(screen.getByTestId("error-message")).toHaveTextContent(
      "Custom error",
    );
  });

  it("should handle form submission with default values", async () => {
    const handleSubmit = vi.fn();

    render(
      <Form onSubmit={handleSubmit} defaultValues={{ test: "default" }}>
        <WrappedComponent name="test" />
        <button type="submit">Submit</button>
      </Form>,
    );

    const submitButton = screen.getByRole("button", { name: "Submit" });
    await userEvent.click(submitButton);

    expect(handleSubmit).toHaveBeenCalledWith(
      { test: "default" },
      expect.anything(),
    );
  });

  it("should not submit values if the form has errors", async () => {
    const handleSubmit = vi.fn();

    render(
      <Form onSubmit={handleSubmit}>
        <WrappedComponent name="test" value="" required />
        <button type="submit">Submit</button>
      </Form>,
    );

    const submitButton = screen.getByRole("button", { name: "Submit" });
    await userEvent.click(submitButton);

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(await screen.findByTestId("error-message")).toBeInTheDocument();
  });
});

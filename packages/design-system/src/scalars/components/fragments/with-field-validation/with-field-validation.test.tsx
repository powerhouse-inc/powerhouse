import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { withFieldValidation } from "./with-field-validation";
import { Form } from "../form";
import { FormGroup } from "../form-group";
import { TextFieldProps } from "../text-field";
import { FormLabel } from "../form-label";
import { Input } from "../input";
import { FormMessageList } from "../form-message";
import { renderWithForm } from "@/scalars/lib/testing";

// Test component that will be wrapped

const TextFieldTesting = ({
  label,
  value,
  defaultValue,
  onChange,
  errors,
  pattern,
  ...props
}: Omit<TextFieldProps, "autoComplete">) => {
  return (
    <FormGroup>
      {label && (
        <FormLabel
          htmlFor="test"
          required={props.required}
          disabled={props.disabled}
          hasError={!!errors?.length}
        >
          {label}
        </FormLabel>
      )}
      <Input
        id="test"
        data-testid="test-input"
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        pattern={pattern?.toString()}
        {...props}
      />
      {errors && (
        <FormMessageList
          data-testid="error-message"
          messages={errors}
          type="error"
        />
      )}
    </FormGroup>
  );
};

const WrappedComponent = withFieldValidation<TextFieldProps>(TextFieldTesting);

describe("withFieldValidation", () => {
  it("should render the wrapped component", () => {
    renderWithForm(<WrappedComponent name="test" />);
    expect(screen.getByTestId("test-input")).toBeInTheDocument();
  });

  it("should handle required validation", async () => {
    renderWithForm(<WrappedComponent name="test" required />);

    const input = screen.getByTestId("test-input");
    await userEvent.click(input);
    await userEvent.keyboard("{Enter}"); // submit the form should fail

    expect(await screen.findByTestId("error-message")).toBeInTheDocument();
  });

  it("should handle pattern validation", async () => {
    renderWithForm(<WrappedComponent name="test" pattern={/^[A-Z]+$/} />);

    const input = screen.getByTestId("test-input");
    await userEvent.type(input, "abc");
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByTestId("error-message")).toBeInTheDocument();
  });

  it("should handle minLength validation", async () => {
    renderWithForm(<WrappedComponent name="test" minLength={3} />);

    const input = screen.getByTestId("test-input");
    await userEvent.type(input, "12");
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByTestId("error-message")).toBeInTheDocument();
  });

  it("should handle custom validation", async () => {
    const customValidator = (value: string) => {
      return value === "valid" || "Custom error message";
    };

    renderWithForm(
      <WrappedComponent name="test" customValidator={customValidator} />,
    );

    const input = screen.getByTestId("test-input");
    await userEvent.type(input, "invalid");
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByTestId("error-message")).toBeInTheDocument();
  });

  it("should handle multiple validation rules", async () => {
    renderWithForm(<WrappedComponent name="test" required minLength={5} />);

    const input = screen.getByTestId("test-input");
    await userEvent.type(input, "1234");
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByTestId("error-message")).toBeInTheDocument();
  });

  it("should pass through custom error messages", () => {
    renderWithForm(<WrappedComponent name="test" errors={["Custom error"]} />);

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
        <WrappedComponent
          name="test"
          value=""
          onChange={() => {}}
          required={true}
        />
        <button type="submit">Submit</button>
      </Form>,
    );

    const submitButton = screen.getByRole("button", { name: "Submit" });
    await userEvent.click(submitButton);

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(await screen.findByTestId("error-message")).toBeInTheDocument();
  });

  it("should validate custom validators", async () => {
    const WrappedComponentWithCustomValidator =
      withFieldValidation<TextFieldProps>(TextFieldTesting, {
        validations: {
          _isPrime: () => (value: string) => {
            return Number(value) % 2 === 0 || "Custom error message";
          },
        },
      });
    renderWithForm(<WrappedComponentWithCustomValidator name="test" />);

    const input = screen.getByTestId("test-input");
    await userEvent.type(input, "3");
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByTestId("error-message")).toBeInTheDocument();
  });

  it("should validate custom validators using parent props", async () => {
    const WrappedComponentWithCustomValidator =
      withFieldValidation<TextFieldProps>(TextFieldTesting, {
        validations: {
          _autoCompleteRequireLength3: (props) => (value: string) => {
            return props.autoComplete
              ? value.length > 3
                ? true
                : "Error"
              : true;
          },
        },
      });
    renderWithForm(
      <WrappedComponentWithCustomValidator name="test" autoComplete />,
    );

    const input = screen.getByTestId("test-input");
    await userEvent.type(input, "12");
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByTestId("error-message")).toBeInTheDocument();
  });
});
import { act, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithForm } from "../../lib/testing.js";
import type { ValidatorHandler } from "../../types.js";
import { FormGroup } from "../form-group/index.js";
import { FormLabel } from "../form-label/index.js";
import { FormMessageList } from "../form-message/index.js";
import { Form } from "../form/index.js";
import { Input } from "../input/index.js";
import type { TextFieldProps } from "../text-field/index.js";
import { withFieldValidation } from "./with-field-validation.js";

// Test component that will be wrapped
const TextFieldTesting = React.forwardRef<
  HTMLInputElement,
  Omit<TextFieldProps, "autoComplete">
>(
  (
    { label, value, defaultValue, onChange, errors, pattern, ...props },
    ref,
  ) => {
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
          ref={ref}
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
  },
);

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

  it("should handle extra component validators", async () => {
    const validator = (value: string) => {
      return value === "valid" || "Custom error message";
    };

    renderWithForm(<WrappedComponent name="test" validators={validator} />);

    const input = screen.getByTestId("test-input");
    await userEvent.type(input, "invalid");
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByTestId("error-message")).toBeInTheDocument();
  });

  it("should handle multiple extra component validators", async () => {
    const validator1 = vi.fn().mockReturnValue(true);
    const validator2 = vi.fn().mockReturnValue(true);

    renderWithForm(
      <WrappedComponent name="test" validators={[validator1, validator2]} />,
    );

    const input = screen.getByTestId("test-input");
    await userEvent.type(input, "test");
    await userEvent.keyboard("{Enter}");

    expect(validator1).toHaveBeenCalledTimes(1);
    expect(validator2).toHaveBeenCalledTimes(1);
  });

  it("should handle multiple validation rules", async () => {
    renderWithForm(<WrappedComponent name="test" required minLength={5} />);

    const input = screen.getByTestId("test-input");
    await userEvent.type(input, "1234");
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByTestId("error-message")).toBeInTheDocument();
  });

  it("should pass through custom error messages", async () => {
    await act(() =>
      renderWithForm(
        <WrappedComponent name="test" errors={["Custom error"]} />,
      ),
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

    expect(handleSubmit).toHaveBeenCalledWith({ test: "default" });
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
    const WrappedComponentWithValidator = withFieldValidation<TextFieldProps>(
      TextFieldTesting,
      {
        validations: {
          _isPrime: () =>
            ((value: string) => {
              return Number(value) % 2 === 0 || "Custom error message";
            }) as ValidatorHandler,
        },
      },
    );
    renderWithForm(<WrappedComponentWithValidator name="test" />);

    const input = screen.getByTestId("test-input");
    await userEvent.type(input, "3");
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByTestId("error-message")).toBeInTheDocument();
  });

  it("should validate custom validators using parent props", async () => {
    const WrappedComponentWithValidator = withFieldValidation<TextFieldProps>(
      TextFieldTesting,
      {
        validations: {
          _autoCompleteRequireLength3: (props) =>
            ((value: string) => {
              return props.autoComplete
                ? value.length > 3
                  ? true
                  : "Error"
                : true;
            }) as ValidatorHandler,
        },
      },
    );
    renderWithForm(<WrappedComponentWithValidator name="test" autoComplete />);

    const input = screen.getByTestId("test-input");
    await userEvent.type(input, "12");
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByTestId("error-message")).toBeInTheDocument();
  });

  it("should revalidate on change after a submission with errors", async () => {
    renderWithForm(<WrappedComponent name="test" required />);

    const input = screen.getByTestId("test-input");
    // submit with empty value should fail as the field is required
    await userEvent.type(input, "{Enter}");

    expect(await screen.findByTestId("error-message")).toBeInTheDocument();

    // change the value to trigger revalidation
    await userEvent.type(input, "123");

    expect(screen.queryByTestId("error-message")).toBeNull();
  });

  it("should forward refs to the wrapped component", () => {
    const inputRef = React.createRef<HTMLInputElement>();

    renderWithForm(<WrappedComponent name="test" ref={inputRef} />);

    const input = screen.getByTestId("test-input");

    // initially, the input should not have focus
    expect(input).not.toHaveFocus();

    // directly focus the input using the ref
    inputRef.current?.focus();

    // the input should now have focus
    expect(input).toHaveFocus();
  });
});

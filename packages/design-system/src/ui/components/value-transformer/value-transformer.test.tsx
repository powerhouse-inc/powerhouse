import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FormProvider, useForm } from "react-hook-form";
import ValueTransformer from "./value-transformer.js";
import { userEvent } from "@testing-library/user-event";
import { withFieldValidation } from "../with-field-validation/index.js";

const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const methods = useForm();
  return <FormProvider {...methods}>{children}</FormProvider>;
};

interface InputProps {
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  value?: string;
  name: string;
}

const TestInputRaw = ({
  onChange,
  onBlur,
  value = "",
  name = "test",
}: InputProps) => {
  return (
    <input
      data-testid="test-input"
      onChange={onChange}
      onBlur={onBlur}
      value={value}
      name={name}
    />
  );
};
const TestInput = withFieldValidation<InputProps>(TestInputRaw);

describe("ValueTransformer", () => {
  it("should apply transformer on blur by default", () => {
    const onChange = vi.fn();
    const { getByTestId } = render(
      <TestWrapper>
        <ValueTransformer
          transformers={[
            {
              transformer: (value?: string) => value?.trim(),
            },
          ]}
        >
          <TestInput onChange={onChange} name="test" />
        </ValueTransformer>
      </TestWrapper>,
    );

    const input = getByTestId("test-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  test  " } });
    fireEvent.blur(input);

    expect(input.value).toBe("test");
  });

  it("should apply transformer on change when specified", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { getByTestId } = render(
      <TestWrapper>
        <ValueTransformer
          transformers={[
            {
              transformer: (value?: string) => value?.toUpperCase(),
              options: {
                trigger: "change",
              },
            },
          ]}
        >
          <TestInput onChange={onChange} name="test" />
        </ValueTransformer>
      </TestWrapper>,
    );

    const input = getByTestId("test-input") as HTMLInputElement;
    await user.type(input, "test");

    expect(input.value).toBe("TEST");
  });

  it("should not apply transformer when if condition is false", () => {
    const { getByTestId } = render(
      <TestWrapper>
        <ValueTransformer
          transformers={[
            {
              transformer: (value: string) => value.toUpperCase(),
              options: {
                if: false,
                trigger: "change",
              },
            },
          ]}
        >
          <TestInput name="test" />
        </ValueTransformer>
      </TestWrapper>,
    );

    const input = getByTestId("test-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "test" } });

    expect(input.value).toBe("test");
  });

  it("should apply transformers on mount", () => {
    const { getByTestId } = render(
      <TestWrapper>
        <ValueTransformer
          transformers={[
            {
              transformer: (value?: string) => value?.toUpperCase(),
            },
          ]}
        >
          <TestInput value="test" name="test" />
        </ValueTransformer>
      </TestWrapper>,
    );

    const input = getByTestId("test-input") as HTMLInputElement;
    expect(input.value).toBe("TEST");
  });

  it("should handle array of transformer functions", () => {
    const { getByTestId } = render(
      <TestWrapper>
        <ValueTransformer
          transformers={[
            (value?: string) => value?.trim(),
            (value?: string) => value?.toUpperCase(),
          ]}
        >
          <TestInput name="test" />
        </ValueTransformer>
      </TestWrapper>,
    );

    const input = getByTestId("test-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  test  " } });
    fireEvent.blur(input);

    expect(input.value).toBe("TEST");
  });

  it("should not trigger change event if transformed value is the same", () => {
    const onChange = vi.fn();
    const { getByTestId } = render(
      <TestWrapper>
        <ValueTransformer
          transformers={[
            {
              transformer: (value?: string) => value, // Identity transformer
            },
          ]}
        >
          <TestInput onChange={onChange} name="test" />
        </ValueTransformer>
      </TestWrapper>,
    );

    const input = getByTestId("test-input");
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledTimes(1); // Only the initial change
  });

  it("should preserve original event handlers", async () => {
    const onChangeMock = vi.fn();
    const onBlurMock = vi.fn();

    const { getByTestId } = render(
      <TestWrapper>
        <ValueTransformer
          transformers={[
            {
              transformer: (value?: string) => value?.toUpperCase(),
              options: { trigger: "change" },
            },
          ]}
        >
          <TestInput
            onChange={onChangeMock}
            onBlur={onBlurMock}
            name="test"
            value=""
          />
        </ValueTransformer>
      </TestWrapper>,
    );

    const input = getByTestId("test-input") as HTMLInputElement;
    await userEvent.type(input, "test");
    await userEvent.tab(); // to trigger blur

    expect(onChangeMock).toHaveBeenCalled();
    expect(onBlurMock).toHaveBeenCalled();
  });
});

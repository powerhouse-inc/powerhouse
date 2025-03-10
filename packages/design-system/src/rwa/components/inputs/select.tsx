import { Combobox } from "@/connect";
import { type ComponentPropsWithoutRef } from "react";
import {
  type Control,
  Controller,
  type ControllerProps,
  type FieldValues,
  type Path,
} from "react-hook-form";
import { twMerge } from "tailwind-merge";

export type RWATableSelectProps<ControlInputs extends FieldValues> = Omit<
  ComponentPropsWithoutRef<typeof Combobox>,
  "options" | "required"
> & {
  readonly options: { label: string; value: string }[];
  readonly disabled?: boolean;
  readonly name: Path<ControlInputs>;
  readonly control: Control<ControlInputs>;
  readonly rules?: ControllerProps<ControlInputs>["rules"];
  readonly errorMessage?: string;
  readonly errorMessageClassName?: string;
};

export function RWATableSelect<ControlInputs extends FieldValues>(
  props: RWATableSelectProps<ControlInputs>,
) {
  const {
    options,
    name,
    control,
    rules,
    errorMessage,
    errorMessageClassName,
    disabled = false,
    ...restProps
  } = props;

  const invalid = props["aria-invalid"] === "true";

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value } }) =>
        disabled ? (
          <>{options.find((option) => option.value === value)?.label}</>
        ) : (
          <>
            <Combobox
              isDisabled={disabled}
              onBlur={onBlur}
              onChange={(option) =>
                !!option &&
                typeof option === "object" &&
                "value" in option &&
                onChange(option.value)
              }
              options={options}
              value={options.find((option) => option.value === value) ?? null}
              {...restProps}
            />
            {invalid && !!errorMessage ? (
              <p
                className={twMerge(
                  "text-sm text-red-900",
                  errorMessageClassName,
                )}
                role="alert"
              >
                {errorMessage}
              </p>
            ) : null}
          </>
        )
      }
      rules={rules}
    />
  );
}

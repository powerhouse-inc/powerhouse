import { useFormContext } from "react-hook-form";
import { Controller } from "react-hook-form";
import {
  CheckboxField,
  type CheckboxFieldProps,
} from "../fragments/checkbox-field";
import { ToggleField, type ToggleFieldProps } from "../fragments/toggle-field";
import { ErrorHandling } from "../types";

export interface BooleanFieldProps
  extends CheckboxFieldProps,
    ToggleFieldProps,
    ErrorHandling {
  isToggle?: boolean;
}

export const BooleanField: React.FC<BooleanFieldProps> = ({
  name,
  isToggle,
  errors,
  ...props
}) => {
  const Component = isToggle ? ToggleField : CheckboxField;
  const {
    control,
    formState: { errors: formErrors },
  } = useFormContext();

  return (
    <Controller
      control={control}
      name={name}
      rules={{
        required: {
          value: props.required ?? false,
          message: "This field is required",
        },
        ...(props.customValidator && {
          validate: {
            customValidator: props.customValidator,
          },
        }),
      }}
      render={({ field }) => (
        <Component
          name={field.name}
          value={field.value as boolean}
          onChange={field.onChange}
          // TODO: fix this
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          onBlur={field.onBlur}
          errors={[
            ...(errors ?? []),
            ...(formErrors[name]?.message
              ? [formErrors[name].message as string]
              : []),
          ].filter((error): error is string => typeof error === "string")}
          {...props}
        />
      )}
    />
  );
};

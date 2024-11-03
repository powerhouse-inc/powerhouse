import { Controller, useFormContext } from "react-hook-form";
import { TextField, type TextFieldProps } from "../fragments/text-field";
import { TextareaField, type TextareaProps } from "../fragments/textarea-field";

export interface StringFieldProps
  extends Omit<TextFieldProps, keyof TextareaProps>,
    TextareaProps {
  multiline?: boolean;
  autoExpand?: boolean;
}

const StringField: React.FC<StringFieldProps> = ({
  name,
  multiline,
  autoExpand,
  errors,
  ...props
}) => {
  const isTextArea = multiline || autoExpand;
  const Component = isTextArea ? TextareaField : TextField;

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
        ...(props.pattern && {
          pattern: {
            value: props.pattern,
            message: "This field does not match the required pattern",
          },
        }),
        ...(props.maxLength && {
          maxLength: {
            value: props.maxLength,
            message: `This field must be less than ${props.maxLength} characters`,
          },
        }),
        ...(props.minLength && {
          minLength: {
            value: props.minLength,
            message: `This field must be more than ${props.minLength} characters`,
          },
        }),
        ...(props.customValidator && {
          validate: {
            customValidator: props.customValidator,
          },
        }),
      }}
      render={({ field }) => (
        <Component
          name={field.name}
          value={field.value as string}
          // TODO: fix this
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          onChange={field.onChange}
          // TODO: fix this
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          onBlur={field.onBlur}
          errors={[
            ...(errors ?? []), // custom errors passed in
            ...(formErrors[name]?.message
              ? [formErrors[name].message as string]
              : []), // errors from react-hook-form
          ].filter((error): error is string => typeof error === "string")}
          {...props}
        />
      )}
    />
  );
};

export { StringField };

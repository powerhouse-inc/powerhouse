import React, { useEffect, useState } from "react";
import { Controller, useFormContext, useFormState } from "react-hook-form";
import type {
  FieldCommonProps,
  ErrorHandling,
  ValidatorHandler,
} from "../../types";

interface PossibleProps extends FieldCommonProps<unknown>, ErrorHandling {
  pattern?: RegExp;
  maxLength?: number;
  minLength?: number;
  minValue?: number;
  maxValue?: number;
}

interface PossibleEventsProps {
  onChange?: (event: React.ChangeEvent<unknown>) => unknown;
  onBlur?: (event: React.FocusEvent<unknown>) => unknown;
}

export interface ValidationOptions<T> {
  validations?: Record<string, (parentProps: T) => ValidatorHandler>;
  transformValue?: (value: any) => any;
}

export const withFieldValidation = <T extends PossibleProps>(
  Component: React.ComponentType<T>,
  options?: ValidationOptions<T>,
): React.ComponentType<T> => {
  return ({
    value,
    name,
    showErrorOnBlur,
    showErrorOnChange,
    validators: customValidators,
    ...props
  }: T) => {
    const { onChange: onChangeProp, onBlur: onBlurProp } =
      props as PossibleEventsProps;
    const {
      control,
      formState: { errors: formErrors, defaultValues },
      trigger,
      setValue,
      getValues,
    } = useFormContext();
    const { submitCount } = useFormState();

    const errors = [
      ...(Array.isArray(props.errors) ? props.errors : []),
      ...(formErrors[name]?.message ? [formErrors[name].message] : []),
    ];

    if (errors.length === 0 && !!formErrors[name]) {
      // the field is invalid but no error message was provided
      errors.push("Invalid value");
    }

    const [initialized, setInitialized] = useState(false);
    useEffect(() => {
      if (initialized) {
        setValue(name, value);
      } else {
        // set default value
        if (value === undefined) {
          setValue(name, props.defaultValue ?? defaultValues?.[name]);
        }
      }
      setInitialized(true);
      // initialized can not be in the dependencies because it would cause
      // a change of the value on initial render
    }, [value]);

    // Sync form state with external value prop
    useEffect(() => {
      const formValue = getValues(name) as unknown;
      if (formValue !== value && formValue !== undefined && onChangeProp) {
        onChangeProp({
          target: { value: formValue },
        } as unknown as React.ChangeEvent<unknown>);
      }
    }, [getValues(name)]);

    if (value !== undefined && !onChangeProp) {
      console.warn(
        `[Field: ${name}] Value prop provided without onChange so it will be ignored. Use disabled/readOnly if you want to prevent changes.`,
      );
    }

    return (
      <Controller
        control={control}
        name={name}
        defaultValue={(value ?? props.defaultValue) as unknown}
        disabled={props.disabled}
        render={({
          // just preventing that onChange is included in the rest of the props
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          field: { onChange: _, onBlur: onBlurController, ...rest },
        }) => (
          <Component
            {...(props as T)}
            {...rest}
            onBlur={(event: React.FocusEvent<HTMLInputElement>) => {
              if (showErrorOnBlur) {
                void trigger(name);
              } else {
                onBlurController(); // default behavior
              }

              // trigger parent onBlur
              if (onBlurProp) {
                onBlurProp(event);
              }
            }}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              // update value state
              if (onChangeProp) {
                // the fields is controlled by the parent
                onChangeProp(event);

                if (Object.hasOwn(event, "target")) {
                  // it is probably an actual event
                  setValue(name, event.target.value);
                } else {
                  // it is a custom onChange and it pass the value directly
                  setValue(name, event);
                }
              } else {
                // sometimes the onChange is overridden by the parent and use the new value as parameter instead of event
                let value: unknown = event;
                if (
                  event instanceof Event ||
                  event.target instanceof HTMLElement
                ) {
                  value = event.target.value;
                }
                setValue(name, value); // default behavior
              }

              // now let's validate the field
              if (
                showErrorOnChange === undefined &&
                showErrorOnBlur === undefined
              ) {
                // use form validation mode...
                // if previously validated, then validate on change
                if (submitCount > 0) {
                  void trigger(name);
                }
              } else {
                // default validation behavior was overridden
                if (showErrorOnChange) {
                  void trigger(name);
                }
              }
            }}
            errors={errors}
          />
        )}
        rules={{
          ...(props.required && {
            required: {
              value: props.required,
              message: "This field is required",
            },
          }),
          ...(props.pattern && {
            pattern: {
              value: new RegExp(props.pattern),
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
          ...(props.minValue && {
            min: {
              value: props.minValue,
              message: `This field must be more than ${props.minValue}`,
            },
          }),
          ...(props.maxValue && {
            max: {
              value: props.maxValue,
              message: `This field must be less than ${props.maxValue}`,
            },
          }),
          validate: {
            ...(options?.validations
              ? Object.fromEntries(
                  Object.entries(options.validations).map(
                    ([key, validatorFactory]) => {
                      const propsWithValues = {
                        value,
                        name,
                        showErrorOnBlur,
                        showErrorOnChange,
                        ...props,
                      };
                      return [key, validatorFactory(propsWithValues as T)];
                    },
                  ),
                )
              : {}),
            ...(customValidators !== undefined
              ? Object.fromEntries(
                  (Array.isArray(customValidators)
                    ? customValidators
                    : [customValidators]
                  ).map((validator, index) => [
                    `customValidation${index}`,
                    validator,
                  ]),
                )
              : {}),
          },
        }}
      />
    );
  };
};

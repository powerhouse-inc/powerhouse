import React, { useCallback, useEffect, useState } from "react";
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
      ...(formErrors[name]?.types
        ? (Object.values(formErrors[name].types ?? []) as string[])
        : []),
    ];
    if (errors.length === 0 && !!formErrors[name]) {
      // the field is invalid but no error message was provided
      errors.push("Invalid value");
    }

    useEffect(() => {
      if (submitCount > 0) {
        void trigger(name);
      }
      // we should trigger a re-validation after the form is submitted, the errors are shown
      // and the required prop is changed. Other deps can not be added, otherwise a revalidation
      // will be triggered unnecessarily
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.required]);

    useEffect(() => {
      // if custom errors are provided, then we need to trigger the validation
      // otherwise the errors will not be shown till the form is submitted
      if (props.errors && props.errors.length > 0) {
        void trigger(name);
      }
    }, [name, props.errors, trigger]);

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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [name, value]);

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
        // eslint-disable-next-line react/jsx-no-bind
        render={({
          field: {
            // just preventing that onChange is included in the rest of the props
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            onChange: _,
            onBlur: onBlurController,
            value: internalValue,
            ...rest
          },
        }) => {
          const onBlurCallback = useCallback(
            (event: React.FocusEvent<HTMLInputElement>) => {
              if (showErrorOnBlur) {
                void trigger(name);
              } else {
                onBlurController(); // default behavior
              }

              // trigger parent onBlur
              if (onBlurProp) {
                onBlurProp(event);
              }
            },
            [onBlurController],
          );

          const onChangeCallback = useCallback(
            (event: React.ChangeEvent<HTMLInputElement>) => {
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
            },
            // `internalValue` is the value of the field that is controlled by the form
            // it is used to trigger the validation on change, so we need to add it to the dependencies
            // otherwise the validation will not be triggered on change
            [internalValue],
          );

          return (
            <Component
              {...(props as T)}
              {...rest}
              value={internalValue as unknown}
              onBlur={onBlurCallback}
              onChange={onChangeCallback}
              errors={errors}
            />
          );
        }}
        rules={{
          ...(props.required
            ? {
                required: {
                  value: props.required,
                  message: "This field is required",
                },
              }
            : {
                required: undefined,
              }),
          ...(props.pattern && {
            pattern: {
              value: new RegExp(props.pattern),
              message: "This field does not match the required pattern",
            },
          }),
          ...(props.maxLength
            ? {
                maxLength: {
                  value: props.maxLength,
                  message: `This field must be less than ${props.maxLength} characters`,
                },
              }
            : {
                maxLength: undefined,
              }),
          ...(props.minLength
            ? {
                minLength: {
                  value: props.minLength,
                  message: `This field must be more than ${props.minLength} characters`,
                },
              }
            : {
                minLength: undefined,
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
            // custom errors provided as props
            ...(props.errors
              ? Object.fromEntries(
                  Array.isArray(props.errors)
                    ? props.errors.map((error, index) => [
                        `_propError${index}`,
                        () => error,
                      ])
                    : [],
                )
              : {}),
            // built in validations by the field in the library
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
            // custom validations by the user/developer
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

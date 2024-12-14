import { deepEqual } from "@/scalars/lib/deep-equal";
import { isEmpty } from "@/scalars/lib/is-empty";
import { castValue, ValueCast } from "@/scalars/lib/value-cast";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
} from "react";
import { FormProvider, useForm, UseFormReturn } from "react-hook-form";

interface FormProps {
  /**
   * Content of the form. Can be either React nodes or a render function that receives form methods
   * and returns React nodes. The render function approach is useful when you need access to form state
   * or methods (e.g., to disable submit button while submitting).
   */
  children: React.ReactNode | ((methods: UseFormReturn) => React.ReactNode);

  /**
   * Handler called when the form is submitted. Receives the form data as an argument.
   * The data structure will match the names of your form fields.
   *
   * @param data - An object containing the form values, keyed by field names
   */
  onSubmit: (data: any) => void;

  /**
   * Whether to reset the form after a successful submit.
   *
   * @default false
   */
  resetOnSuccessfulSubmit?: boolean;

  /**
   * Whether to submit only changed values.
   *
   * When enabled, the `onSubmit` callback will only receive fields whose values differ from their
   * corresponding `defaultValues`.
   *
   * @default false
   */
  submitChangesOnly?: boolean;

  /**
   * Initial values for the form fields. Keys should match the 'name' props of your form fields.
   * Useful for editing existing data or setting initial state.
   */
  defaultValues?: Record<string, any>;

  /**
   * Additional CSS class name to apply to the form element.
   * Use this to customize the form's styling.
   */
  className?: string;
}

/**
 * A form component that integrates with react-hook-form for form state management and validation.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <Form onSubmit={handleSubmit}>
 *   <StringField name="email" label="Email" />
 *   <Button type="submit">Submit</Button>
 * </Form>
 *
 * // With form methods access
 * <Form onSubmit={handleSubmit}>
 *   {({ formState: { isSubmitting } }) => (
 *     <>
 *       <StringField name="email" label="Email" />
 *       <Button type="submit" disabled={isSubmitting}>
 *         {isSubmitting ? 'Submitting...' : 'Submit'}
 *       </Button>
 *     </>
 *   )}
 * </Form>
 *
 * // With default values
 * <Form
 *   onSubmit={handleSubmit}
 *   defaultValues={{
 *     email: 'user@example.com'
 *   }}
 * >
 *   <StringField name="email" label="Email" />
 * </Form>
 * ```
 */
export const Form = forwardRef<UseFormReturn, FormProps>(
  (
    {
      children,
      onSubmit,
      resetOnSuccessfulSubmit = false,
      submitChangesOnly = false,
      defaultValues,
      className,
    },
    ref,
  ) => {
    const formId = useId();
    const methods = useForm({
      defaultValues,
      criteriaMode: "all", // display all errors at once
    });
    useImperativeHandle(ref, () => methods, [methods]);

    useEffect(() => {
      if (resetOnSuccessfulSubmit && methods.formState.isSubmitSuccessful) {
        methods.reset({ ...(defaultValues ?? {}) });
      }
    }, [
      resetOnSuccessfulSubmit,
      methods,
      methods.formState.isSubmitSuccessful,
      defaultValues,
    ]);

    const wrappedOnSubmit = useCallback(
      (rawData: Record<string, any>) => {
        let data = rawData;
        // we should make sure that empty fields are submitted as `null`
        // react-hook-form doesn't submit fields with `undefined` values
        // so we need to add them to the data as `null`
        Object.keys(methods.control._fields).forEach((fieldName) => {
          if (!Object.keys(data).includes(fieldName)) {
            data[fieldName] = null;
          }
        });

        if (submitChangesOnly && !!defaultValues) {
          // remove fields that didn't change it's value
          data = Object.fromEntries(
            Object.entries(rawData).filter(
              ([fieldName, value]) =>
                !deepEqual(value, defaultValues[fieldName]),
            ),
          );
        }

        // at this point all the fields that need to be submitted are in the data
        // we just need to make sure that "empty" values are submitted as `null`
        data = Object.fromEntries(
          Object.entries(data).map(([fieldName, value]) => [
            fieldName,
            isEmpty(value) ? null : value,
          ]),
        );

        // cast data if needed to prevent submitting wrong data type
        const form = document.getElementById(formId);
        Object.keys(data).map((key) => {
          try {
            const value: unknown = data[key];
            if (value !== null) {
              const field = form?.querySelector(`[name="${key}"]`);
              const dataCast = field?.getAttribute("data-cast");
              if (dataCast) {
                data[key] = castValue(value, dataCast as ValueCast) as unknown;
              }
            }
          } catch {
            // do nothing
          }
        });

        // we need to return the promise from the onSubmit callback if there is one
        // so react-hook-form can wait for it to resolve and update the form state correctly
        return onSubmit(data);
      },
      [methods.control, submitChangesOnly, defaultValues, formId, onSubmit],
    );

    return (
      <FormProvider {...methods}>
        <form
          id={formId}
          onSubmit={methods.handleSubmit(wrappedOnSubmit)}
          className={className}
          noValidate
        >
          {typeof children === "function" ? children(methods) : children}
        </form>
      </FormProvider>
    );
  },
);

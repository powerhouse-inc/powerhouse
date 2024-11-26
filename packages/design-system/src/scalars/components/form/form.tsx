import { forwardRef, useImperativeHandle } from "react";
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
      defaultValues,
      className,
    },
    ref,
  ) => {
    const methods = useForm({ defaultValues });
    useImperativeHandle(ref, () => methods, [methods]);

    return (
      <FormProvider {...methods}>
        <form
          onSubmit={methods.handleSubmit((data) => {
            onSubmit(data);
            if (resetOnSuccessfulSubmit) {
              methods.reset({ ...defaultValues });
            }
          })}
          className={className}
          noValidate
        >
          {typeof children === "function" ? children(methods) : children}
        </form>
      </FormProvider>
    );
  },
);

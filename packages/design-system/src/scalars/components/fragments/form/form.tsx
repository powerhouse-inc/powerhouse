import { FormProvider, useForm, UseFormReturn } from "react-hook-form";

interface FormProps {
  children: React.ReactNode | ((methods: UseFormReturn) => React.ReactNode);
  onSubmit: (data: any) => void;
  defaultValues?: Record<string, any>;
  className?: string;
}

export const Form: React.FC<FormProps> = ({
  children,
  onSubmit,
  defaultValues,
  className,
}) => {
  const methods = useForm({ defaultValues });

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={methods.handleSubmit(onSubmit)}
        className={className}
        noValidate
      >
        {typeof children === "function" ? children(methods) : children}
      </form>
    </FormProvider>
  );
};

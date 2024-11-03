import { FormProvider, useForm } from "react-hook-form";
import { BooleanField } from "../boolean-field";
import { StringField } from "../string-field";
import React from "react";

const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

interface FormProps extends React.PropsWithChildren {
  onSubmit: (data: any) => void;
  initialValues?: Record<string, any>;
  className?: string;
}

export const Form: React.FC<FormProps> = ({
  children,
  onSubmit,
  initialValues,
  className,
}) => {
  const methods = useForm({ defaultValues: initialValues });

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={methods.handleSubmit(onSubmit)}
        className={className}
        noValidate
      >
        {children}
      </form>
    </FormProvider>
  );
};

const TestingForm = () => {
  const onSubmit = (data: any) => {
    console.log("onSubmit", data);
  };

  return (
    <div className="w-96 rounded-lg bg-white p-8 shadow-md">
      <h2 className="mb-6 text-2xl font-bold">Test Form</h2>
      <Form
        className="space-y-3"
        onSubmit={onSubmit}
        initialValues={{
          agree: false,
          enableNotifications: false,
        }}
      >
        <StringField
          name="name"
          label="Name"
          placeholder="Enter your name"
          required
          maxLength={50}
          minLength={3}
        />

        <StringField
          name="email"
          label="Email"
          type="email"
          placeholder="Enter your email"
          pattern={emailPattern}
          required
        />

        <StringField
          name="hex"
          label="Hexadecimal Number"
          placeholder="Enter a hexadecimal number"
          required
          customValidator={(value: string) => {
            // Remove 0x prefix for validation
            const hexValue = value.replace(/^0x/, "");

            // Check if it's a valid hex number
            if (!/^[0-9A-Fa-f]+$/.test(hexValue)) {
              return "Value must be in hexadecimal format (0-9, A-F)";
            }

            // Convert hex to decimal
            const decimalValue = parseInt(hexValue, 16);

            if (decimalValue < 1 || decimalValue > 100) {
              return "Value must be between 1 and 100 in hexadecimal format (0x1 to 0x64)";
            }

            return true;
          }}
        />

        <div className="space-y-2">
          <BooleanField
            name="agree"
            label="I agree to the terms and conditions"
            required
          />
        </div>

        <div className="space-y-2">
          <BooleanField
            name="enableNotifications"
            label="Enable notifications"
            isToggle={true}
            required
          />
        </div>

        <button
          type="submit"
          className="mt-5 w-full rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
        >
          Submit
        </button>
      </Form>
    </div>
  );
};

export default TestingForm;

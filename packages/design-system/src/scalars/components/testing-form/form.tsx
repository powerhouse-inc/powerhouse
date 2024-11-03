import { ReactNode } from "react";
import {
  FieldValues,
  UseFormReturn,
  useForm,
  SubmitHandler,
} from "react-hook-form";
import { StringField } from "../string-field";
import { BooleanField } from "../boolean-field";

interface FormProps<T extends FieldValues> {
  children: (methods: UseFormReturn<T>) => ReactNode;
  onSubmit: SubmitHandler<T>;
  defaultValues?: Partial<T>;
  mode?: "onBlur" | "onChange" | "onSubmit" | "onTouched" | "all";
}

export const Form: React.FC<FormProps<FieldValues>> = ({
  children,
  onSubmit,
  defaultValues,
  mode = "onSubmit",
}) => {
  const methods = useForm({
    defaultValues,
    mode,
  });

  return (
    <form onSubmit={methods.handleSubmit(onSubmit)}>{children(methods)}</form>
  );
};

export const FormExample = () => {
  type FormData = {
    email: string;
    name: string;
    agree: boolean;
  };

  const onSubmit = (data: FormData) => {
    console.log("Form submitted:", data);
  };

  return (
    <Form onSubmit={onSubmit}>
      {({ register, formState: { errors } }) => (
        <div className="w-96 space-y-4 rounded-lg bg-white p-6 shadow-md">
          <h2 className="text-xl font-semibold">Contact Form</h2>

          <StringField
            label="Name"
            placeholder="Enter your name"
            required
            {...register("name", { required: "Name is required" })}
            errors={
              errors.name?.message ? [errors.name.message as string] : undefined
            }
          />

          <StringField
            label="Email"
            type="email"
            placeholder="Enter your email"
            required
            {...register("email", {
              required: "Email is required",
              pattern: {
                value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                message: "Invalid email address",
              },
            })}
            errors={
              errors.email?.message
                ? [errors.email.message as string]
                : undefined
            }
          />

          <BooleanField
            label="I agree to the terms"
            required
            {...register("agree", {
              required: "You must agree to the terms",
            })}
            errors={
              errors.agree?.message
                ? [errors.agree.message as string]
                : undefined
            }
          />

          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Submit
          </button>
        </div>
      )}
    </Form>
  );
};

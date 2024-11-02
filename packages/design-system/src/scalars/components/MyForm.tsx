import React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import { FormControl } from "./form";
import {
  formSchema,
  validateRequiredField,
} from "./fragments/toggle-field/toggles-schema";
import { ToggleField } from "./fragments";

interface IFormInputs {
  checked: boolean;
}

const MyForm: React.FC = () => {
  const {
    handleSubmit,
    control,

    formState: { errors },
  } = useForm({
    resolver: zodResolver(formSchema),
    mode: "all",
    defaultValues: {
      checked: false,
      required: true,
    },
  });
  const onSubmit = (values: IFormInputs) => {
    //Function to validate the schame appart of zod validation
    //For this case validate the same zod validation, but can validate what you want where
    const validations = validateRequiredField(true, values.checked);
    if (validations.length > 0) {
      console.log(validations);
    } else {
      alert("All the data sent to server");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg bg-white p-6 shadow-md"
        noValidate
      >
        <h2 className="mb-4 text-center text-xl font-semibold">
          Scalars Test Form
        </h2>
        <FormControl>
          <Controller
            name="checked"
            control={control}
            render={({ field: { onChange, onBlur, value } }) => {
              return (
                <ToggleField
                  label="Active"
                  required
                  value={value}
                  validateOnBlur
                  validateOnChange
                  onChange={onChange}
                  onBlur={onBlur}
                  errors={
                    errors.checked ? [errors.checked.message ?? ""] : [""]
                  }
                />
              );
            }}
          />
        </FormControl>
        <div className="mt-4 w-full">
          <button
            type="submit"
            className={`mb-2 w-full rounded-lg px-5 py-2.5 font-medium text-white ${Object.keys(errors).length > 0 ? "bg-gray-300" : "bg-blue-700 hover:bg-blue-800"} ${!(Object.keys(errors).length > 0) ? "focus:outline-none focus:ring-4 focus:ring-blue-300" : ""}`}
          >
            Submit
          </button>
        </div>
      </form>
    </div>
  );
};

export default MyForm;

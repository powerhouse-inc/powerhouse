import React, { useState } from "react";
import { ToggleField } from "@/scalars/components/toggle/toggle-field";
import { CheckboxField } from "./checkbox";
import { zodResolver } from "@hookform/resolvers/zod";
import { useController, useForm } from "react-hook-form";
import {
  FormField,
  Form,
  FormControl,
  FormDescription,
  FormItem,
  FormMessage,
} from "./form";
import { validateRequiredField } from "./toggle/toggles-schema";

const MyForm: React.FC = () => {
  const [toggleChecked, setToggleChecked] = useState(true);
  const [toggleErrors, setToggleErrors] = useState<string[]>([]);
  const [checkboxChecked, setCheckboxChecked] = useState(false);
  const [checkboxErrors, setCheckboxErrors] = useState<string[]>([]);

  const handleToggleChange = (checked: boolean) => {
    setToggleChecked(checked);

    // Run validation whenever the toggle changes
    const errors = validateRequiredField(true, checked);
    setToggleErrors(errors);
  };

  const handleCheckboxChange = (checked: boolean) => {
    setCheckboxChecked(checked);
    if (checked) {
      setCheckboxErrors([]);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const newToggleErrors: string[] = validateRequiredField(
      true,
      toggleChecked,
    );
    const newCheckboxErrors: string[] = [];
    if (!toggleChecked) {
      newToggleErrors.push(
        "Please enable the toggle to proceed",
        "This is another error for testing purposes.",
      );
    }

    if (!checkboxChecked) {
      newCheckboxErrors.push(
        "Verification required. Please confirm to continue.",
      );
    }

    setToggleErrors(newToggleErrors);
    setCheckboxErrors(newCheckboxErrors);

    if (newToggleErrors.length === 0 && newCheckboxErrors.length === 0) {
      alert("All the data send to server");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg bg-white p-6 shadow-md"
        noValidate
      >
        <h2 className="mb-4 text-center text-xl font-semibold">
          Scalars Test Form
        </h2>

        <ToggleField
          name="toggle"
          label="Active"
          required
          checked={toggleChecked}
          validateOnBlur
          validateOnChange
          onCheckedChange={handleToggleChange}
          errors={toggleErrors}
        />
        <p className="mb-2 text-center text-sm text-gray-600">
          Toggle this switch to activate the option above.
        </p>

        <div className="flex flex-row gap-1">
          <CheckboxField
            name="check"
            required
            label="Check"
            checked={checkboxChecked}
            onChange={handleCheckboxChange}
            errors={checkboxErrors}
          />
        </div>
        <p className="mb-2 text-center text-sm text-gray-600">
          Make sure to check this box to confirm.
        </p>

        <div className="mt-4 w-full">
          <button
            type="submit"
            className="mb-2 w-full rounded-lg bg-blue-700 px-5 py-2.5 font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300"
          >
            Submit
          </button>
        </div>
      </form>
    </div>
  );
};

export default MyForm;

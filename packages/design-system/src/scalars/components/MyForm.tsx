import React, { useState } from "react";
import { ToggleField } from "@/scalars/components/toggle/toggle-field";
import { CheckboxField } from "./checkbox";
import { FormLabel } from "./form-label";
import { Radio, RadioGroup } from "./radio-group";

const MyForm: React.FC = () => {
  const [toggleChecked, setToggleChecked] = useState(true);
  const [toggleErrors, setToggleErrors] = useState<string[]>([]);
  const [checkboxChecked, setCheckboxChecked] = useState(false);
  const [checkboxErrors, setCheckboxErrors] = useState<string[]>([]);
  const [radioValue, setRadioValue] = useState<string>("");
  const [radioErrors, setRadioErrors] = useState<string[]>([]);

  const handleToggleChange = (checked: boolean) => {
    setToggleChecked(checked);
    if (checked) {
      setToggleErrors([]);
    }
  };

  const handleCheckboxChange = (checked: boolean) => {
    setCheckboxChecked(checked);
    if (checked) {
      setCheckboxErrors([]);
    }
  };

  const handleRadioChange = (value: string) => {
    setRadioValue(value);
    setRadioErrors([]);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const newToggleErrors: string[] = [];
    const newCheckboxErrors: string[] = [];
    const newRadioErrors: string[] = [];

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

    if (!radioValue) {
      newRadioErrors.push("Please select one of the three options to continue");
    }

    setToggleErrors(newToggleErrors);
    setCheckboxErrors(newCheckboxErrors);
    setRadioErrors(newRadioErrors);

    if (
      newToggleErrors.length === 0 &&
      newCheckboxErrors.length === 0 &&
      newRadioErrors.length === 0
    ) {
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

        <div className="flex flex-col gap-1">
          <FormLabel>Select one option:</FormLabel>
          <RadioGroup
            value={radioValue}
            onValueChange={handleRadioChange}
            errors={radioErrors}
          >
            <Radio key="1" label="Option 1" value="1" />
            <Radio key="2" label="Option 2" value="2" />
            <Radio key="3" label="Option 3" value="3" />
          </RadioGroup>
        </div>
        <p className="mb-2 text-center text-sm text-gray-600">
          Choose the option that best fits your choice.
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

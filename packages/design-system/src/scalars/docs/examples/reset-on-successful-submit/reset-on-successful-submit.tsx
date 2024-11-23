import { Button } from "@/powerhouse/components/button";
import { Form, NumberField, StringField } from "../../../components";

const FormWithResetOnSuccessfulSubmit = () => {
  return (
    <Form
      onSubmit={(data: FormData) => {
        alert(JSON.stringify(data, null, 2));
      }}
      resetOnSuccessfulSubmit
    >
      <div className="flex flex-col gap-2">
        <StringField name="example" label="Field example" required />
        <NumberField name="number" label="Number" required />

        <div className="w-72 text-sm text-gray-500">
          After submitting the form, all form fields will be reset to their
          initial values
        </div>
        <Button type="submit">Submit</Button>
      </div>
    </Form>
  );
};

export default FormWithResetOnSuccessfulSubmit;

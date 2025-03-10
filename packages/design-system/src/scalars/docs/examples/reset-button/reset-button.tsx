import { Button } from "#powerhouse";
import { Form, NumberField, StringField } from "../../../components/index.js";

const FormWithResetButton = () => {
  return (
    <Form
      onSubmit={(data: FormData) => {
        alert(JSON.stringify(data, null, 2));
      }}
    >
      {({ reset }) => (
        <div className="flex flex-col gap-2">
          <StringField
            name="example"
            minLength={3}
            maxLength={6}
            label="Field example"
            required
          />
          <NumberField name="number" label="Number" required />

          <div className="w-72 text-sm text-gray-500">
            Clicking reset will restore all form fields and validation states to
            their initial values
          </div>
          <div className="flex gap-2">
            <Button
              className="w-full"
              color="light"
              type="reset"
              onClick={reset}
            >
              Reset
            </Button>
            <Button className="w-full" color="dark" type="submit">
              Submit
            </Button>
          </div>
        </div>
      )}
    </Form>
  );
};

export default FormWithResetButton;

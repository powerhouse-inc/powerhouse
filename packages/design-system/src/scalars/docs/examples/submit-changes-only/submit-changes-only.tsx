import { Button } from "#powerhouse";
import { Form, StringField } from "../../../components";

const SubmitChangesOnly = () => {
  return (
    <Form
      onSubmit={(data: FormData) => {
        alert(JSON.stringify(data, null, 2));
      }}
      submitChangesOnly
      defaultValues={{
        firstName: "Jhon",
        lastName: "Doe",
        bio: "I'm a software engineer",
      }}
    >
      {({ reset }) => (
        <div className="flex w-full flex-col gap-2 md:w-96">
          <StringField
            name="firstName"
            placeholder="Jhon"
            label="First name"
            required
          />
          <StringField
            name="lastName"
            placeholder="Doe"
            label="Last name"
            required
          />
          <StringField
            name="bio"
            placeholder="I'm a software engineer"
            label="Bio"
            description="If you leave this field empty, it will be submitted as null"
            multiline
          />

          <div className="text-sm text-gray-500">
            After submitting the form, all form fields will be reset to their
            initial values
          </div>

          <div className="flex gap-2">
            <Button
              className="w-full"
              color="light"
              type="reset"
              onClick={() => reset()}
            >
              Reset
            </Button>
            <Button className="w-full" type="submit">
              Submit
            </Button>
          </div>
        </div>
      )}
    </Form>
  );
};

export default SubmitChangesOnly;

export const DOCS_CODE = `
const SubmitChangesOnly = () => {
  return (
    <Form
      onSubmit={(data: FormData) => {
        alert(JSON.stringify(data, null, 2));
      }}
      submitChangesOnly
      defaultValues={{
        firstName: "Jhon",
        lastName: "Doe",
        bio: "I'm a software engineer",
      }}
    >
      {({ reset }) => (
        <div className="flex w-full flex-col gap-2 md:w-96">
          <StringField
            name="firstName"
            placeholder="Jhon"
            label="First name"
            required
          />
          <StringField
            name="lastName"
            placeholder="Doe"
            label="Last name"
            required
          />
          <StringField
            name="bio"
            placeholder="I'm a software engineer"
            label="Bio"
            description="If you leave this field empty, it will be submitted as null"
            multiline
          />

          <div className="text-sm text-gray-500">
            After submitting the form, all form fields will be reset to their
            initial values
          </div>

          <div className="flex gap-2">
            <Button
              className="w-full"
              color="light"
              type="reset"
              onClick={() => reset()}
            >
              Reset
            </Button>
            <Button className="w-full" type="submit">
              Submit
            </Button>
          </div>
        </div>
      )}
    </Form>
  );
};
`;

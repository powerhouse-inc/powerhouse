import type { Meta, StoryObj } from "@storybook/react";
import FormWithResetOnSuccessfulSubmit from "./reset-on-successful-submit.js";

const meta = {
  title: "Document Engineering/Scalars/Examples/Reset On Successful Submit",
  component: FormWithResetOnSuccessfulSubmit,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      source: {
        language: "tsx",
        format: true,
        code: `
const FormWithResetOnSuccessfulSubmit = () => {
  return (
    <Form
      onSubmit={(data: FormData) => {
        alert(JSON.stringify(data, null, 2));
      }}
      resetOnSuccessfulSubmit
      defaultValues={{
        example: "",
        number: 0,
      }}
    >
      <div className="flex flex-col gap-2">
        <IdField />
        <StringField
          name="example"
          placeholder="Type something"
          label="Field example"
          required
          autoFocus
        />
        <NumberField name="number" label="Number" required />
        <Button type="submit">Submit</Button>
      </div>
    </Form>
  );
};
`,
      },
    },
  },
} satisfies Meta<typeof FormWithResetOnSuccessfulSubmit>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

import type { Meta, StoryObj } from "@storybook/react";
import FormWithResetOnSuccessfulSubmit from "./reset-on-successful-submit";

const meta = {
  title: "Document Engineering/Docs/Examples/Reset On Successful Submit",
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
    >
      <StringField name="example" label="Field example" required />
      <NumberField name="number" label="Number" required />

      <Button type="submit">Submit</Button>
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

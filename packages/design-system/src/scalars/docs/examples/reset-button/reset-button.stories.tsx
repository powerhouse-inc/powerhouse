import type { Meta, StoryObj } from "@storybook/react";
import FormWithResetButton from "./reset-button.js";

const meta = {
  title: "Document Engineering/Docs/Examples/Reset Button",
  component: FormWithResetButton,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      source: {
        language: "tsx",
        format: true,
        code: `
const FormWithResetButton = () => {
  return (
    <Form onSubmit={(data: FormData) => {
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

          <div className="flex gap-2">
            <Button type="submit">Submit</Button>
            <Button type="reset" onClick={reset}>Reset</Button>
          </div>
        </div>
      )}
    </Form>
  );
};
`,
      },
    },
  },
} satisfies Meta<typeof FormWithResetButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

import { Icon } from "#powerhouse";
import type { Meta, StoryObj } from "@storybook/react";
import { FormInput } from "./form-input.js";

const meta = {
  title: "Connect/Components/Form Input",
  component: FormInput,
} satisfies Meta<typeof FormInput>;

export default meta;

type Story = StoryObj<typeof meta>;

const Template: Story = {
  args: {
    name: "driveName",
    icon: <Icon name="Drive" />,
    placeholder: "Enter value",
  },
  decorators: [
    (Story) => (
      <div className="grid h-48 w-96 place-items-center bg-white">
        <Story />
      </div>
    ),
  ],
};

export const Default: Story = {
  ...Template,
};

export const WithValue: Story = {
  ...Template,
  args: {
    ...Template.args,
    value: "hello I am a value",
  },
};

export const Email: Story = {
  ...Template,
  args: {
    ...Template.args,
    type: "email",
    placeholder: "you@powerhouse.io",
  },
};

export const Password: Story = {
  ...Template,
  args: {
    ...Template.args,
    type: "password",
    placeholder: "YourPassword123",
  },
};

export const WithLengthLimits: Story = {
  ...Template,
  args: {
    ...Template.args,
    minLength: 2,
    maxLength: 3,
  },
};

export const WithRegexPattern: Story = {
  ...Template,
  args: {
    ...Template.args,
    pattern: "[a-c]{3}",
  },
};

export const Required: Story = {
  ...Template,
  args: {
    ...Template.args,
    required: true,
  },
};

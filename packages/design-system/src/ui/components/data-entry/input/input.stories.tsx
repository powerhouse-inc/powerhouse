import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "./input.js";

const meta = {
  title: "Document Engineering/Data Entry/Input",
  component: Input,
  parameters: {
    layout: "centered",
    chromatic: {
      disableSnapshot: true,
    },
  },
  tags: ["autodocs"],
  argTypes: {
    className: {
      control: "text",
    },
    placeholder: {
      control: "text",
    },
    disabled: {
      control: "boolean",
    },
    value: {
      control: "text",
    },
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: "Type something...",
  },
};

export const WithValue: Story = {
  args: {
    value: "Hello World",
  },
};

export const Empty: Story = {
  args: {},
};

export const Placeholder: Story = {
  args: {
    placeholder: "Enter your text here",
  },
};

export const Focused: Story = {
  args: {
    placeholder: "This input is focused",
    autoFocus: true,
  },
  parameters: {
    pseudo: { focus: true },
  },
};

export const Disabled: Story = {
  args: {
    placeholder: "This input is disabled",
    disabled: true,
  },
};

export const WithCustomWidth: Story = {
  args: {
    className: "w-[50px]",
  },
};

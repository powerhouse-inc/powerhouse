import type { Meta, StoryObj } from "@storybook/react";
import { Toggle } from "./toggle";

const meta: Meta<typeof Toggle> = {
  title: "Document Engineering/Simple Components/Toggle",
  tags: ["autodocs"],
  component: Toggle,
  argTypes: {
    checked: {
      control: {
        type: "boolean",
      },
      description: "Indicates if the toggle is checked",
      defaultValue: false,
    },
    disabled: {
      control: {
        type: "boolean",
      },
      description: "Indicates if the toggle is disabled",
    },
    label: {
      control: {
        type: "text",
      },
      description: "Label for the toggle",
    },
    type: {
      control: {
        type: "select",
      },
      options: ["error", "info", "warning"],
      description: "Type of message to display (error, info, etc.)",
    },
    errors: {
      control: {
        type: "object",
      },
      description: "Array of error objects to display",
    },
    required: {
      control: {
        type: "boolean",
      },
      description: "Indicates if the toggle is required",
    },
    className: {
      control: {
        type: "text",
      },
      description: "Additional CSS classes for styling",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    checked: false,
    disabled: false,
    label: "",
    type: "info",
    errors: [],
    required: false,
    className: "",
  },
};

export const Checked: Story = {
  args: {
    checked: true,
  },
};

export const DisabledChecked: Story = {
  args: {
    checked: true,
    disabled: true,
  },
};

export const DisabledUnChecked: Story = {
  name: "Disabled Unchecked",
  args: {
    disabled: true,
    checked: false,
  },
};

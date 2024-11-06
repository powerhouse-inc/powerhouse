import type { Meta, StoryObj } from "@storybook/react";
import { Radio } from "./radio";
import { RadioGroup } from "../radio-group";

const meta: Meta<typeof Radio> = {
  argTypes: {
    checked: {
      control: "boolean",
      description: "Indicates if the Radio is checked",
    },
    className: {
      control: "text",
      description: "Additional CSS classes to apply to the Radio",
    },
    description: {
      control: "text",
      description: "Description for the Radio",
    },
    disabled: {
      control: "boolean",
      description: "Indicates if the Radio is disabled",
      table: { defaultValue: { summary: "false" } },
    },
    label: {
      control: "text",
      description: "Label for the Radio",
      table: { defaultValue: { summary: "" } },
    },
    value: {
      control: "text",
      description: "Value of the Radio input",
      table: { defaultValue: { summary: "" } },
    },
  },
  component: Radio,
  decorators: [
    (Story) => (
      <RadioGroup name="radio-group">
        <div className="flex items-center space-x-2.5" role="presentation">
          <Story />
        </div>
      </RadioGroup>
    ),
  ],
  title: "Document Engineering/Fragments/Radio",
};

export default meta;

type Story = StoryObj<typeof Radio>;

export const Default: Story = {
  args: {
    label: "Default",
    value: "default",
  },
};

export const DefaultChecked: Story = {
  args: {
    checked: true,
    label: "Default Checked",
    value: "default-checked",
  },
};

export const DefaultWithDescription: Story = {
  args: {
    description: "This is a default Radio with description",
    label: "Default with description",
    value: "default-with-description",
  },
};

export const DefaultWithDescriptionChecked: Story = {
  args: {
    checked: true,
    description: "This is a default Radio with description and checked",
    label: "Default with description and checked",
    value: "default-with-description-checked",
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    label: "Disabled",
    value: "disabled",
  },
};

export const DisabledChecked: Story = {
  args: {
    checked: true,
    disabled: true,
    label: "Disabled checked",
    value: "disabled-checked",
  },
};

export const DisabledWithDescription: Story = {
  args: {
    description: "This is a disabled Radio with description",
    disabled: true,
    label: "Disabled with description",
    value: "disabled-with-description",
  },
};

export const DisabledWithDescriptionChecked: Story = {
  args: {
    checked: true,
    description: "This is a disabled Radio with description and checked",
    disabled: true,
    label: "Disabled with description and checked",
    value: "disabled-with-description-checked",
  },
};

export const Focus: Story = {
  args: {
    label: "Focus",
    value: "focus",
  },
  parameters: {
    pseudo: { focus: true },
  },
};

export const FocusChecked: Story = {
  args: {
    checked: true,
    label: "Focus Checked",
    value: "focus-checked",
  },
  parameters: {
    pseudo: { focus: true },
  },
};

export const FocusWithDescription: Story = {
  args: {
    description: "This is a focused Radio with description",
    label: "Focus with description",
    value: "focus-with-description",
  },
  parameters: {
    pseudo: { focus: true },
  },
};

export const FocusWithDescriptionChecked: Story = {
  args: {
    checked: true,
    description: "This is a focused Radio with description and checked",
    label: "Focus with description and checked",
    value: "focus-with-description-checked",
  },
  parameters: {
    pseudo: { focus: true },
  },
};

export const Hover: Story = {
  args: {
    label: "Hover",
    value: "hover",
  },
  parameters: {
    pseudo: { hover: true },
  },
};

export const HoverChecked: Story = {
  args: {
    checked: true,
    label: "Hover Checked",
    value: "hover-checked",
  },
  parameters: {
    pseudo: { hover: true },
  },
};

export const HoverWithDescription: Story = {
  args: {
    description: "This is a hovered Radio with description",
    label: "Hover with description",
    value: "hover-with-description",
  },
  parameters: {
    pseudo: { hover: true },
  },
};

export const HoverWithDescriptionChecked: Story = {
  args: {
    checked: true,
    description: "This is a hovered Radio with description and checked",
    label: "Hover with description and checked",
    value: "hover-with-description-checked",
  },
  parameters: {
    pseudo: { hover: true },
  },
};

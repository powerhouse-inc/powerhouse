import type { Meta, StoryObj } from "@storybook/react";
import { Radio } from "./radio";
import { RadioGroup } from "../radio-group";

const meta: Meta<typeof Radio> = {
  component: Radio,
  decorators: [
    (Story) => (
      <RadioGroup name="radio-group">
        <Story />
      </RadioGroup>
    ),
  ],
  parameters: {
    controls: { sort: "requiredFirst" },
  },
  tags: ["autodocs"],
  title: "Document Engineering/Simple Components/Radio Group/Radio",
};

export default meta;

type Story = StoryObj<typeof Radio>;

export const Default: Story = {
  argTypes: {
    label: { control: "text" },
    value: { control: "text" },
  },
  args: {
    label: "Default",
    value: "default",
  },
};

export const DefaultChecked: Story = {
  argTypes: {
    checked: { control: "boolean" },
    label: { control: "text" },
    value: { control: "text" },
  },
  args: {
    checked: true,
    label: "Default Checked",
    value: "default-checked",
  },
};

export const DefaultWithDescription: Story = {
  argTypes: {
    description: { control: "text" },
    label: { control: "text" },
    value: { control: "text" },
  },
  args: {
    description: "This is a default radio with description",
    label: "Default with description",
    value: "default-with-description",
  },
};

export const DefaultWithDescriptionChecked: Story = {
  argTypes: {
    checked: { control: "boolean" },
    description: { control: "text" },
    label: { control: "text" },
    value: { control: "text" },
  },
  args: {
    checked: true,
    description: "This is a default radio with description & checked",
    label: "Default with description & checked",
    value: "default-with-description-checked",
  },
};

export const Focus: Story = {
  argTypes: {
    label: { control: "text" },
    value: { control: "text" },
  },
  args: {
    label: "Focus",
    value: "focus",
  },
  parameters: {
    pseudo: { focus: true },
  },
};

export const FocusChecked: Story = {
  argTypes: {
    checked: { control: "boolean" },
    label: { control: "text" },
    value: { control: "text" },
  },
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
  argTypes: {
    description: { control: "text" },
    label: { control: "text" },
    value: { control: "text" },
  },
  args: {
    description: "This is a focused radio with description",
    label: "Focus with description",
    value: "focus-with-description",
  },
  parameters: {
    pseudo: { focus: true },
  },
};

export const FocusWithDescriptionChecked: Story = {
  argTypes: {
    checked: { control: "boolean" },
    description: { control: "text" },
    label: { control: "text" },
    value: { control: "text" },
  },
  args: {
    checked: true,
    description: "This is a focused radio with description & checked",
    label: "Focus with description & checked",
    value: "focus-with-description-checked",
  },
  parameters: {
    pseudo: { focus: true },
  },
};

export const Hover: Story = {
  argTypes: {
    label: { control: "text" },
    value: { control: "text" },
  },
  args: {
    label: "Hover",
    value: "hover",
  },
  parameters: {
    pseudo: { hover: true },
  },
};

export const HoverChecked: Story = {
  argTypes: {
    checked: { control: "boolean" },
    label: { control: "text" },
    value: { control: "text" },
  },
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
  argTypes: {
    description: { control: "text" },
    label: { control: "text" },
    value: { control: "text" },
  },
  args: {
    description: "This is a hovered radio with description",
    label: "Hover with description",
    value: "hover-with-description",
  },
  parameters: {
    pseudo: { hover: true },
  },
};

export const HoverWithDescriptionChecked: Story = {
  argTypes: {
    checked: { control: "boolean" },
    description: { control: "text" },
    label: { control: "text" },
    value: { control: "text" },
  },
  args: {
    checked: true,
    description: "This is a hovered radio with description & checked",
    label: "Hover with description & checked",
    value: "hover-with-description-checked",
  },
  parameters: {
    pseudo: { hover: true },
  },
};

export const ReadOnly: Story = {
  argTypes: {
    label: { control: "text" },
    readOnly: { control: "boolean" },
    value: { control: "text" },
  },
  args: {
    label: "Read only",
    readOnly: true,
    value: "readonly",
  },
};

export const ReadOnlyChecked: Story = {
  argTypes: {
    checked: { control: "boolean" },
    label: { control: "text" },
    readOnly: { control: "boolean" },
    value: { control: "text" },
  },
  args: {
    checked: true,
    label: "Read only checked",
    readOnly: true,
    value: "readonly-checked",
  },
};

export const ReadOnlyWithDescription: Story = {
  argTypes: {
    description: { control: "text" },
    label: { control: "text" },
    readOnly: { control: "boolean" },
    value: { control: "text" },
  },
  args: {
    description: "This is a read-only radio with description",
    label: "Read only with description",
    readOnly: true,
    value: "readonly-with-description",
  },
};

export const ReadOnlyWithDescriptionChecked: Story = {
  argTypes: {
    checked: { control: "boolean" },
    description: { control: "text" },
    label: { control: "text" },
    readOnly: { control: "boolean" },
    value: { control: "text" },
  },
  args: {
    checked: true,
    description: "This is a read-only radio with description & checked",
    label: "Read only with description & checked",
    readOnly: true,
    value: "readonly-with-description-checked",
  },
};

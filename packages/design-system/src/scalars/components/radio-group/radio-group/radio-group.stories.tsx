import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Radio } from "../radio";
import { RadioGroup } from "./radio-group";

const meta: Meta<typeof RadioGroup> = {
  argTypes: {
    defaultValue: { control: "text" },
    description: { control: "text" },
    errors: { control: "object" },
    label: { control: "text" },
    required: { control: "boolean" },
    value: { control: "text" },
  },
  component: RadioGroup,
  parameters: {
    controls: { sort: "requiredFirst" },
  },
  tags: ["autodocs"],
  title: "Document Engineering/Simple Components/Radio Group/Radio Group",
};

export default meta;

type Story = StoryObj<typeof RadioGroup>;

export const WithoutLabel: Story = {
  args: {
    children: [
      <Radio key="1" label="Option 1" value="1" />,
      <Radio key="2" label="Option 2" value="2" />,
      <Radio key="3" label="Option 3" value="3" />,
    ],
  },
};

export const WithLabel: Story = {
  args: {
    children: [
      <Radio key="1" label="Option 1" value="1" />,
      <Radio key="2" label="Option 2" value="2" />,
      <Radio key="3" label="Option 3" value="3" />,
    ],
    label: "Radio Group with label",
  },
};

export const WithLabelAndDescription: Story = {
  args: {
    children: [
      <Radio key="1" label="Option 1" value="1" />,
      <Radio key="2" label="Option 2" value="2" />,
      <Radio key="3" label="Option 3" value="3" />,
    ],
    description: "This is a helpful description for the radio group",
    label: "Radio Group with label and description",
  },
};

export const WithErrors: Story = {
  args: {
    children: [
      <Radio key="1" label="Option 1" value="1" hasError />,
      <Radio key="2" label="Option 2" value="2" hasError />,
      <Radio key="3" label="Option 3" value="3" hasError />,
    ],
    errors: ["Error 1", "Error 2"],
    label: "Radio Group with errors",
  },
};

export const Required: Story = {
  args: {
    children: [
      <Radio key="1" label="Option 1" value="1" />,
      <Radio key="2" label="Option 2" value="2" />,
      <Radio key="3" label="Option 3" value="3" />,
    ],
    label: "Required Radio Group",
    required: true,
  },
};

export const WithOptionSelectedByDefault: Story = {
  args: {
    children: [
      <Radio key="1" label="Option 1" value="1" />,
      <Radio key="2" label="Option 2" value="2" />,
      <Radio key="3" label="Option 3" value="3" />,
    ],
    defaultValue: "2",
    label: "Radio group with option selected by default",
  },
};

const ControlledRadioGroup = () => {
  const [value, setValue] = React.useState("1");
  const handleChange = (newValue: string) => {
    setValue(newValue);
  };

  return (
    <RadioGroup
      label="Controlled Radio Group"
      onValueChange={handleChange}
      value={value}
    >
      <Radio key="1" label="Option 1" value="1" />
      <Radio key="2" label="Option 2" value="2" />
      <Radio key="3" label="Option 3" value="3" />
    </RadioGroup>
  );
};

export const Controlled: Story = {
  render: () => <ControlledRadioGroup />,
};

export const WithDescriptionInOptions: Story = {
  args: {
    children: [
      <Radio
        description="Description for option 1"
        key="1"
        label="Option 1"
        value="1"
      />,
      <Radio
        description="Description for option 2"
        key="2"
        label="Option 2"
        value="2"
      />,
    ],
    label: "Radio group with description in the options",
  },
};

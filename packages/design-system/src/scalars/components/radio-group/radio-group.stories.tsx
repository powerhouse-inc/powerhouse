import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { action } from "@storybook/addon-actions";
import { RadioGroupField } from "./radio-group-field";

const meta: Meta<typeof RadioGroupField> = {
  argTypes: {
    className: {
      control: "text",
      description: "Additional CSS classes to apply to the Radio Group",
    },
    defaultValue: {
      control: "text",
      description: "Default selected value for the Radio Group",
    },
    description: {
      control: "text",
      description: "Description for the Radio Group",
    },
    errors: {
      control: "object",
      description: "Array of error messages to display",
      table: { defaultValue: { summary: "[]" } },
    },
    label: {
      control: "text",
      description: "Label for the Radio Group",
    },
    onChange: {
      action: "onChange",
      description: "Callback fired when the value changes",
    },
    radioOptions: {
      control: "object",
      description:
        "Array of radio options with label, value and optional description",
      table: { defaultValue: { summary: "[]" } },
    },
    required: {
      control: "boolean",
      description:
        "Indicates if selecting an option in the Radio Group is required",
      table: { defaultValue: { summary: "false" } },
    },
    value: {
      control: "text",
      description: "Currently selected value in the Radio Group",
    },
  },
  component: RadioGroupField,
  parameters: {
    controls: { sort: "requiredFirst" },
  },
  tags: ["autodocs"],
  title: "Document Engineering/Simple Components/Radio Group/Radio Group",
};

export default meta;

type Story = StoryObj<typeof RadioGroupField>;

export const WithoutLabel: Story = {
  args: {
    radioOptions: [
      { label: "Option 1", value: "1" },
      { label: "Option 2", value: "2" },
      { label: "Option 3", value: "3" },
    ],
  },
};

export const WithLabel: Story = {
  args: {
    label: "Radio Group with label",
    radioOptions: [
      { label: "Option 1", value: "1" },
      { label: "Option 2", value: "2" },
      { label: "Option 3", value: "3" },
    ],
  },
};

export const WithLabelAndDescription: Story = {
  args: {
    description: "This is a helpful description for the Radio Group",
    label: "Radio Group with label and description",
    radioOptions: [
      { label: "Option 1", value: "1" },
      { label: "Option 2", value: "2" },
      { label: "Option 3", value: "3" },
    ],
  },
};

export const WithErrors: Story = {
  args: {
    errors: ["Error 1", "Error 2"],
    label: "Radio Group with errors",
    radioOptions: [
      { label: "Option 1", value: "1" },
      { label: "Option 2", value: "2" },
      { label: "Option 3", value: "3" },
    ],
  },
};

export const Required: Story = {
  args: {
    label: "Required Radio Group",
    radioOptions: [
      { label: "Option 1", value: "1" },
      { label: "Option 2", value: "2" },
      { label: "Option 3", value: "3" },
    ],
    required: true,
  },
};

export const WithOptionSelectedByDefault: Story = {
  args: {
    defaultValue: "2",
    label: "Radio Group with option selected by default",
    radioOptions: [
      { label: "Option 1", value: "1" },
      { label: "Option 2", value: "2" },
      { label: "Option 3", value: "3" },
    ],
  },
};

const ControlledRadioGroup = () => {
  const [value, setValue] = React.useState("1");
  const handleChange = (newValue: string) => {
    setValue(newValue);
    action("onChange")(newValue);
  };

  return (
    <RadioGroupField
      label="Controlled Radio Group"
      onChange={handleChange}
      radioOptions={[
        { label: "Option 1", value: "1" },
        { label: "Option 2", value: "2" },
        { label: "Option 3", value: "3" },
      ]}
      value={value}
    />
  );
};

export const Controlled: Story = {
  render: () => <ControlledRadioGroup />,
  parameters: {
    docs: {
      source: {
        code: `
const ControlledRadioGroup = () => {
  const [value, setValue] = React.useState("1");
  const handleChange = (newValue: string) => {
    setValue(newValue);
  };

  return (
    <RadioGroupField
      label="Controlled Radio Group"
      onChange={handleChange}
      radioOptions={[
        { label: "Option 1", value: "1" },
        { label: "Option 2", value: "2" },
        { label: "Option 3", value: "3" },
      ]}
      value={value}
    />
  );
};
        `,
      },
    },
  },
};

export const WithDescriptionInOptions: Story = {
  args: {
    label: "Radio Group with description in the options",
    radioOptions: [
      {
        description: "Description for option 1",
        label: "Option 1",
        value: "1",
      },
      {
        description: "Description for option 2",
        label: "Option 2",
        value: "2",
      },
    ],
  },
};

export const WithDisabledOptions: Story = {
  args: {
    label: "Radio Group with disabled options",
    radioOptions: [
      { label: "Option 1", value: "1" },
      { label: "Option 2 (Disabled)", value: "2", disabled: true },
      { label: "Option 3", value: "3" },
      {
        label: "Option 4 (Disabled with description)",
        value: "4",
        disabled: true,
        description: "This option is disabled and has a description",
      },
    ],
  },
};

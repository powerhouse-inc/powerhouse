import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { action } from "@storybook/addon-actions";
import { RadioGroupField } from "./radio-group-field";

const meta: Meta<typeof RadioGroupField> = {
  argTypes: {
    className: {
      control: "text",
      description: "Additional CSS classes to apply to the Radio Group",
      table: {
        type: { summary: "string" },
        category: "Styling",
      },
    },
    defaultValue: {
      control: "text",
      description: "Default selected value for uncontrolled Radio Group",
      table: {
        type: { summary: "string" },
        category: "State",
      },
    },
    description: {
      control: "text",
      description: "Description for the Radio Group",
      table: {
        type: { summary: "string" },
        category: "Content",
      },
    },
    errors: {
      control: "object",
      description: "Array of error messages to display below the Radio Group",
      table: {
        type: { summary: "string[]" },
        defaultValue: { summary: "[]" },
        category: "Validation",
      },
    },
    id: {
      control: "text",
      description: "Unique identifier for the Radio Group",
      table: {
        type: { summary: "string" },
        category: "Technical",
      },
    },
    label: {
      control: "text",
      description: "Label for the Radio Group",
      table: {
        type: { summary: "string" },
        category: "Content",
      },
    },
    name: {
      control: "text",
      description: "Name attribute for the Radio Group form field",
      table: {
        type: { summary: "string" },
        category: "Technical",
      },
    },
    onChange: {
      action: "onChange",
      description: "Callback fired when a radio option is selected",
      table: {
        type: { summary: "(value: string) => void" },
        category: "Events",
      },
    },
    radioOptions: {
      control: "object",
      description:
        "Array of radio options with label, value, description, and disabled state",
      table: {
        type: {
          summary:
            "Array<{ label: string; value: string; description?: string; disabled?: boolean; }>",
        },
        defaultValue: { summary: "[]" },
        category: "Content",
      },
    },
    required: {
      control: "boolean",
      description: "Whether selecting an option is required",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: "Validation",
      },
    },
    value: {
      control: "text",
      description: "Currently selected value (for controlled component)",
      table: {
        type: { summary: "string" },
        category: "State",
      },
    },
    warnings: {
      control: "object",
      description: "Array of warning messages to display below the Radio Group",
      table: {
        type: { summary: "string[]" },
        defaultValue: { summary: "[]" },
        category: "Validation",
      },
    },
  },
  component: RadioGroupField,
  parameters: {
    layout: "centered",
    controls: {
      sort: "requiredFirst",
      expanded: true,
    },
  },
  tags: ["autodocs"],
  title: "Document Engineering/Fragments/Radio Group Field",
};

export default meta;

type Story = StoryObj<typeof RadioGroupField>;

const defaultRadioOptions = [
  { label: "Option 1", value: "1" },
  { label: "Option 2", value: "2" },
  { label: "Option 3", value: "3" },
];

export const WithoutLabel: Story = {
  args: {
    radioOptions: defaultRadioOptions,
  },
};

export const WithLabel: Story = {
  args: {
    label: "Radio Group with label",
    radioOptions: defaultRadioOptions,
  },
};

export const WithLabelAndDescription: Story = {
  args: {
    description: "This is a helpful description for the Radio Group",
    label: "Radio Group with label and description",
    radioOptions: defaultRadioOptions,
  },
};

export const WithWarnings: Story = {
  args: {
    warnings: ["Warning 1", "Warning 2"],
    label: "Radio Group with warnings",
    radioOptions: defaultRadioOptions,
  },
};

export const WithErrors: Story = {
  args: {
    errors: ["Error 1", "Error 2"],
    label: "Radio Group with errors",
    radioOptions: defaultRadioOptions,
  },
};

export const WithWarningsAndErrors: Story = {
  args: {
    warnings: ["Warning 1", "Warning 2"],
    errors: ["Error 1", "Error 2"],
    label: "Radio Group with warnings and errors",
    radioOptions: defaultRadioOptions,
  },
};

export const Required: Story = {
  args: {
    label: "Required Radio Group",
    radioOptions: defaultRadioOptions,
    required: true,
  },
};

export const WithOptionSelectedByDefault: Story = {
  args: {
    defaultValue: "2",
    label: "Radio Group with option selected by default",
    radioOptions: defaultRadioOptions,
  },
};

const ControlledRadioGroup = () => {
  const [value, setValue] = useState("1");
  const handleChange = (newValue: string) => {
    setValue(newValue);
    action("onChange")(newValue);
  };

  return (
    <RadioGroupField
      label="Controlled Radio Group"
      onChange={handleChange}
      radioOptions={defaultRadioOptions}
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
  const [value, setValue] = useState("1");
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

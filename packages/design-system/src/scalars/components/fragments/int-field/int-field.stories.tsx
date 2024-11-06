import type { Meta, StoryObj } from "@storybook/react";
import { IntField } from "./int-field";

const meta = {
  title: "Document Engineering/Fragments/IntField",
  component: IntField,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    name: {
      control: "text",
      description: "Name attribute for the input field",
    },
    label: {
      control: "text",
      description: "Label text displayed above the input field",
    },
    description: {
      control: "text",
      description: "Helper text displayed below the input field",
    },
    value: {
      control: "number",
      description: "Controlled value of the input field",
    },
    required: {
      control: "boolean",
      description: "Whether the field is required",
    },
    disabled: {
      control: "boolean",
      description: "Whether the input field is disabled",
    },
    placeholder: {
      control: "text",
      description: "Placeholder text shown when field is empty",
    },
    minValue: {
      control: "number",
      description: "Minimum number of characters allowed",
    },
    maxValue: {
      control: "number",
      description: "Maximum number of characters allowed",
    },
    autoComplete: {
      control: "boolean",
      description: "AutoComplete attribute for the input field",
    },
    errors: {
      control: "object",
      description: "Array of error messages to display below the field",
    },
    warnings: {
      control: "object",
      description: "Array of warning messages to display below the field",
    },
    allowNegative: {
      control: "boolean",
      description: "Allows the input field to accept negative numbers",
    },
  },
  args: {
    errors: [],
    warnings: [],
  },
} satisfies Meta<typeof IntField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 5,
  },
};
export const DefaultActive: Story = {
  args: {
    name: "Label",
    label: "Label",
    placeholder: "23",
  },
};

export const Filled: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 23,
  },
};
export const Disable: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 1234,
    disabled: true,
  },
};

export const Warning: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 23,
    warnings: ["Warning message"],
  },
};
export const ErrorState: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 23,
    errors: ["Error message"],
  },
};
export const MultiError: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 23,
    errors: [
      "Error message number 1",
      "Error message number 2",
      "Error message number 3",
      "Error message number 4",
    ],
  },
};
export const Description: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 0,
    description: "This is the field description",
  },
};
export const DescriptionDisable: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 0,
    disabled: true,
    description: "This is the field description",
  },
};
export const DescriptionWithWarning: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 0,
    description: "This is the field description",
    warnings: ["Warning message"],
  },
};
export const DescriptionWithErros: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 0,
    description: "This is the field description",
    errors: ["Error message"],
  },
};
export const DescriptionWithMultiError: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 0,
    description: "This is the field description",
    errors: [
      "Error message number 1",
      "Error message number 2",
      "Error message number 3",
      "Error message number 4",
    ],
  },
};
export const Mandatory: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 0,
    required: true,
  },
};
export const MandatoryDisable: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 0,
    required: true,
    disabled: true,
  },
};
export const MandatoryWarning: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 0,
    required: true,
    warnings: ["Warning message"],
  },
};
export const MandatoryWithError: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 0,
    required: true,
    errors: ["Error message"],
  },
};
export const MandatoryWithMultiErros: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 0,
    required: true,
    errors: [
      "Error message number 1",
      "Error message number 2",
      "Error message number 3",
      "Error message number 4",
    ],
  },
};
export const MandatoryWithDescription: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 0,
    required: true,
    description: "This is a description",
  },
};
export const MandatoryWithDescriptionisable: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 0,
    required: true,
    disabled: true,
    description: "This is a description",
  },
};
export const MandatoryWithDescriptionWarnings: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 0,
    required: true,
    description: "This is a description",
    warnings: ["Warning message"],
  },
};
export const MandatoryWithDescriptionErros: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 0,
    required: true,
    description: "This is a description",
    errors: ["Error message"],
  },
};
export const MandatoryWithDescriptionMultiErros: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 0,
    required: true,
    description: "This is a description",
    errors: [
      "Error message number 1",
      "Error message number 2",
      "Error message number 3",
      "Error message number 4",
    ],
  },
};

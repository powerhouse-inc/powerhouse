import type { Meta, StoryObj } from "@storybook/react";
import { NumberField } from "./number-field";
import { withForm } from "@/scalars/lib/decorators";
import { useState } from "react";

const meta = {
  title: "Document Engineering/Simple Components/Number Field",
  component: NumberField,
  parameters: {
    layout: "centered",
  },
  decorators: [withForm],
  tags: ["autodocs"],
  argTypes: {
    name: {
      control: "text",
      description: "Name attribute for the input field",
      table: {
        type: { summary: "string" },
      },
    },
    label: {
      control: "text",
      description: "Label text displayed above the input field",
      table: {
        type: { summary: "string" },
      },
    },
    description: {
      control: "text",
      description: "Helper text displayed below the input field",
      table: {
        type: { summary: "string" },
      },
    },
    value: {
      control: "number",
      description: "Controlled value of the input field",
      table: {
        type: { summary: "number" },
      },
    },
    required: {
      control: "boolean",
      description: "Whether the field is required",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
      },
    },
    disabled: {
      control: "boolean",
      description: "Whether the input field is disabled",
      table: {
        defaultValue: { summary: "false" },
        type: { summary: "boolean" },
      },
    },
    placeholder: {
      control: "text",
      description: "Placeholder text shown when field is empty",
      table: {
        type: { summary: "string" },
      },
    },
    minValue: {
      control: "number",
      description: "Minimum number of characters allowed",
      table: {
        type: { summary: "number" },
      },
    },
    maxValue: {
      control: "number",
      description: "Maximum number of characters allowed",
      table: {
        type: { summary: "number" },
      },
    },
    errors: {
      control: "object",
      description: "Array of error messages to display below the field",
      table: {
        defaultValue: { summary: "[]" },
        type: { summary: "string[]" },
      },
    },
    warnings: {
      control: "object",
      description: "Array of warning messages to display below the field",
      table: { defaultValue: { summary: "[]" }, type: { summary: "string[]" } },
    },
    allowNegative: {
      control: "boolean",
      description: "Allows the input field to accept negative numbers",
      table: { type: { summary: "boolean" } },
    },
    numericType: {
      control: "text",
      description:
        "Specifies the numeric type of the input field. Possible values are:\n\n\n" +
        "- PositiveInt: Positive whole numbers (e.g., 1, 2, 3)\n\n" +
        "- NegativeInt: Negative whole numbers (e.g., -1, -2, -3)\n\n" +
        "- NonNegativeInt: Zero and positive whole numbers (e.g., 0, 2)\n\n" +
        "- NonPositiveInt: Zero and negative whole numbers (e.g., 0, -2)\n\n" +
        "- PositiveFloat: Positive decimals (e.g., 1.0, 2.5)\n\n" +
        "- NegativeFloat: Negative decimals (e.g., -1.0, -2.5)\n\n" +
        "- NonNegativeFloat: Zero and positive decimals (e.g., 0.0, 1.0)\n\n" +
        "- NonPositiveFloat: Zero and negative decimals (e.g., 0.0, -1.0)\n\n" +
        "- BigInt: Large integers (e.g., 9999999999999999999)\n\n",
      table: {
        type: {
          summary:
            '"PositiveInt" | "NegativeInt" | "NonNegativeInt" | "NonPositiveInt" | "PositiveFloat" | "NegativeFloat" | "NonNegativeFloat" | "NonPositiveFloat" | "BigInt"',
        },
      },
    },
    step: {
      control: "number",
      description: "Step value for the input field",
      table: { type: { summary: "number" } },
    },
    precision: {
      control: "number",
      description: "Number of decimal places allowedd",
      table: { type: { summary: "number" } },
    },
    trailingZeros: {
      control: "boolean",
      description:
        "When precision is set, for example to 2, determines if the the trailing zeros should be preserved ( for example: 25.00,7.50, etc.) or not ( for example: 25, 7.5).",
      table: { type: { summary: "boolean" } },
    },
    decimalRequired: {
      control: "boolean",
      description: "Whether a decimal point is required.",
      table: { type: { summary: "boolean" } },
    },
  },
  args: {
    name: "number-field",
    errors: [],
    warnings: [],
  },
} satisfies Meta<typeof NumberField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: "Label",
    label: "Label",
    placeholder: "0",
  },
};
export const DefaultActive: Story = {
  args: {
    name: "Label",
    label: "Label",
    autoFocus: true,
  },
};
DefaultActive.parameters = {
  pseudo: {
    active: true,
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

// Float Stories
export const FloatNumber: Story = {
  args: {
    label: "Label",
    name: "Label",
    // Allow trailing zeros after the decimal point for clarity in displaying fractional values.
    // eslint-disable-next-line prettier/prettier
    value: 0.00,
    precision: 2,
    trailingZeros: true,
  },
  render: (args) => {
    const [value, setValue] = useState(args.value || 0);

    return (
      <NumberField
        {...args}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
      />
    );
  },
};
// BigInt Stories
export const IsBigInt: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: "9999999999999999999",
    isBigInt: true,
  },
};

// Step Stories
export const Setp: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 0,
    step: 10,
    minValue: 20,
  },
  render: (args) => {
    const [value, setValue] = useState(args.value || 0);

    return (
      <NumberField
        {...args}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
      />
    );
  },
};

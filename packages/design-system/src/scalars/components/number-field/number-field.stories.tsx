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
    numericType: {
      control: "text",
      description:
        "Specifies the numeric type of the input field. Possible values are: PositiveInt (Positive integers), NegativeInt (Negative integers), NonNegativeInt (Non-negative integers, greater than or equal to 0), NonPositiveInt (Non-positive integers, less than or equal to 0), NegativeFloat (Negative float values), PositiveFloat (Positive float values), NonNegativeFloat (Non-negative float values, greater than or equal to 0.0), NonPositiveFloat (Non-positive float values, less than or equal to 0.0).",
    },
    step: {
      control: "number",
      description: "Step value for the input field",
    },
    precision: {
      control: "number",
      description: "Number of decimal places allowedd",
    },
    trailingZeros: {
      control: "boolean",
      description:
        "When precision is set, for example to 2, determines if the the trailing zeros should be preserved ( for example: 25.00,7.50, etc.) or not ( for example: 25, 7.5).",
    },
    decimalRequired: {
      control: "boolean",
      description: "Whether a decimal point is required.",
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
    value: 0,
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
export const Fraction: Story = {
  args: {
    label: "Label",
    name: "Label",
    // Allow trailing zeros after the decimal point for clarity in displaying fractional values.
    // eslint-disable-next-line prettier/prettier
    value: 0.00,
    precision: 2,
    trailingZeros: true,
    step: 0.04,
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

export const FractionFilled: Story = {
  args: {
    label: "Label",
    name: "Label",
    value: 138.2,
    precision: 1,
  },
};

export const FractionDisable: Story = {
  args: {
    label: "Label",
    name: "Label",
    // Allow trailing zeros after the decimal point for clarity in displaying fractional values.
    // eslint-disable-next-line prettier/prettier
    value: 0.00,
    disabled: true,
    precision: 2,
  },
};

export const FractionWithWarning: Story = {
  args: {
    label: "Label",
    name: "Label",
    // Allow trailing zeros after the decimal point for clarity in displaying fractional values.
    // eslint-disable-next-line prettier/prettier
    value: 0.00,
    trailingZeros: true,
    precision: 2,
    warnings: ["Warning message"],
  },
};
export const FractionWithError: Story = {
  args: {
    label: "Label",
    name: "Label",
    value: 140,
    errors: ["Error message"],
  },
};

export const FractionMultiErrors: Story = {
  args: {
    label: "Label",
    name: "Label",
    value: 140,
    errors: [
      "Error message number 1",
      "Error message number 2",
      "Error message number 3",
      "Error message number 4",
    ],
  },
};
export const FractionDescription: Story = {
  args: {
    label: "Label",
    name: "Label",
    description: "This is the field description",
    value: 140,
  },
};
export const FractionDescriptionFilled: Story = {
  args: {
    label: "Label",
    name: "Label",
    description: "This is the field description",
    value: 138,
  },
};
export const FractionDescriptionDisable: Story = {
  args: {
    label: "Label",
    name: "Label",
    description: "This is the field description",
    value: 0,
    disabled: true,
  },
};
export const FractionDescriptionWarning: Story = {
  args: {
    label: "Label",
    name: "Label",
    description: "This is the field description",
    value: 0,
    warnings: ["Warning message"],
  },
};
export const FractionDescriptionError: Story = {
  args: {
    label: "Label",
    name: "Label",
    description: "This is the field description",
    value: 0,
    errors: ["Error message"],
  },
};
export const FractionDescriptionMultiErrors: Story = {
  args: {
    label: "Label",
    name: "Label",
    value: 140,
    errors: [
      "Error message number 1",
      "Error message number 2",
      "Error message number 3",
      "Error message number 4",
    ],
  },
};

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
    min: 20,
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

export const SetpFilled: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 23,
    step: 10,
  },
};
export const SetpDisable: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 1234,
    disabled: true,
    step: 10,
  },
};

export const SetpWarning: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 23,
    warnings: ["Warning message"],
  },
};
export const SetpErrorState: Story = {
  args: {
    name: "Label",
    label: "Label",
    value: 23,
    step: 10,
    errors: ["Error message"],
  },
};
export const SetpMultiError: Story = {
  args: {
    name: "Label",
    label: "Label",
    step: 10,
    value: 23,
    errors: [
      "Error message number 1",
      "Error message number 2",
      "Error message number 3",
      "Error message number 4",
    ],
  },
};

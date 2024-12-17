import type { ArgTypes } from "@storybook/react";
import type { Control } from "@storybook/blocks";

export enum StorybookControlCategory {
  DEFAULT = "Default",
  COMPONENT_SPECIFIC = "Component-specific",
  VALIDATION = "Validation",
}

export const PrebuiltArgTypes = {
  // default
  id: {
    id: {
      control: "text",
      description: "Unique identifier for the component",
      table: {
        type: { summary: "string" },
        defaultValue: { summary: "auto-generated" },
        category: StorybookControlCategory.DEFAULT,
      },
    },
  },
  name: {
    name: {
      control: "text",
      description: "Name attribute for the component",
      table: {
        type: { summary: "string" },
        category: StorybookControlCategory.DEFAULT,
        readonly: true,
      },
    },
  },
  label: {
    label: {
      control: "text",
      description: "Sets the visible label text for the input field",
      table: {
        type: { summary: "string" },
        category: StorybookControlCategory.DEFAULT,
      },
    },
  },
  description: {
    description: {
      control: "text",
      description: "Helper text displayed below the input field",
      table: {
        type: { summary: "string" },
        category: StorybookControlCategory.DEFAULT,
      },
    },
  },
  disabled: {
    disabled: {
      control: "boolean",
      description: "Whether the component is disabled",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: StorybookControlCategory.DEFAULT,
      },
    },
  },
  className: {
    className: {
      control: "text",
      description: "Additional CSS classes to apply to the component",
      table: {
        type: { summary: "string" },
        category: StorybookControlCategory.DEFAULT,
      },
    },
  },
  placeholder: {
    placeholder: {
      control: "text",
      description: "Placeholder text shown when field is empty",
      table: {
        type: { summary: "string" },
        category: StorybookControlCategory.DEFAULT,
      },
    },
  },
  autoComplete: {
    autoComplete: {
      control: "boolean",
      description: "HTML autocomplete attribute value",
      table: {
        type: { summary: "boolean" },
        category: StorybookControlCategory.DEFAULT,
      },
    },
  },
  spellCheck: {
    spellCheck: {
      control: "boolean",
      description: "Whether to enable browser spell checking",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: StorybookControlCategory.DEFAULT,
      },
    },
  },

  // validation
  validators: {
    validators: {
      control: "object",
      description: "Custom validator function",
      table: {
        type: { summary: "function | function[]" },
        category: StorybookControlCategory.VALIDATION,
        readonly: true,
      },
    },
  },
  showErrorOnBlur: {
    showErrorOnBlur: {
      control: "boolean",
      description: "Whether to validate the field on blur",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: StorybookControlCategory.VALIDATION,
      },
    },
  },
  showErrorOnChange: {
    showErrorOnChange: {
      control: "boolean",
      description: "Whether to validate the field on change",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: StorybookControlCategory.VALIDATION,
      },
    },
  },
  required: {
    required: {
      control: "boolean",
      description: "Whether the field is required",
      table: {
        type: { summary: "boolean" },
        category: StorybookControlCategory.VALIDATION,
      },
    },
  },
  errors: {
    errors: {
      control: "object",
      description:
        "Array of custom error messages. These errors are going to be added to the internal validation errors if there's any.",
      table: {
        type: { summary: "string[]" },
        category: StorybookControlCategory.VALIDATION,
      },
    },
  },
  warnings: {
    warnings: {
      control: "object",
      description: "Array of custom warning messages",
      table: {
        type: { summary: "string[]" },
        category: StorybookControlCategory.VALIDATION,
      },
    },
  },
  minLength: {
    minLength: {
      control: "number",
      description: "Minimum number of characters allowed",
      table: {
        type: { summary: "number" },
        category: StorybookControlCategory.VALIDATION,
      },
    },
  },
  maxLength: {
    maxLength: {
      control: "number",
      description: "Maximum number of characters allowed",
      table: {
        type: { summary: "number" },
        category: StorybookControlCategory.VALIDATION,
      },
    },
  },
  minValue: {
    minValue: {
      control: "number",
      description: "Minimum number allowed",
      table: {
        type: { summary: "number" },
        category: StorybookControlCategory.VALIDATION,
      },
    },
  },
  maxValue: {
    maxValue: {
      control: "number",
      description: "Maximum number allowed",
      table: {
        type: { summary: "number" },
        category: StorybookControlCategory.VALIDATION,
      },
    },
  },
  pattern: {
    pattern: {
      control: "text",
      description: "Regular expression pattern to validate input",
      table: {
        type: { summary: "string" },
        category: StorybookControlCategory.VALIDATION,
      },
    },
  },

  // component-specific
  trim: {
    trim: {
      control: "boolean",
      description: "Whether to trim whitespace from input",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
  },
  uppercase: {
    uppercase: {
      control: "boolean",
      description: "Whether to transform input to uppercase",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
  },
  lowercase: {
    lowercase: {
      control: "boolean",
      description: "Whether to transform input to lowercase",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
  },
  //Improve this to hidden this props base in the numericType
  allowNegative: {
    allowNegative: {
      control: "boolean",
      description: "Allows the input field to accept negative numbers",
      table: {
        type: { summary: "boolean" },
        category: StorybookControlCategory.VALIDATION,
      },
    },
  },
  precision: {
    precision: {
      control: "number",
      description: "Number of decimal places allowedd",
      table: {
        type: { summary: "number" },
        category: StorybookControlCategory.VALIDATION,
      },
    },
  },
  trailingZeros: {
    trailingZeros: {
      control: "boolean",
      description:
        "When precision is set, for example to 2, determines if the the trailing zeros should be preserved ( for example: 25.00,7.50, etc.) or not ( for example: 25, 7.5).",
      table: {
        type: { summary: "boolean" },
        category: StorybookControlCategory.VALIDATION,
      },
    },
  },
} satisfies Record<string, ArgTypes>;

export interface DefaultArgTypesOptions {
  enabledArgTypes?: {
    id?: boolean;
    name?: boolean;
    label?: boolean;
    description?: boolean;
    value?: boolean;
    defaultValue?: boolean;
    disabled?: boolean;
    className?: boolean;
  };
  valueControlType?: Control;
  valueType?: string;
}

export function getDefaultArgTypes(
  options: DefaultArgTypesOptions = {
    enabledArgTypes: {},
    valueControlType: "text",
    valueType: "string",
  },
): ArgTypes {
  const argTypes = options.enabledArgTypes ?? {};
  const valueControlType = options.valueControlType ?? "text";
  const valueType = options.valueType ?? "string";

  return {
    ...(argTypes.id !== false && PrebuiltArgTypes.id),
    ...(argTypes.name !== false && PrebuiltArgTypes.name),
    ...(argTypes.label !== false && PrebuiltArgTypes.label),
    ...(argTypes.description !== false && PrebuiltArgTypes.description),
    ...(argTypes.value !== false && {
      value: {
        control: valueControlType,
        description: "Current value of the input field",
        table: {
          type: { summary: valueType },
          category: StorybookControlCategory.DEFAULT,
        },
      },
    }),
    ...(argTypes.defaultValue !== false && {
      defaultValue: {
        control: valueControlType,
        description: "Default value for the input field",
        table: {
          type: { summary: valueType },
          category: StorybookControlCategory.DEFAULT,
        },
      },
    }),
    ...(argTypes.disabled !== false && PrebuiltArgTypes.disabled),
    ...(argTypes.className !== false && PrebuiltArgTypes.className),
  } satisfies ArgTypes;
}

export interface ValidationArgTypesOptions {
  enabledArgTypes?: {
    validators?: boolean;
    showErrorOnBlur?: boolean;
    showErrorOnChange?: boolean;
    required?: boolean;
    errors?: boolean;
    warnings?: boolean;
  };
}

export function getValidationArgTypes(
  options: ValidationArgTypesOptions = {
    enabledArgTypes: {},
  },
): ArgTypes {
  const argTypes = options.enabledArgTypes ?? {};

  return {
    ...(argTypes.validators !== false && PrebuiltArgTypes.validators),
    ...(argTypes.showErrorOnBlur !== false && PrebuiltArgTypes.showErrorOnBlur),
    ...(argTypes.showErrorOnChange !== false &&
      PrebuiltArgTypes.showErrorOnChange),
    ...(argTypes.required !== false && PrebuiltArgTypes.required),
    ...(argTypes.errors !== false && PrebuiltArgTypes.errors),
    ...(argTypes.warnings !== false && PrebuiltArgTypes.warnings),
  } satisfies ArgTypes;
}

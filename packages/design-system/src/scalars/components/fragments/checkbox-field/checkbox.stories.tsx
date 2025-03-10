/* eslint-disable react-hooks/rules-of-hooks */
import { type Meta, type StoryObj } from "@storybook/react";
import { CheckboxField } from "./checkbox-field";
import { withForm } from "@/scalars/lib/decorators";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
} from "@/scalars/lib/storybook-arg-types";
import { useState } from "react";

const meta: Meta<typeof CheckboxField> = {
  component: CheckboxField,
  title: "Document Engineering/Fragments/Checkbox Field",
  tags: ["autodocs"],
  decorators: [withForm],
  parameters: {
    chromatic: {
      disableSnapshot: true,
    },
  },
  argTypes: {
    ...getDefaultArgTypes({
      valueControlType: "boolean",
      valueType: "boolean",
    }),

    ...getValidationArgTypes({
      enabledArgTypes: {
        validators: false,
        showErrorOnBlur: false,
        showErrorOnChange: false,
      },
    }),
  },
  args: {
    errors: [],
    warnings: [],
    name: "checkbox",
  },
};

export default meta;

type Story = StoryObj<typeof CheckboxField>;

export const Default: Story = {
  args: {
    value: false,
    disabled: false,
    label: "Default Checkbox",
  },
};

export const Checked: Story = {
  args: {
    value: true,
    label: "Checked Checkbox",
  },
};

export const Indeterminate: Story = {
  args: {
    value: "indeterminate",
    label: "Indeterminate Checkbox",
  },
};

export const Disabled: Story = {
  args: {
    value: false,
    disabled: true,
    label: "Disabled Checkbox",
  },
};

export const CheckedAndDisabled: Story = {
  args: {
    value: true,
    disabled: true,
    label: "Checked and Disabled Checkbox",
  },
};

export const Required: Story = {
  args: {
    value: false,
    required: true,
    label: "Required Checkbox",
  },
};

export const WithDescription: Story = {
  args: {
    value: false,
    description: "This is a description",
    label: "Checkbox with description",
  },
};

export const RequiredWithDescription: Story = {
  args: {
    value: false,
    description: "This is a description",
    label: "Required Checkbox with description",
    required: true,
  },
};

export const WithCustomLabel: Story = {
  args: {
    value: false,
    label: (
      <span>
        I agree to the{" "}
        <a
          className="underline"
          href="https://google.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          terms of service
        </a>
      </span>
    ),
  },
};

export const WithErrors: Story = {
  args: {
    value: false,
    label: "Checkbox with Errors",
    errors: ["This field is required", "Another error"],
  },
};

export const WithWarningsAndErrors: Story = {
  args: {
    value: false,
    label: "Checkbox with Warnings and Errors",
    warnings: ["This is a warning", "Another warning"],
    errors: ["This is an error", "Another error"],
  },
};

export const WithCircularThreeStates: Story = {
  args: {
    value: "indeterminate",
    label: "Circular Three States Checkbox",
  },
  parameters: {
    docs: {
      source: {
        type: "code",
        format: true,
        code: `
        const [state, setState] = useState("indeterminate");

        const handleChange = () => {
          // rotate between true, false and indeterminate
          const nextState = state === true ? false : state === "indeterminate" ? false : true;
          setState(nextState);

          // return the new value to ensure the form internal state is updated
          // and kept in sync with the controlled component state
          return nextState;
        };

        return (
          <CheckboxField label="Checkbox" value={state} onChange={handleChange} />
        );
        `,
      },
    },
  },
  render: ({ value, defaultValue, ...args }) => {
    const [state, setState] = useState(
      value ?? defaultValue ?? "indeterminate",
    );

    const handleChange = () => {
      const nextState =
        state === true
          ? "indeterminate"
          : state === "indeterminate"
            ? false
            : true;
      setState(nextState);
      return nextState;
    };

    return (
      <div>
        <p className="mb-5 text-sm text-gray-500">
          This checkbox rotate its state between true, false and indeterminate
          when it is clicked. To archive this behavior, the field need to be
          controlled.
        </p>

        <CheckboxField {...args} value={state} onChange={handleChange} />
      </div>
    );
  },
};

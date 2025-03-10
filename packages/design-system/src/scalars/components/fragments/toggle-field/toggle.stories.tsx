import { getDefaultArgTypes, getValidationArgTypes, withForm } from "#scalars";
import type { Meta, StoryObj } from "@storybook/react";
import { ToggleField } from "./toggle-field";

const meta: Meta<typeof ToggleField> = {
  title: "Document Engineering/Fragments/Toggle Field",
  tags: ["autodocs"],
  component: ToggleField,
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
    name: "toggle",
    errors: [],
    warnings: [],
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const DefaultChecked: Story = {
  args: {
    value: true,
  },
};

export const Unchecked: Story = {
  name: "Unchecked",
  args: {
    value: false,
  },
};

export const CheckedWithLabel: Story = {
  name: "Checked with label",
  args: {
    value: true,
    label: "Active",
  },
};

export const UncheckedWithLabel: Story = {
  name: "Unchecked with label",
  args: {
    value: false,
    label: "Active",
  },
};

export const DisabledChecked: Story = {
  name: "Disabled checked",
  args: {
    value: true,
    disabled: true,
  },
};

export const DisabledUncheckedWithoutLabel: Story = {
  name: "Disabled unchecked",
  args: {
    value: false,
    disabled: true,
  },
};

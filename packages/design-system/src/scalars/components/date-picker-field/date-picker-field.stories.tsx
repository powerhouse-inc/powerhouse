import type { Meta, StoryObj } from "@storybook/react";
import { withForm } from "@/scalars/lib/decorators";
import { DatePickerField } from "./date-picker-field";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
} from "@/scalars/lib/storybook-arg-types";

const meta: Meta<typeof DatePickerField> = {
  title: "Document Engineering/Simple Components/Date Picker Field",
  component: DatePickerField,
  parameters: {
    layout: "centered",
  },
  decorators: [withForm],
  tags: ["autodocs"],
  argTypes: {
    ...getDefaultArgTypes({
      valueControlType: "date",
      valueType: "date",
    }),
    ...getValidationArgTypes(),
  },
  args: {
    name: "date-picker-field",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: "date",
    label: "Pick a date",
    placeholder: "2025/01/27",
  },
};

export const Disabled: Story = {
  args: {
    name: "date",
    label: "Pick a date",
    placeholder: "2025/01/27",
    disabled: true,
  },
};

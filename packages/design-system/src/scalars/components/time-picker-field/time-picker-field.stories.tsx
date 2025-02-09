import type { Meta, StoryObj } from "@storybook/react";
import { withForm } from "@/scalars/lib/decorators";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
} from "@/scalars/lib/storybook-arg-types";
import TimePickerField from "./time-picker-field";

const meta: Meta<typeof TimePickerField> = {
  title: "Document Engineering/Simple Components/Time Picker Field",
  component: TimePickerField,
  parameters: {
    layout: "centered",
  },
  decorators: [withForm],
  tags: ["autodocs"],
  argTypes: {
    ...getDefaultArgTypes({
      valueControlType: "time",
      valueType: "time",
    }),
    ...getValidationArgTypes(),
  },

  args: {
    name: "time-picker-field",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: "time",
    label: "Pick a time",
    placeholder: "12:59 PM",
  },
};
export const Disabled: Story = {
  args: {
    name: "date",
    label: "Pick a date",
    placeholder: "12:59 PM",
    disabled: true,
  },
};

import {
  getDefaultArgTypes,
  getValidationArgTypes,
  StorybookControlCategory,
  withForm,
} from "#scalars";
import type { Meta, StoryObj } from "@storybook/react";
import { TimePickerField } from "./time-picker-field.js";

const meta: Meta<typeof TimePickerField> = {
  title: "Document Engineering/Fragments/Time Picker Field",
  component: TimePickerField,
  parameters: {
    layout: "centered",
  },
  decorators: [withForm],
  tags: ["autodocs"],
  argTypes: {
    ...getDefaultArgTypes(),
    ...getValidationArgTypes(),
    timeFormat: {
      control: {
        type: "select",
      },

      options: ["hh:mm a", "HH:mm"],
      defaultValue: { summary: "hh:mm a" },
    },
    showTimezoneSelect: {
      control: {
        type: "boolean",
        description: "Show timezone select",
        defaultValue: false,
        table: {
          category: StorybookControlCategory.COMPONENT_SPECIFIC,
        },
      },
      defaultValue: { summary: false },
    },
    dateIntervals: {
      control: {
        description: "The interval between each time option",
        type: "number",
        min: 1,
        max: 60,
        table: {
          category: StorybookControlCategory.COMPONENT_SPECIFIC,
        },
      },
      defaultValue: { summary: 1 },
    },
    timeZone: {
      control: {
        type: "text",
        description: "The timezone to display in the time picker",
        table: {
          category: StorybookControlCategory.COMPONENT_SPECIFIC,
        },
      },
    },
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
    placeholder: "HH:mm",
  },
};
export const Disabled: Story = {
  args: {
    name: "time",
    label: "Pick a time",
    placeholder: "HH:mm",
    disabled: true,
  },
};

export const Filled: Story = {
  args: {
    name: "time",
    label: "Pick a time",
    value: "12:00 PM",
    placeholder: "HH:mm",
  },
};

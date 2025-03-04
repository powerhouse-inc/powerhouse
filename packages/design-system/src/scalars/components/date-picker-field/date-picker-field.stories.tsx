import type { Meta, StoryObj } from "@storybook/react";
import { withTimestampsAsISOStrings, withForm } from "@/scalars/lib/decorators";
import { DatePickerField } from "./date-picker-field";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
  StorybookControlCategory,
} from "@/scalars/lib/storybook-arg-types";

const meta: Meta<typeof DatePickerField> = {
  title: "Document Engineering/Fragments/Date Picker Field",
  component: DatePickerField,
  parameters: {
    layout: "centered",
    form: {
      resetBehavior: "unmount",
    },
  },
  decorators: [withForm, withTimestampsAsISOStrings],
  tags: ["autodocs"],
  argTypes: {
    ...getDefaultArgTypes({
      valueControlType: "date",
      valueType: "date",
    }),
    ...getValidationArgTypes(),
    minDate: {
      control: "date",
      description: "Minimum selectable date in the date picker",
      table: {
        type: { summary: "string" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    maxDate: {
      control: "date",
      description: "Maximum selectable date in the date picker",
      table: {
        type: { summary: "string" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    disablePastDates: {
      control: "boolean",
      description: "Disable past dates in the date picker",
      table: {
        type: { summary: "boolean" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    disableFutureDates: {
      control: "boolean",
      description: "Disable future dates in the date picker",
      table: {
        type: { summary: "boolean" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    dateFormat: {
      control: {
        type: "select",
      },
      options: [
        "yyyy-MM-dd",
        "dd/MM/yyyy",
        "MM/dd/yyyy",
        "dd-MMM-yyyy",
        "MMM-dd-yyyy",
      ],
      table: {
        defaultValue: { summary: "yyyy-MM-dd" },
        type: {
          summary: "string",
        },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    weekStart: {
      control: "select",
      options: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ],
      table: {
        defaultValue: { summary: "Monday" },
        type: {
          summary: "string",
        },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    autoClose: {
      control: "boolean",
      description: "Close the date picker when a date is selected",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
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

export const Filled: Story = {
  args: {
    name: "date",
    label: "Pick a date",
    value: "2025/01/27",
  },
};

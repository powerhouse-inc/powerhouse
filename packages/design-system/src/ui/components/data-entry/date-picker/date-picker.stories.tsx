import type { Meta, StoryObj } from "@storybook/react";
import { withTimestampsAsISOStrings } from "../../../../scalars/index.js";
import {
  getDefaultArgTypes,
  StorybookControlCategory,
} from "../../../../scalars/lib/storybook-arg-types.js";
import { FORMAT_MAPPING } from "../date-time-picker/utils.js";
import { DatePicker } from "./date-picker.js";

/**
 * The `DatePicker` component provides an input field for selecting dates.
 * It supports multiple configuration properties like:
 * - label
 * - description
 * - minDate
 * - maxDate
 * - dateFormat
 * - weekStart
 * - autoClose
 *
 * Features include:
 * - Customizable date format
 * - Min/Max date restrictions
 * - Past/Future date restrictions
 * - Configurable week start day
 * - Auto-close functionality
 * - Custom placeholder support
 *
 * > **Note:** This component does not have built-in validation. If you need built-in validation
 * > you can use the [DatePicker](?path=/docs/document-engineering-scalars-date-field--readme)
 * > component.
 */
const meta: Meta<typeof DatePicker> = {
  title: "Document Engineering/Data Entry/Date Picker",
  component: DatePicker,
  parameters: {
    layout: "centered",
    form: {
      resetBehavior: "unmount",
    },
  },
  decorators: [withTimestampsAsISOStrings],
  tags: ["autodocs"],
  argTypes: {
    ...getDefaultArgTypes({
      valueControlType: "date",
      valueType: "date",
    }),
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
      description: "The format of the date in the date picker",
      options: Object.keys(FORMAT_MAPPING),
      table: {
        defaultValue: { summary: "YYYY-MM-DD" },
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
    placeholder: {
      control: "text",
      description: "The placeholder text for the date picker",
      table: {
        type: { summary: "string" },
        category: StorybookControlCategory.DEFAULT,
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

import type { Meta, StoryObj } from "@storybook/react";
import { withTimestampsAsISOStrings } from "../../../../scalars/lib/decorators";
import {
  getDefaultArgTypes,
  StorybookControlCategory,
} from "../../../../scalars/lib/storybook-arg-types";
import { DateTimePicker } from "./date-time-picker.js";
import { FORMAT_MAPPING } from "./utils.js";

/**
 * The `DateTimePicker` component provides an input field for selecting both dates and times.
 * It supports multiple configuration properties like:
 * - label
 * - description
 * - minDate
 * - maxDate
 * - dateFormat
 * - timeFormat
 * - weekStart
 * - timeZone
 * - timeIntervals
 *
 * Features include:
 * - Date and time selection in a single component
 * - Customizable date and time formats
 * - Min/Max date restrictions
 * - Past/Future date restrictions
 * - Configurable week start day
 * - Time zone support
 * - Adjustable time intervals
 * - Auto-close functionality
 * - Custom placeholder support
 *
 * > **Note:** This component does not have built-in validation. If you need built-in validation
 * > you can use the [DateTimePickerField](?path=/docs/document-engineering-scalars-datetimepickerfield--readme)
 * > component.
 */

const meta: Meta<typeof DateTimePicker> = {
  title: "Document Engineering/Data Entry/Date Time Picker",
  component: DateTimePicker,
  tags: ["autodocs"],
  decorators: [withTimestampsAsISOStrings],
  argTypes: {
    ...getDefaultArgTypes({
      enabledArgTypes: {
        value: true,
      },
    }),

    minDate: {
      control: "date",
      description: "Minimum selectable date in the date picker",
      table: {
        type: { summary: "date" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    maxDate: {
      control: "date",
      description: "Maximum selectable date in the date picker",
      table: {
        type: { summary: "date" },
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
      description: "The first day of the week in the date picker",
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
    // Time picker props
    timeFormat: {
      control: {
        type: "select",
      },
      description: "The format of the time in the time picker",
      table: {
        defaultValue: { summary: "hh:mm a" },
        type: {
          summary: "string",
        },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },

      options: ["hh:mm a", "HH:mm"],
      defaultValue: { summary: "hh:mm a" },
    },
    showTimezoneSelect: {
      control: {
        type: "boolean",
      },
      description: "Show timezone select",
      table: {
        type: { summary: "boolean" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    timeZone: {
      control: {
        type: "text",
      },
      description: "The timezone to display in the time picker",

      table: {
        type: { summary: "string" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    timeIntervals: {
      description: "The interval between each time option",
      control: {
        type: "number",
      },

      type: "number",
      min: 1,
      max: 60,
      table: {
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },

      defaultValue: { summary: 1 },
    },

    includeContinent: {
      control: "boolean",
      description: "Show continent name in the timezone select",
      table: {
        type: { summary: "boolean" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    placeholder: {
      control: "text",
      description: "The placeholder text for the date time picker",
      table: {
        type: { summary: "string" },
        category: StorybookControlCategory.DEFAULT,
      },
    },
  },

  args: {
    name: "date-time-picker",
  },
  parameters: {
    layout: "centered",
    form: {
      resetBehavior: "unmount",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: "date-time-picker",
    label: "Date Time Picker Field",
    description: "This is a date time picker field",
    placeholder: "2025/01/27 12:00",
    onChange: () => {},
  },
};

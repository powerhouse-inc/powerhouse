import type { Meta, StoryObj } from "@storybook/react";
import { withForm } from "@/scalars/lib/decorators";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
  StorybookControlCategory,
} from "@/scalars/lib/storybook-arg-types";
import { DateTimeField } from "./date-time-field";
import { FORMAT_MAPPING } from "./utils";

const meta: Meta<typeof DateTimeField> = {
  title: "Document Engineering/Simple Components/Date Time Field",
  component: DateTimeField,
  decorators: [withForm],
  tags: ["autodocs"],
  argTypes: {
    ...getDefaultArgTypes({
      enabledArgTypes: {
        value: true,
      },
    }),
    ...getValidationArgTypes({}),
    showDateSelect: {
      control: "boolean",
      description: "Show the date picker",
      table: {
        type: { summary: "boolean" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    showTimeSelect: {
      control: "boolean",
      description: "Show the time picker",
      table: {
        type: { summary: "boolean" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    minDate: {
      control: "date",
      description: "Minimum selectable date in the date picker",
      table: {
        type: { summary: "date" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
      if: { arg: "showDateSelect", truthy: true },
    },
    maxDate: {
      control: "date",
      description: "Maximum selectable date in the date picker",
      table: {
        type: { summary: "date" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
      if: { arg: "showDateSelect", truthy: true },
    },
    disablePastDates: {
      control: "boolean",
      description: "Disable past dates in the date picker",
      table: {
        type: { summary: "boolean" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
      if: { arg: "showDateSelect", truthy: true },
    },
    disableFutureDates: {
      control: "boolean",
      description: "Disable future dates in the date picker",
      table: {
        type: { summary: "boolean" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
      if: { arg: "showDateSelect", truthy: true },
    },
    dateFormat: {
      control: {
        type: "select",
      },
      options: Object.keys(FORMAT_MAPPING),
      table: {
        defaultValue: { summary: "yyyy-MM-dd" },
        type: {
          summary: "string",
        },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
      if: { arg: "showDateSelect", truthy: true },
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
      if: { arg: "showDateSelect", truthy: true },
    },
    autoClose: {
      control: "boolean",
      description: "Close the date picker when a date is selected",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
      if: { arg: "showDateSelect", truthy: true },
    },
    // Time picker props
    timeFormat: {
      control: {
        type: "select",
      },
      table: {
        defaultValue: { summary: "hh:mm a" },
        type: {
          summary: "string",
        },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
      if: { arg: "showTimeSelect", truthy: true },
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
      if: { arg: "showTimeSelect", truthy: true },
      defaultValue: { summary: false },
    },
    timeZone: {
      control: "text",
      description: "Timezone",
      if: { arg: "showTimeSelect", truthy: true },
      table: {
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    timeIntervals: {
      control: "number",
      description: "Date intervals",
      if: { arg: "showTimeSelect", truthy: true },
      table: {
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    includeContinent: {
      control: {
        type: "boolean",
        description: "Show continent name in the timezone select",
        defaultValue: false,
      },
      if: { arg: "showTimeSelect", truthy: true },
      table: {
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
  },

  args: {
    name: "date-picker-field",
  },
  parameters: {
    layout: "centered",
    form: {
      resetBehavior: "unmount",
    },
    docs: {
      description: {
        component:
          "A DateTimeField component that can be used as a [DatePicker](?path=/docs/document-engineering-fragments-date-picker-field--readme) or [TimePicker](?path=/docs/document-engineering-fragments-time-picker-field--readme) depending on the `showDateSelect` and `showTimeSelect` props.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const DateTimePicker: Story = {
  args: {
    label: "Date Time Picker Field",
    description: "This is a date time picker field",
    showDateSelect: true,
    showTimeSelect: true,
    placeholder: "2025/01/27 12:00",
  },
};

import type { Meta, StoryObj } from "@storybook/react";
import { getDefaultArgTypes, StorybookControlCategory } from "../../../../scalars/lib/storybook-arg-types.js";
import { TimePicker } from "./time-picker";

/**
 * The `TimePicker` component provides an input field for selecting times.
 * It supports multiple configuration properties like:
 * - label
 * - description
 * - timeFormat
 * - timeIntervals
 * - timeZone
 * - showTimezoneSelect
 * 
 * Features include:
 * - Customizable time format (12/24 hour)
 * - Configurable time intervals
 * - Timezone selection support
 * - Custom placeholder support
 *
 * > **Note:** This component does not have built-in validation. If you need built-in validation
 * > you can use the [TimePicker](?path=/docs/document-engineering-scalars-timepickerfield--readme)
 * > component.
 */

const meta: Meta<typeof TimePicker> = {
  title: "Document Engineering/Data Entry/Time Picker",
  component: TimePicker,
  parameters: {
    layout: "centered",
    form: {
      resetBehavior: "unmount",
    },
  },
  tags: ["autodocs"],
  argTypes: {
    ...getDefaultArgTypes(),
    timeFormat: {
      control: {
        type: "select",
      },
      description: "The format of the time in the time picker",
      table: {
        type: { summary: "string" },
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
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
        type: { summary: "boolean" },
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
    timeZone: {
      description: "The timezone to display in the time picker",
      control: {
        type: "text",
      },
      table: {
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
        type: { summary: "string" },
      },
    },
    includeContinent: {
      description: "Show continent name in the timezone select",
      control: {
        type: "boolean",
        defaultValue: false,
      },
      table: {
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
        defaultValue: { summary: "false " },
        type: { summary: "boolean" },
      },
    },
    placeholder: {
      description: "The placeholder text for the time picker",
      table: {
        category: StorybookControlCategory.DEFAULT,
        type: { summary: "string" },
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

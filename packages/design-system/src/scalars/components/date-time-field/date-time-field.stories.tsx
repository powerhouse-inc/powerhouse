import type { Meta, StoryObj } from "@storybook/react";
import { withForm } from "@/scalars/lib/decorators";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
  PrebuiltArgTypes,
  StorybookControlCategory,
} from "@/scalars/lib/storybook-arg-types";
import { DateTimeField } from "./date-time-field";

const meta: Meta<typeof DateTimeField> = {
  title: "Document Engineering/Simple Components/DateTimeField",
  component: DateTimeField,
  decorators: [withForm],
  tags: ["autodocs"],
  argTypes: {
    ...getDefaultArgTypes({
      valueControlType: "date",
      valueType: "date",
    }),
    ...getValidationArgTypes(),
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
    dateProps: {
      control: "object",
      description: "Date picker props",
      table: {
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    timeProps: {
      control: "object",
      description: "Time picker props",
      table: {
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
  },

  ...PrebuiltArgTypes.placeholder,

  args: {
    name: "date-picker-field",
  },
  parameters: {
    layout: "centered",
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

export const DatePicker: Story = {
  args: {
    label: "DatePicker Field",
    description: "This is a date picker field",
    showDateSelect: true,
    showTimeSelect: false,
  },
};

export const TimePicker: Story = {
  args: {
    label: "TimePicker Field",
    description: "This is a time picker field",
    placeholder: "12:00 AM",
    showDateSelect: false,
    showTimeSelect: true,
  },
};

export const DateTimePicker: Story = {
  args: {
    label: "DateTimePicker Field",
    description: "This is a date time picker ield",
    showDateSelect: true,
    showTimeSelect: true,
    placeholder: "2025/01/27 12:00",
  },
};

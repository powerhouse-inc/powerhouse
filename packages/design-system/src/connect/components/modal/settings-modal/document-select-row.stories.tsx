import type { Meta, StoryObj } from "@storybook/react";
import { DocumentSelectSettingsRow } from "./document-select-row.js";

const meta: Meta<typeof DocumentSelectSettingsRow> = {
  title: "Connect/Components/Modal/SettingsModal/DocumentSelectSettingsRow",
  component: DocumentSelectSettingsRow,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    title: "Document Models",
    description: "Documents enabled",
    options: [
      { label: "Apple", value: "apple" },
      { label: "Orange", value: "orange" },
      { label: "Banana", value: "banana" },
      { label: "Grape", value: "grape" },
      { label: "Pear", value: "pear" },
      { label: "Peach", value: "peach" },
    ],
    selected: [],
    selectProps: {
      labelledBy: "Select",
      className: "w-[200px]",
    },
  },
};

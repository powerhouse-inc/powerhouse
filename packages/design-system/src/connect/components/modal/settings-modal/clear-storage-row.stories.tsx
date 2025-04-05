import type { Meta, StoryObj } from "@storybook/react";
import { ClearStorageSettingsRow } from "./clear-storage-row.js";

const meta: Meta<typeof ClearStorageSettingsRow> = {
  title: "Connect/Components/Modal/SettingsModal/ClearStorageSettingsRow",
  component: ClearStorageSettingsRow,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    description: "Delete previous session data",
    buttonLabel: "Clear Data",
  },
};

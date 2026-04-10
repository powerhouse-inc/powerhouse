import type { Meta, StoryObj } from "@storybook/react";
import { ClearStorageSettingsRow } from "./clear-storage-row.js";
import { DependencyVersions } from "./dependency-versions/dependency-versions.js";
// @ts-expect-error - json file needs { with: "json" } but storybook doesn't support it
import mockPackageJson from "./dependency-versions/mock-package-json.json";
import { SettingsModalOld } from "./settings-modal.js";

const meta: Meta<typeof SettingsModalOld> = {
  title: "Connect/Components/Modal/SettingsModal",
  component: SettingsModalOld,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    open: true,
    title: "Settings",
    body: "These settings will apply to all drives.",
    cancelLabel: "Cancel",
    saveLabel: "Save",
    children: (
      <>
        <ClearStorageSettingsRow
          buttonLabel="Clear Storage"
          description="Delete previous session data"
          onClearStorage={() => {}}
        />
        <DependencyVersions packageJson={mockPackageJson} />
      </>
    ),
  },
};

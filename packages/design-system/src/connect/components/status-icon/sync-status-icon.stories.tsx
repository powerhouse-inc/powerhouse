import { syncStatuses } from "@powerhousedao/design-system";
import type { Meta, StoryObj } from "@storybook/react";
import { capitalCase } from "change-case";
import { SyncStatusIcon } from "./index.js";

const meta = {
  title: "Connect/Components/SyncStatusIcon",
  component: SyncStatusIcon,
} satisfies Meta<typeof SyncStatusIcon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    syncStatus: "SYNCING",
  },
  render: function Wrapper() {
    return (
      <div className="flex flex-col flex-wrap gap-4">
        {syncStatuses.map((status) => (
          <p className="flex items-center gap-2" key={status}>
            {capitalCase(status)} <SyncStatusIcon syncStatus={status} />
          </p>
        ))}
      </div>
    );
  },
};

export const WithDifferentSizes: Story = {
  args: {
    syncStatus: "SYNCING",
  },
  render: function Wrapper() {
    return (
      <div className="flex flex-col flex-wrap gap-4">
        {syncStatuses.map((status, index) => (
          <p className="flex items-center gap-2" key={status}>
            {capitalCase(status)}{" "}
            <SyncStatusIcon size={(index + 1) * 24} syncStatus={status} />
          </p>
        ))}
      </div>
    );
  },
};

export const WithDifferentColors: Story = {
  args: {
    syncStatus: "SYNCING",
  },
  render: function Wrapper() {
    return (
      <div className="flex flex-col flex-wrap gap-4">
        {syncStatuses.map((status) => (
          <p className="flex items-center gap-2" key={status}>
            {capitalCase(status)}{" "}
            <SyncStatusIcon className="text-gray-900" syncStatus={status} />
          </p>
        ))}
      </div>
    );
  },
};

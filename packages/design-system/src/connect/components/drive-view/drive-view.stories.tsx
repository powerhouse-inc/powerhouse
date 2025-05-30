import {
  mockCloudDrive,
  mockLocalDrive,
  mockNodeOptions,
  mockPublicDrive,
} from "#connect";
import type { Meta, StoryObj } from "@storybook/react";
import { DriveView } from "./drive-view.js";

const meta: Meta<typeof DriveView> = {
  title: "Connect/Components/DriveView",
  component: DriveView,
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const Template: Story = {
  render: function Wrapper(args) {
    return (
      // @ts-expect-error - mock
      <DriveView {...args} nodeOptions={mockNodeOptions} />
    );
  },
};

export const Public: Story = {
  ...Template,
  args: {
    label: "Public Drives",
    driveNodes: [mockPublicDrive],
  },
};

export const Cloud: Story = {
  ...Template,
  args: {
    label: "Cloud Drives",
    driveNodes: [mockCloudDrive],
  },
};

export const Local: Story = {
  ...Template,
  args: {
    label: "Local Drives",
    driveNodes: [mockLocalDrive],
  },
};

export const NotAllowedToCreateDocuments: Story = {
  ...Local,
  args: {
    ...Local.args,
    isAllowedToCreateDocuments: false,
  },
};

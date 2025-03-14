import {
  mockCloudDrive,
  mockLocalDrive,
  mockNodeOptions,
  mockPublicDrive,
} from "#connect";
import {
  UiNodesContextProvider,
  useUiNodesContext,
} from "@powerhousedao/reactor-browser";
import type { Meta, StoryObj } from "@storybook/react";
import { useEffect } from "react";
import { DriveView } from "./drive-view.js";

const meta: Meta<typeof DriveView> = {
  title: "Connect/Components/DriveView",
  component: DriveView,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <UiNodesContextProvider>
        <div className="w-[420px] bg-gray-50 p-10">
          <Story />
        </div>
      </UiNodesContextProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

const Template: Story = {
  render: function Wrapper(args) {
    const uiNodesContext = useUiNodesContext();
    const { setDriveNodes } = uiNodesContext;
    useEffect(() => {
      setDriveNodes(args.driveNodes);
    }, []);
    return (
      <DriveView {...args} {...uiNodesContext} nodeOptions={mockNodeOptions} />
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

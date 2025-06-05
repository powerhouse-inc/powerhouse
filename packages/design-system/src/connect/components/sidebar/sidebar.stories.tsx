import connectLogo from "#assets/connect.png";
import {
  WagmiContext,
  type SharingType,
  type UiDriveNode,
  type UiNode,
} from "#connect";
import { useEffect } from "@storybook/preview-api";
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { type ComponentPropsWithoutRef } from "react";
import { ConnectSidebar } from "../index.js";
import { SidebarItem } from "./sidebar-item.js";

type Args = ComponentPropsWithoutRef<typeof ConnectSidebar> & {
  driveNodes?: UiDriveNode[];
};

const meta: Meta<Args> = {
  title: "Connect/Components/Sidebar",
  component: ConnectSidebar,
};

export default meta;
type Story = StoryObj<Args>;

const user = {
  address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
} as const;

const Wrapper = (args: Args) => {
  const nodeHandlers = {
    onAddFolder: (name: string, uiNode: UiNode) => {},
    onAddFile: (file: File, parentNode: UiNode | null) => {
      console.log("onAddFile", { file, parentNode });
      return Promise.resolve();
    },
    onCopyNode: (uiNode: UiNode, targetNode: UiNode) => {
      console.log("onCopyNode", { uiNode, targetNode });
      return Promise.resolve();
    },
    onMoveNode: (uiNode: UiNode, targetNode: UiNode) => {
      console.log("onMoveNode", { uiNode, targetNode });
      return Promise.resolve();
    },
    onAddAndSelectNewFolder: (name: string) => Promise.resolve(),
    onRenameNode: (name: string, uiNode: UiNode) => {},
    onDuplicateNode: (uiNode: UiNode) => {},
    onDeleteNode: (uiNode: UiNode) => {},
    onDeleteDrive: (uiNode: UiNode) => {},
    onRenameDrive: (uiDriveNode: UiDriveNode, newName: string) => {},
    onChangeSharingType: (
      uiDriveNode: UiDriveNode,
      newSharingType: SharingType,
    ) => {},
    onChangeAvailableOffline: (
      uiDriveNode: UiDriveNode,
      newAvailableOffline: boolean,
    ) => {},
    showAddDriveModal: () => {},
    showDriveSettingsModal: (uiDriveNode: UiDriveNode) => {},
    onAddTrigger: (uiNodeDriveId: string) => {},
    onRemoveTrigger: (uiNodeDriveId: string) => {},
    onAddInvalidTrigger: (uiNodeDriveId: string) => {},
  };

  return (
    <WagmiContext>
      <div className="relative h-screen">
        <ConnectSidebar
          {...args}
          headerContent={
            <div className="flex h-full items-center">
              <img
                alt="Connect logo"
                className="h-5 object-contain"
                src={connectLogo}
              />
            </div>
          }
        >
          <SidebarItem title="Home" />
          <SidebarItem title="Home" />
          <SidebarItem title="Home" active={true} />
          <SidebarItem title="Home" />
          <SidebarItem title="Home" />
          <SidebarItem title="Home" />
          <SidebarItem title="Home" />
        </ConnectSidebar>
      </div>
    </WagmiContext>
  );
};

export const Expanded: Story = {
  render: Wrapper,
  args: {
    onLogin: fn(),
    onDisconnect: fn(),
    etherscanUrl: "https://etherscan.io/",
  },
};

export const WithLoggedInUser: Story = {
  render: Wrapper,
  args: {
    address: user.address,
    // implent an storybook action here
    onLogin: fn(),
    onDisconnect: fn(),
    etherscanUrl: `https://etherscan.io/address/${user.address}`,
  },
};

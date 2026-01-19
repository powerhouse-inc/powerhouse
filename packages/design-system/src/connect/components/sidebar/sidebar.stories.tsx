import { Icon } from "@powerhousedao/design-system";
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import type { DocumentDriveDocument } from "document-drive";
import type { ComponentPropsWithoutRef } from "react";
import { WagmiContext } from "../../context/WagmiContext.js";
import { ConnectTooltipProvider } from "../tooltip/tooltip.js";
import { SidebarItem } from "./sidebar-item.js";
import { ConnectSidebar } from "./sidebar.js";

type Args = ComponentPropsWithoutRef<typeof ConnectSidebar> & {
  drives?: DocumentDriveDocument[];
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
  return (
    <WagmiContext>
      <ConnectTooltipProvider>
        <div className="relative h-screen">
          <ConnectSidebar
            {...args}
            headerContent={
              <div className="flex h-full items-center">
                <Icon name="ConnectSmall" size={24} />
              </div>
            }
          >
            <SidebarItem title="My Local Drive" />
            <SidebarItem title="Shared Documents" />
            <SidebarItem title="Project Files" active={true} />
            <SidebarItem title="Archive" />
            <SidebarItem title="Templates" />
            <SidebarItem title="Backups" />
            <SidebarItem title="Settings" />
          </ConnectSidebar>
        </div>
      </ConnectTooltipProvider>
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

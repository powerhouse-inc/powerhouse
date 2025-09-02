import connectLogo from "@powerhousedao/connect/connect.png";
import { WagmiContext } from "@powerhousedao/design-system";
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import type { DocumentDriveDocument } from "document-drive";
import type { ComponentPropsWithoutRef } from "react";
import { ConnectSidebar } from "../index.js";
import { SidebarItem } from "./sidebar-item.js";

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

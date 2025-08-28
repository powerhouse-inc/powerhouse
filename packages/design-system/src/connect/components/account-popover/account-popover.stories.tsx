import { Icon } from "@powerhousedao/design-system";
import type { Meta, StoryObj } from "@storybook/react";
import { AccountPopoverLogin } from "./account-popover-login.js";
import { AccountPopoverUser } from "./account-popover-user.js";
import { AccountPopover } from "./account-popover.js";

const meta = {
  title: "Connect/Components/AccountPopover",
  component: AccountPopover,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof AccountPopover>;

export default meta;
type Story = StoryObj<typeof AccountPopover>;

export const LoggedOut: Story = {
  args: {
    children: (
      <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2">
        <Icon name="Settings" className="text-gray-600" />
        <span className="text-sm font-medium">Connect</span>
      </div>
    ),
    content: (
      <AccountPopoverLogin onLogin={() => console.log("Login clicked")} />
    ),
  },
};

const address = "0x418CF32C411DC2F1BE7DE1D35FD98B1DA0719";

export const LoggedIn: Story = {
  args: {
    children: (
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-gray-200" />
        <div className="flex flex-col">
          <span className="text-sm font-medium">Willow.eth</span>
          <span className="text-xs text-gray-500">{`${address.slice(0, 6)}...${address.slice(-4)}`}</span>
        </div>
      </div>
    ),
    content: (
      <AccountPopoverUser
        address={address as `0x${string}`}
        onDisconnect={() => console.log("Disconnect clicked")}
        etherscanUrl={`https://etherscan.io/address/${address}`}
      />
    ),
  },
};

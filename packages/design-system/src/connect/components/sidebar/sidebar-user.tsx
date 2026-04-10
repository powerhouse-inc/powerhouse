import { AccountPopoverUser } from "../account-popover/account-popover-user.js";
import { AccountPopover } from "../account-popover/account-popover.js";
import { ENSAvatar } from "../ens-avatar/ens-avatar.js";

export interface SidebarUserProps {
  address: `0x${string}`;
  ensName?: string;
  avatarUrl?: string;
  etherscanUrl: string;
  onDisconnect: (() => void) | undefined;
}

export const SidebarUser: React.FC<SidebarUserProps> = ({
  address,
  ensName,
  avatarUrl,
  etherscanUrl,
  onDisconnect,
}) => {
  const content = (
    <AccountPopoverUser
      address={address}
      username={ensName}
      onDisconnect={onDisconnect}
      etherscanUrl={etherscanUrl}
    />
  );

  return (
    <AccountPopover content={content}>
      <div className="flex items-center justify-center rounded-sm">
        <ENSAvatar address={address} avatarUrl={avatarUrl} size="40px" />
      </div>
    </AccountPopover>
  );
};

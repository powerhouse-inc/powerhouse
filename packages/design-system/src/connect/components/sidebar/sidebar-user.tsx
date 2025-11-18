import { useEnsName } from "wagmi";
import { AccountPopoverUser } from "../account-popover/account-popover-user.js";
import { AccountPopover } from "../account-popover/account-popover.js";
import { ENSAvatar } from "../ens-avatar/ens-avatar.js";

export interface SidebarUserProps {
  address: `0x${string}`;
  etherscanUrl: string;
  onDisconnect: (() => void) | undefined;
}

export const SidebarUser: React.FC<SidebarUserProps> = ({
  address,
  etherscanUrl,
  onDisconnect,
}) => {
  const { data } = useEnsName({ address });

  const ensName = data as string | undefined;

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
        <ENSAvatar address={address} size="40px" />
      </div>
    </AccountPopover>
  );
};

import { ENSAvatar } from "#connect";
import { useEnsName } from "wagmi";
import {
  AccountPopover,
  AccountPopoverUser,
} from "../account-popover/index.js";

export interface SidebarUserProps {
  address: `0x${string}`;
  etherscanUrl: string;
  onDisconnect: () => void;
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

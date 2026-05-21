import { useEns } from "../../../hooks/use-ens.js";
import { formatEthAddress } from "../../../utils/address.js";
import { CodePopover } from "../../code-popover.js";
import { ENSAvatar } from "../../ens-avatar/ens-avatar.js";
import { FormattedJsonViewer } from "../../formatted-json-viewer.js";

export type AddressProps = {
  readonly address: `0x${string}` | undefined;
  readonly chainId: number | undefined;
};

export function Address(props: AddressProps) {
  const { address, chainId } = props;
  const { data: ensData } = useEns(address);

  if (!address) return null;

  const shortenedAddress = formatEthAddress(address);

  return (
    <CodePopover
      content={<FormattedJsonViewer value={{ address }} />}
      trigger={
        <span className="flex w-fit cursor-pointer items-center gap-1 rounded-lg bg-gray-100 p-1 text-xs text-slate-100 dark:bg-slate-700 dark:text-slate-500">
          <ENSAvatar
            address={address}
            chainId={chainId}
            avatarUrl={ensData?.avatar_url ?? undefined}
          />
          {shortenedAddress}
        </span>
      }
    />
  );
}

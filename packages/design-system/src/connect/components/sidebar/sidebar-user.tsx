import { ENSAvatar, formatEthAddress } from "@/connect";
import { useEnsName } from "wagmi";

export interface SidebarUserProps {
  address: `0x${string}`;
}

export const SidebarUser: React.FC<SidebarUserProps> = ({ address }) => {
  const ensNameResult = useEnsName({ address });
  const loadingUser = ensNameResult.isLoading;
  const ensName = ensNameResult.data ?? undefined;
  const formattedAddress = formatEthAddress(address);

  const usernameAndAddressLoader = (
    <>
      <p className="mb-2 h-4 w-4/5 animate-pulse rounded bg-gray-400" />
      <p className="h-3 w-4/5 animate-pulse rounded bg-gray-400" />
    </>
  );

  const ensNameAndAddress = (
    <>
      <p className="animate-fade-in mb-2 h-4 text-sm text-gray-800 duration-1000">
        {ensName}
      </p>
      <p className="animate-fade-in h-3 text-xs text-gray-600 duration-1000">
        {formattedAddress}
      </p>
    </>
  );

  const addressOnly = (
    <p className="animate-fade-in text-sm text-gray-800 duration-1000">
      {formattedAddress}
    </p>
  );

  return (
    <div className="flex gap-2 rounded-sm py-2.5">
      <ENSAvatar address={address} size="40px" />
      <div className="grid w-full items-center font-semibold">
        {loadingUser ? usernameAndAddressLoader : null}
        {!loadingUser && !!ensName && ensNameAndAddress}
        {!loadingUser && !ensName && addressOnly}
      </div>
    </div>
  );
};

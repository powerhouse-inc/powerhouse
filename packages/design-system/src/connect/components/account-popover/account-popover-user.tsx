import { Icon, PowerhouseButton } from "@powerhousedao/design-system";
import type { FC } from "react";
import { useCallback, useState } from "react";
import { twMerge } from "tailwind-merge";

export interface AccountPopoverUserProps {
  address: `0x${string}`;
  onDisconnect: (() => void) | undefined;
  etherscanUrl?: string;
  username?: string;
}

// short eth address
const shortAddress = (address: `0x${string}`) =>
  `${address.slice(0, 7)}...${address.slice(-5)}`;

export const AccountPopoverUser: FC<AccountPopoverUserProps> = ({
  address,
  onDisconnect,
  etherscanUrl,
  username = "",
}: AccountPopoverUserProps) => {
  const [isCopied, setIsCopied] = useState(false);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy address:", err);
    }
  }, []);

  return (
    <div className="flex flex-col divide-y divide-gray-200 text-gray-900">
      <div className="px-3 py-2">
        {username && <div className="text-sm font-medium">{username}</div>}
        <div className="mt-1 flex items-center gap-2">
          <PowerhouseButton
            size="small"
            color="light"
            onClick={copyToClipboard.bind(null, address)}
            className="w-full cursor-pointer bg-transparent p-0 active:opacity-70"
            type="button"
          >
            <div className="relative flex w-full items-center gap-1">
              <div
                className={`flex items-center gap-1 transition-opacity duration-150 ${isCopied ? "opacity-0" : "opacity-100"}`}
              >
                <span className="text-xs">{shortAddress(address)}</span>
                <Icon name="FilesEarmark" color="#9EA0A1" size={14} />
              </div>
              <div
                className={`absolute left-0 text-xs transition-opacity duration-150 ${isCopied ? "opacity-100" : "opacity-0"}`}
              >
                Copied to clipboard!
              </div>
            </div>
          </PowerhouseButton>
        </div>
      </div>
      {etherscanUrl && (
        <div className="px-3 py-2">
          <a
            href={etherscanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-gray-900 hover:text-gray-600"
          >
            <Icon name="Ethscan" size={14} />
            View on Etherscan
          </a>
        </div>
      )}
      <div className="px-3 py-2">
        <button
          onClick={onDisconnect}
          className={twMerge(
            "flex w-full items-center gap-2 text-sm text-red-900",
            onDisconnect
              ? "cursor-pointer hover:text-red-700"
              : "pointer-events-none cursor-wait",
          )}
          type="button"
        >
          <Icon name="Disconnect" size={14} color="#EA4335" />
          Disconnect
        </button>
      </div>
    </div>
  );
};

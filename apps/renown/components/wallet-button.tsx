import { ConnectButton } from "@rainbow-me/rainbowkit";
import Image from "next/image";
import Button from "./button";

interface IProps {
    className?: string;
}

const WalletButton: React.FC<IProps> = ({ className }) => {
    return (
        <ConnectButton.Custom>
            {({
                account,
                chain,
                openConnectModal,
                openAccountModal,
                openChainModal,
                mounted,
            }) => {
                const connected = mounted && account && chain;

                return (
                    <div className={`w-full ${className}`}>
                        {(() => {
                            if (!connected) {
                                return (
                                    <Button
                                        className="w-full"
                                        primary
                                        onClick={openConnectModal}
                                    >
                                        Connect Wallet
                                    </Button>
                                );
                            }

                            if (chain.unsupported) {
                                return (
                                    <div className="text-center">
                                        <span className="mr-2 font-semibold">
                                            Wrong network:
                                        </span>
                                        <Button
                                            className="px-10"
                                            primary
                                            onClick={openChainModal}
                                            type="button"
                                        >
                                            Change network
                                        </Button>
                                    </div>
                                );
                            }

                            return (
                                <div className="flex gap-3 justify-center">
                                    {chain.hasIcon && (
                                        <Button
                                            className="p-2 bg-neutral-2-light overflow-hidden shadow-button"
                                            onClick={openChainModal}
                                            style={{
                                                borderRadius: 14,
                                                display: "flex",
                                                alignItems: "center",
                                            }}
                                            type="button"
                                        >
                                            <div
                                                className="rounded-full overflow-hidden"
                                                style={{
                                                    background:
                                                        chain.iconBackground,
                                                }}
                                            >
                                                {chain.iconUrl && (
                                                    <Image
                                                        alt={
                                                            chain.name ??
                                                            "Chain icon"
                                                        }
                                                        src={chain.iconUrl}
                                                        width={24}
                                                        height={24}
                                                    />
                                                )}
                                            </div>
                                        </Button>
                                    )}

                                    <button
                                        onClick={openAccountModal}
                                        type="button"
                                        className="p-2 bg-neutral-2-light overflow-hidden rounded-[14px] shadow-button h-10 flex gap-2"
                                    >
                                        {account.ensAvatar && (
                                            <Image
                                                src={account.ensAvatar}
                                                alt={
                                                    account.ensName ??
                                                    account.address
                                                }
                                                width={24}
                                                height={24}
                                                className="rounded-full"
                                            />
                                        )}
                                        <span className="font-bold lining-nums proportional-nums text-neutral-5-light">
                                            {`${account.address.slice(
                                                0,
                                                5
                                            )}...${account.address.slice(-10)}`}
                                        </span>
                                    </button>
                                </div>
                            );
                        })()}
                    </div>
                );
            }}
        </ConnectButton.Custom>
    );
};

export default WalletButton;

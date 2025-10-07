"use client";

import { useAccount, useNetwork } from "wagmi";
import Image from "next/image";
import Header from "../assets/images/header.jpg";
import IconRenown from "../assets/icons/renown.svg";
import IconConnect from "../assets/icons/connect.svg";
import IconConnectWhite from "../assets/icons/connect-white.svg";
import Button from "./button";
import { useCredential } from "../hooks/credential";
import { ConfirmAuthorization } from "./confirm-authorization";
import Credential from "./credential";

interface IProps {
    connectId: string;
    deeplink?: string;
    returnUrl?: string;
}

function ConnectIdText(id: string) {
    return id.length < 20 ? id : `${id.slice(0, 5)}...${id.slice(-5)}`;
}

const connectUrl = process.env.NEXT_PUBLIC_CONNECT_URL;

function buildUrl(returnUrl: string, user: string) {
    const url = new URL(returnUrl);
    url.searchParams.set("user", user);
    return url.toString();
}

const ConnectFlow: React.FC<IProps> = ({
    connectId,
    deeplink,
    returnUrl = connectUrl,
}) => {
    const account = useAccount();
    const { chain } = useNetwork();
    const { hasCredential, credential } = useCredential(connectId);
    const user = encodeURIComponent(credential?.issuer.id ?? "");
    const url = deeplink
        ? `${deeplink}://login/${user}`
        : buildUrl(returnUrl ?? "", user);

    return (
        <div className="flex flex-col items-center">
            <div className="max-w-[482px] overflow-auto rounded-3xl shadow-modal">
                <div className="relative">
                    <Image
                        priority
                        src={Header}
                        alt="Powerhouse"
                        className="h-[106px]"
                    />
                    <Image
                        src={IconRenown}
                        alt="Renown"
                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform"
                    />
                </div>
                <div className="flex flex-col items-center bg-bg px-8 pb-8 pt-10">
                    <h2 className="mb-3 text-3xl font-semibold">
                        {account.isConnected && !chain?.unsupported
                            ? "Confirm Authorization"
                            : "Connect Wallet"}
                    </h2>
                    <p className="mb-10 text-center text-lg leading-6 text-neutral-4-light">
                        Click on the button below to start signing messages in
                        Connect on behalf of your Ethereum identity
                    </p>
                    <div className="rounded-xl p-4 text-center mb-10 bg-neutral-2-light flex gap-3">
                        <Image src={IconConnect} alt="Renown" />
                        <div className="max-w-[284px] text-left">
                            <h3 className="text-neutral-5-light font-medium">
                                Powerhouse Connect
                            </h3>
                            <p className="text-neutral-4 whitespace-nowrap overflow-hidden text-ellipsis">
                                Device ID: {ConnectIdText(connectId)}
                            </p>
                        </div>
                    </div>
                    {!hasCredential ? (
                        <ConfirmAuthorization connectId={connectId} />
                    ) : account.address ? (
                        <Credential connectId={connectId} />
                    ) : null}
                    {account.address && hasCredential ? (
                        <a
                            href={url}
                            className="text-center block w-full mt-12"
                        >
                            <Button primary className="w-full">
                                <div className="flex items-center justify-center gap-2">
                                    <Image
                                        src={IconConnectWhite}
                                        alt="Connect"
                                    />
                                    Return to Connect
                                </div>
                            </Button>
                        </a>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

export default ConnectFlow;

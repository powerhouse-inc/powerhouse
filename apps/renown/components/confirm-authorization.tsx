import { useAccount, useNetwork } from "wagmi";
import Button from "./button";
import WalletButton from "./wallet-button";
import { useCredential } from "../hooks/credential";

interface IProps {
    connectId: string;
    deeplink?: string;
}

export const ConfirmAuthorization: React.FC<IProps> = ({ connectId }) => {
    const account = useAccount();
    const { chain } = useNetwork();
    const { createCredential, loading } = useCredential(connectId);

    return (
        <>
            <WalletButton className={account.isConnected ? "mb-10" : "mb-3"} />
            {account.isConnected ? (
                <Button
                    primary
                    onClick={createCredential}
                    className={`w-full mb-3 ${loading ? "animate-pulse" : ""}`}
                    disabled={
                        !account.isConnected || !!chain?.unsupported || loading
                    }
                >
                    Confirm Authorization
                </Button>
            ) : null}
            <Button
                secondary
                className="w-full hover:bg-neutral-1"
                onClick={() => {
                    history.back();
                }}
            >
                Cancel
            </Button>
        </>
    );
};

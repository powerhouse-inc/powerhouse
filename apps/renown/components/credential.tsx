import IconCheck from "../assets/icons/check.svg";
import Image from "next/image";
import { useCredential } from "../hooks/credential";
import { useRef } from "react";

interface IProps {
    connectId: string;
}

const Credential: React.FC<IProps> = ({ connectId }) => {
    const { hasCredential, credential, revokeCredential } =
        useCredential(connectId);
    const dialogRef = useRef<HTMLDialogElement>(null);
    let revoking = false;

    if (!hasCredential) {
        return null;
    }

    return (
        <div>
            <div className="rounded-xl p-4 text-center bg-neutral-2-light flex gap-3">
                <Image src={IconCheck} alt="Confirmed" width={36} height={36} />
                <div>
                    <h3 className="text-neutral-5-light font-medium">
                        Authorization confirmed
                    </h3>
                    <div className="flex items-center justify-between">
                        <button
                            className="text-link underline underline-offset-4"
                            onClick={() => {
                                dialogRef.current?.showModal();
                            }}
                        >
                            View details
                        </button>
                        <button
                            className={`text-red underline underline-offset-4 ${
                                revoking && "animate-pulse pointer-events-none"
                            }`}
                            disabled={revoking || !credential}
                            onClick={() => revokeCredential()}
                        >
                            Revoke
                        </button>
                    </div>
                </div>
                <dialog
                    ref={dialogRef}
                    className="shadow-lg backdrop:bg-transparent backdrop:cursor-pointer p-6 h-4/6"
                    onClick={() => dialogRef.current?.close()}
                >
                    <pre
                        className="text-start"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {credential && JSON.stringify(credential, null, 4)}
                    </pre>
                </dialog>
            </div>
        </div>
    );
};

export default Credential;

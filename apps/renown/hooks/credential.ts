import { useEffect } from "react";
import { useCeramic } from "./ceramic";
import {
    useAccount,
    useWalletClient,
    useSignTypedData,
    useChainId,
} from "wagmi";
import {
    createPowerhouseVerifiableCredential,
    PowerhouseVerifiableCredential,
} from "../services/credential";
import { useState } from "react";
import { useMemo } from "react";
import { atom, useAtom } from "jotai";
import { useCallback } from "react";
import credential from "../pages/api/auth/credential";

interface ICredential {
    credential: PowerhouseVerifiableCredential | undefined;
    isAuth: boolean;
    hasCredential: boolean;
    loading: boolean;
    createCredential: () => Promise<PowerhouseVerifiableCredential | undefined>;
    revokeCredential: () => Promise<void>;
}

const credentialAtom = atom<PowerhouseVerifiableCredential | undefined>(
    undefined
);

export function useCredential(connectId: string): ICredential {
    const { data: walletClient } = useWalletClient();
    const { address } = useAccount();
    const chainId = useChainId();
    const { signTypedDataAsync } = useSignTypedData();
    const {
        session,
        getCredential: _getCredential,
        storeCredential,
        revokeCredential: _revokeCredential,
    } = useCeramic(walletClient);
    const [credential, setCredential] = useAtom<
        PowerhouseVerifiableCredential | undefined
    >(credentialAtom);
    const [state, setState] = useState<
        "INITIAL" | "FETCHING_CREDENTIAL" | "ERROR" | "SUCCESS"
    >(credential ? "SUCCESS" : "INITIAL");

    const getCredential = useCallback(
        async (address: string, chainId: number, connectId: string) => {
            setState("FETCHING_CREDENTIAL");
            try {
                const credential = await _getCredential(
                    address,
                    chainId,
                    connectId
                );
                setCredential(credential);
                setState("SUCCESS");
            } catch (e) {
                setCredential(undefined);
                console.error(e);
                setState("ERROR");
            }
        },
        [_getCredential, setCredential]
    );

    const createCredential = useCallback(
        async (address: `0x${string}`, chainId: number, connectId: string) => {
            setState("FETCHING_CREDENTIAL");
            try {
                const credential = await createPowerhouseVerifiableCredential(
                    address,
                    chainId,
                    { id: connectId, app: "Connect" },
                    signTypedDataAsync
                );

                console.log("Credential created", credential);
                const document = await storeCredential(credential);
                console.log("Credential stored", document);
                setCredential({ ...credential, id: document.id });
                setState("SUCCESS");
                return credential;
            } catch (e) {
                console.error(e);
                setState("ERROR");
            }
        },
        [setCredential, signTypedDataAsync, storeCredential]
    );

    const revokeCredential = useCallback(async () => {
        try {
            if (!credential) {
                return;
            }
            await _revokeCredential(credential?.id);
            address && getCredential(address, chainId, connectId);
        } catch (e) {
            console.error(e);
            setState("ERROR");
        }
    }, [
        _revokeCredential,
        address,
        chainId,
        connectId,
        credential,
        getCredential,
    ]);

    if (
        state === "INITIAL" &&
        address &&
        connectId
        // TODO check if credential is valid (address changed)
    ) {
        getCredential(address, chainId, connectId);
    }

    return useMemo(
        () => ({
            credential,
            isAuth: session?.isAuthorized() ?? false,
            hasCredential: !!credential,
            loading: state === "FETCHING_CREDENTIAL",
            createCredential: () => {
                if (!address) {
                    throw new Error("Address is not set");
                }
                return createCredential(address, chainId, connectId);
            },
            revokeCredential,
        }),
        [
            credential,
            session,
            state,
            revokeCredential,
            address,
            createCredential,
            chainId,
            connectId,
        ]
    );
}

import { type DID, type IConnectCrypto } from '#services';
import { logger } from 'document-drive';
import { atom, useAtom } from 'jotai';
import { useEffect, useMemo } from 'react';

// uses electron connect crypto if available,
// otherwise dynamically loads browser crypto
let _connectCrypto: Promise<IConnectCrypto> | undefined;

async function initConnectCrypto() {
    const { ConnectCrypto } = await import('#services');
    const { BrowserKeyStorage } = await import('#services');
    const connectCrypto = new ConnectCrypto(new BrowserKeyStorage());
    await connectCrypto.did();
    return connectCrypto;
}

export function getConnectCrypto(): Promise<IConnectCrypto> {
    if (window.connectCrypto) {
        return Promise.resolve(window.connectCrypto);
    }
    if (_connectCrypto) {
        return _connectCrypto;
    }

    _connectCrypto = initConnectCrypto();
    return _connectCrypto;
}

export function useConnectCrypto(): IConnectCrypto {
    return useMemo(
        () => ({
            async regenerateDid() {
                const crypto = await getConnectCrypto();
                return crypto.regenerateDid();
            },
            async did() {
                const crypto = await getConnectCrypto();
                return crypto.did();
            },
            sign: async (data: Uint8Array) => {
                const crypto = await getConnectCrypto();
                return await crypto.sign(data);
            },
            async getIssuer() {
                const crypto = await getConnectCrypto();
                return crypto.getIssuer();
            },
            async getBearerToken(
                driveUrl: string,
                address: string | undefined,
                refresh = false,
            ) {
                const crypto = await getConnectCrypto();
                return crypto.getBearerToken(driveUrl, address, refresh);
            },
        }),
        [],
    );
}

const didAtom = atom<DID | undefined>(undefined);
didAtom.debugLabel = 'didAtomInConnect';

export function useConnectDid(): DID | undefined {
    const [did, setDid] = useAtom(didAtom);

    useEffect(() => {
        if (did) {
            return;
        }
        getConnectCrypto()
            .then(c => c.did())
            .then(did => setDid(did))
            .catch(logger.error);
    });

    return did;
}

import type { DID, IConnectCrypto } from '#services/crypto';
import { logger } from '#services/logger';
import { atom, useAtom } from 'jotai';
import { useEffect, useMemo } from 'react';

// uses electron connect crypto if available,
// otherwise dynamically loads browser crypto
const connectCrypto = (async () => {
    if (window.connectCrypto) {
        return window.connectCrypto;
    }

    const { ConnectCrypto } = await import('#services/crypto/index');
    const { BrowserKeyStorage } = await import('#services/crypto/browser');
    const connectCrypto = new ConnectCrypto(new BrowserKeyStorage());
    await connectCrypto.did();
    return connectCrypto;
})();

export function useConnectCrypto(): IConnectCrypto {
    return useMemo(
        () => ({
            async regenerateDid() {
                const crypto = await connectCrypto;
                return crypto.regenerateDid();
            },
            async did() {
                const crypto = await connectCrypto;
                return crypto.did();
            },
            sign: async (data: Uint8Array) => {
                const crypto = await connectCrypto;
                return await crypto.sign(data);
            },
        }),
        [],
    );
}

const didAtom = atom<DID | undefined>(undefined);

export function useConnectDid(): DID | undefined {
    const [did, setDid] = useAtom(didAtom);

    useEffect(() => {
        if (did) {
            return;
        }
        connectCrypto
            .then(c => c.did())
            .then(did => setDid(did))
            .catch(logger.error);
    });

    return did;
}

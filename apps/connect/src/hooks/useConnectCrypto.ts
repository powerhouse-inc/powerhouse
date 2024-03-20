import { useMemo } from 'react';
import { IConnectCrypto } from 'src/services/crypto';

// uses electron connect crypto if available,
// otherwise dynamically loads browser crypto
const connectCrypto = (async () => {
    if (window.connectCrypto) {
        return window.connectCrypto;
    }

    const { ConnectCrypto } = await import('src/services/crypto');
    const { BrowserKeyStorage } = await import('src/services/crypto/browser');
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
        }),
        [],
    );
}

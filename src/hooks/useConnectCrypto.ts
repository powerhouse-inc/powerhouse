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
    await connectCrypto.initialize();
    return connectCrypto;
})();

export function useConnectCrypto(): IConnectCrypto {
    return {
        async regenerateKeyPair() {
            const crypto = await connectCrypto;
            return crypto.regenerateKeyPair();
        },
        async publicKey() {
            const crypto = await connectCrypto;
            return crypto.publicKey();
        },
    };
}

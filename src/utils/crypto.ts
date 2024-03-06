export type JwkKeyPair = {
    publicKey: JsonWebKey;
    privateKey: JsonWebKey;
};

export interface JsonWebKeyPairStorage {
    loadKeyPair(): Promise<JwkKeyPair | undefined>;
    saveKeyPair(keyPair: JwkKeyPair): Promise<void>;
}

function arraybuffer2hex(ab: ArrayBufferLike) {
    return Array.prototype.map
        .call(new Uint8Array(ab), x =>
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            ('00' + x.toString(16)).slice(-2),
        )
        .join('');
}

export class ConnectCrypto {
    #subtleCrypto: Promise<SubtleCrypto>;
    #keyPair: CryptoKeyPair | undefined;
    #keyPairStorage: JsonWebKeyPairStorage;

    static algorithm: EcKeyAlgorithm = {
        name: 'ECDSA',
        namedCurve: 'P-256',
    };

    constructor(keyPairStorage: JsonWebKeyPairStorage) {
        this.#keyPairStorage = keyPairStorage;

        // Initializes the subtleCrypto module according to the host environment
        this.#subtleCrypto = this.#initCrypto();
    }

    #initCrypto() {
        return new Promise<SubtleCrypto>((resolve, reject) => {
            if (typeof window === 'undefined') {
                import('node:crypto')
                    .then(module => {
                        resolve(module.webcrypto.subtle as SubtleCrypto);
                    })
                    .catch(reject);
            } else {
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                if (!window.crypto?.subtle) {
                    reject(new Error('Crypto module not available'));
                }
                resolve(window.crypto.subtle);
            }
        });
    }

    // loads the key pair from storage or generates a new one if none is stored
    async initialize() {
        const loadedKeyPair = await this.#keyPairStorage.loadKeyPair();
        if (loadedKeyPair) {
            this.#keyPair = await this.#importKeyPair(loadedKeyPair);
            console.log('Loaded key pair', await this.publicKey());
        } else {
            this.#keyPair = await this.#generateECDSAKeyPair();
            console.log('Created key pair', await this.publicKey());
            await this.#keyPairStorage.saveKeyPair(await this.#exportKeyPair());
        }
    }

    async publicKey() {
        if (!this.#keyPair) {
            return undefined;
        }

        const subtleCrypto = await this.#subtleCrypto;
        const publicKey = await subtleCrypto.exportKey(
            'raw',
            this.#keyPair.publicKey,
        );
        return arraybuffer2hex(publicKey);
    }

    async #generateECDSAKeyPair() {
        const subtleCrypto = await this.#subtleCrypto;
        const keyPair = await subtleCrypto.generateKey(
            ConnectCrypto.algorithm,
            true,
            ['sign', 'verify'],
        );
        return keyPair;
    }

    async #exportKeyPair(): Promise<JwkKeyPair> {
        if (!this.#keyPair) {
            throw new Error('No key pair available');
        }
        const subtleCrypto = await this.#subtleCrypto;
        const jwkKeyPair = {
            publicKey: await subtleCrypto.exportKey(
                'jwk',
                this.#keyPair.publicKey,
            ),
            privateKey: await subtleCrypto.exportKey(
                'jwk',
                this.#keyPair.privateKey,
            ),
        };
        return jwkKeyPair;
    }

    async #importKeyPair(jwkKeyPair: JwkKeyPair): Promise<CryptoKeyPair> {
        const subtleCrypto = await this.#subtleCrypto;
        return {
            publicKey: await subtleCrypto.importKey(
                'jwk',
                jwkKeyPair.publicKey,
                ConnectCrypto.algorithm,
                true,
                ['verify'],
            ),
            privateKey: await subtleCrypto.importKey(
                'jwk',
                jwkKeyPair.privateKey,
                ConnectCrypto.algorithm,
                true,
                ['sign'],
            ),
        };
    }

    #sign = async (
        ...args: Parameters<SubtleCrypto['sign']>
    ): Promise<ArrayBuffer> => {
        return (await this.#subtleCrypto).sign(...args);
    };

    #verify = async (
        ...args: Parameters<SubtleCrypto['verify']>
    ): Promise<boolean> => {
        return (await this.#subtleCrypto).verify(...args);
    };
}

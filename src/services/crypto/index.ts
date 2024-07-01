import {
    compressedKeyInHexfromRaw,
    encodeDIDfromHexString,
    rawKeyInHexfromUncompressed,
} from 'did-key-creator';

export type JwkKeyPair = {
    publicKey: JsonWebKey;
    privateKey: JsonWebKey;
};

export interface JsonWebKeyPairStorage {
    loadKeyPair(): Promise<JwkKeyPair | undefined>;
    saveKeyPair(keyPair: JwkKeyPair): Promise<void>;
}

function ab2hex(ab: ArrayBuffer) {
    return Array.prototype.map
        .call(new Uint8Array(ab), (x: number) =>
            ('00' + x.toString(16)).slice(-2),
        )
        .join('');
}

export interface IConnectCrypto {
    did: () => Promise<DID>;
    regenerateDid(): Promise<void>;
    sign: (data: Uint8Array) => Promise<Uint8Array>;
}

export type DID = `did:key:${string}`;

export class ConnectCrypto implements IConnectCrypto {
    #subtleCrypto: Promise<SubtleCrypto>;
    #keyPair: CryptoKeyPair | undefined;
    #keyPairStorage: JsonWebKeyPairStorage;

    #did: Promise<DID>;

    static algorithm: EcKeyAlgorithm = {
        name: 'ECDSA',
        namedCurve: 'P-256',
    };

    static signAlgorithm = {
        name: 'ECDSA',
        namedCurve: 'P-256',
        hash: 'SHA-256',
    };

    constructor(keyPairStorage: JsonWebKeyPairStorage) {
        this.#keyPairStorage = keyPairStorage;

        // Initializes the subtleCrypto module according to the host environment
        this.#subtleCrypto = this.#initCrypto();

        this.#did = this.#initialize();
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
    async #initialize() {
        const loadedKeyPair = await this.#keyPairStorage.loadKeyPair();
        if (loadedKeyPair) {
            this.#keyPair = await this.#importKeyPair(loadedKeyPair);
            console.log('Found key pair');
        } else {
            this.#keyPair = await this.#generateECDSAKeyPair();
            console.log('Created key pair');
            await this.#keyPairStorage.saveKeyPair(await this.#exportKeyPair());
        }
        const did = await this.#parseDid();
        console.log('Connect DID:', did);
        return did;
    }

    did() {
        return this.#did;
    }

    async regenerateDid() {
        this.#keyPair = await this.#generateECDSAKeyPair();
        await this.#keyPairStorage.saveKeyPair(await this.#exportKeyPair());
    }

    async #parseDid(): Promise<DID> {
        if (!this.#keyPair) {
            throw new Error('No key pair available');
        }

        const subtleCrypto = await this.#subtleCrypto;
        const publicKeyRaw = await subtleCrypto.exportKey(
            'raw',
            this.#keyPair.publicKey,
        );

        const multicodecName = 'p256-pub';
        const rawKey = rawKeyInHexfromUncompressed(ab2hex(publicKeyRaw));
        const compressedKey = compressedKeyInHexfromRaw(rawKey);
        const did = encodeDIDfromHexString(multicodecName, compressedKey);
        return did as DID;
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

    async sign(data: Uint8Array): Promise<Uint8Array> {
        if (this.#keyPair?.privateKey) {
            const subtleCrypto = await this.#subtleCrypto;

            const arrayBuffer = await subtleCrypto.sign(
                ConnectCrypto.signAlgorithm,
                this.#keyPair.privateKey,
                data.buffer,
            );

            return new Uint8Array(arrayBuffer);
        } else {
            throw new Error('No private key available');
        }
    }
}

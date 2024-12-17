import { EventEmitter } from 'events';
import { logger } from '../logger';
import type { IStorage } from '../storage';
import { getEnsInfo } from '../viem';
import { RENOWN_URL } from './constants';
import { PowerhouseVerifiableCredential, RenownStorage, User } from './types';
import { parsePkhDid } from './utils';

export type { PowerhouseVerifiableCredential } from './types';

export class Renown {
    #baseUrl: string;
    #store: RenownStorage;
    #connectId: string;
    #eventEmitter = new EventEmitter();

    constructor(store: IStorage, connectId: string, baseUrl = RENOWN_URL) {
        this.#store = store as RenownStorage;
        this.#connectId = connectId;
        this.#baseUrl = baseUrl;

        if (this.user) {
            this.login(this.user.did).catch(() => void 0);
        }
    }

    get user() {
        return this.#store.get('user');
    }

    #updateUser(user: User | undefined) {
        user ? this.#store.set('user', user) : this.#store.delete('user');
        this.#eventEmitter.emit('user', user);
    }

    set connectId(connectId: string) {
        this.#connectId = connectId;
        const user = this.user;

        this.#updateUser(undefined);

        // tries to login with new connectId
        if (user) {
            this.login(user.did).catch(e => {
                console.log('User no longer authenticated:', e);
            });
        }
    }

    async login(did: string): Promise<User> {
        try {
            const result = parsePkhDid(did);

            const credential = await this.#getCredential(
                result.address,
                result.chainId,
                this.#connectId,
            );
            if (!credential) {
                this.#updateUser(undefined);
                throw new Error('Credential not found');
            }
            const user: User = {
                ...result,
                did,
                credential,
            };

            getEnsInfo(user.address, user.chainId)
                .then(ens => {
                    if (
                        this.user?.address === user.address &&
                        this.user.chainId === user.chainId
                    ) {
                        this.#updateUser({ ...this.user, ens });
                    }
                })
                .catch(logger.error);

            this.#updateUser(user);
            return user;
        } catch (error) {
            logger.error(error);
            this.#updateUser(undefined);
            throw error;
        }
    }

    logout() {
        this.#updateUser(undefined);
    }

    on(event: 'user', listener: (user: User) => void) {
        this.#eventEmitter.on(event, listener);
        return () => {
            this.#eventEmitter.removeListener(event, listener);
        };
    }

    async #getCredential(
        address: string,
        chainId: number,
        connectId: string,
    ): Promise<PowerhouseVerifiableCredential | undefined> {
        if (!this.#baseUrl) {
            throw new Error('RENOWN_URL is not set');
        }
        const url = new URL(
            `/api/auth/credential?address=${encodeURIComponent(address)}&chainId=${encodeURIComponent(chainId)}&connectId=${encodeURIComponent(connectId)}`,
            this.#baseUrl,
        );
        const response = await fetch(url, {
            method: 'GET',
        });
        if (response.ok) {
            const result = (await response.json()) as {
                credential: PowerhouseVerifiableCredential;
            };
            return result.credential;
        } else {
            throw new Error('Failed to get credential');
        }
    }
}

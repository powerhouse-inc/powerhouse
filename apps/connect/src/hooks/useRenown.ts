import {
    RENOWN_CHAIN_ID,
    RENOWN_NETWORK_ID,
    type IRenown,
    type User,
} from '#services';
import { createAuthBearerToken } from '@renown/sdk';
import { atom, useAtom } from 'jotai';
import { useEffect } from 'react';
import { useUnwrappedReactor } from '../store/reactor.js';
import { useConnectCrypto } from './useConnectCrypto.js';
import { useUser } from '../store/user.js';

const renownAtom = atom<Promise<IRenown | undefined> | undefined>(
    window.renown ? Promise.resolve(window.renown) : undefined,
);

export function useRenown() {
    const [renown, setRenown] = useAtom(renownAtom);
    const { did, getBearerToken } = useConnectCrypto();
    
    const reactor = useUnwrappedReactor();
    useEffect(() => {
        if (!renown || !reactor || !did) {
            return;
        }

        reactor.setGenerateJwtHandler(getBearerToken);
    }, [renown, reactor]);



    async function initRenown(
        getDid: () => Promise<string>,
    ): Promise<IRenown | undefined> {
        const did = await getDid();
        if (!did) {
            return;
        }
        const { initRenownBrowser } = await import('#services');
        const renownBrowser = initRenownBrowser(did);
        const renown: IRenown = {
            user: function (): Promise<User | undefined> {
                return Promise.resolve(renownBrowser.user);
            },
            login: function (did: string): Promise<User | undefined> {
                return renownBrowser.login(did);
            },
            logout() {
                return Promise.resolve(renownBrowser.logout());
            },
            on: {
                user(cb) {
                    return renownBrowser.on('user', cb);
                },
            },
        };
        return renown;
    }

    if (!renown) {
        setRenown(initRenown(did));
    }

    return renown;
}

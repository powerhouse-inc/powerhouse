import { type IRenown, type User } from '#services';
import { atom, useAtom } from 'jotai';
import { useEffect } from 'react';
import { atomStore } from '../store/index.js';
import { reactorAtom } from '../store/reactor.js';
import { useConnectCrypto } from './useConnectCrypto.js';

export type RenownStatus = 'idle' | 'loading' | 'finished' | 'error';
export const renownStatusAtom = atom<RenownStatus>('idle');

export const renownAtom = atom<Promise<IRenown | undefined> | undefined>(
    window.renown ? Promise.resolve(window.renown) : undefined,
);

export function useRenown() {
    const [renown, setRenown] = useAtom(renownAtom);
    const [, setRenownStatus] = useAtom(renownStatusAtom);
    const { did, getBearerToken } = useConnectCrypto();

    useEffect(() => {
        if (!renown || !did) {
            return;
        }

        // Get reactor programmatically instead of using the hook
        atomStore
            .get(reactorAtom)
            .then(reactor => {
                return reactor;
            })
            .then(reactor => {
                if (!reactor) return;
                return renown.user().then(user => ({ reactor, user }));
            })
            .then(result => {
                if (!result) return;
                const { reactor, user } = result;
                if (!user) return;

                const address = user.address;
                if (typeof address !== 'string') return;

                reactor.setGenerateJwtHandler(async driveUrl =>
                    getBearerToken(driveUrl, address),
                );
            })
            .catch(err => console.error(err));
    }, [renown, did]);

    async function initRenown(
        getDid: () => Promise<string>,
    ): Promise<IRenown | undefined> {
        setRenownStatus('loading');
        try {
            const did = await getDid();
            if (!did) {
                setRenownStatus('error');
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
                    return atomStore.get(reactorAtom).then(reactor => {
                        reactor.removeJwtHandler();
                        return renownBrowser.logout();
                    });
                },
                on: {
                    user(cb) {
                        return renownBrowser.on('user', cb);
                    },
                },
            };
            setRenownStatus('finished');
            return renown;
        } catch (err) {
            console.error(
                'Error initializing renown:',
                err instanceof Error ? err.message : 'Unknown error',
            );
            setRenownStatus('error');
            return undefined;
        }
    }

    if (!renown) {
        setRenown(initRenown(did));
    }

    return renown;
}

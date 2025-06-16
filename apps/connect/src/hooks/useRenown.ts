import { atom, useAtom } from 'jotai';
import { type IRenown, type User } from '../services/renown/index.js';
import { useConnectCrypto } from './useConnectCrypto.js';

export type RenownStatus = 'idle' | 'loading' | 'finished' | 'error';
export const renownStatusAtom = atom<RenownStatus>('idle');

export const renownAtom = atom<Promise<IRenown | undefined> | undefined>(
    window.renown ? Promise.resolve(window.renown) : undefined,
);

export function useRenown() {
    const [renown, setRenown] = useAtom(renownAtom);
    const [renownStatus, setRenownStatus] = useAtom(renownStatusAtom);
    const { did } = useConnectCrypto();

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
            const { initRenownBrowser } = await import(
                '../services/renown/index.js'
            );
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

    if (!renown && renownStatus === 'idle') {
        setRenown(initRenown(did));
    }

    return renown;
}

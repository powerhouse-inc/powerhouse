import { type IRenown, type User } from '#services';
import { atom, useAtom } from 'jotai';
import { useConnectCrypto } from './useConnectCrypto.js';

export type RenownStatus = 'idle' | 'loading' | 'finished' | 'error';
export const renownStatusAtom = atom<RenownStatus>('idle');
renownStatusAtom.debugLabel = 'renownStatusAtom';

export const renownAtom = atom<Promise<IRenown | undefined> | undefined>(
    undefined,
);
renownAtom.debugLabel = 'renownAtom';

export function useRenown() {
    const [renown, setRenown] = useAtom(renownAtom);
    const [, setRenownStatus] = useAtom(renownStatusAtom);
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

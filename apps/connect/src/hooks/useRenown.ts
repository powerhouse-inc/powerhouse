import { type IRenown, type User } from '#services';
import { atom, useAtom } from 'jotai';
import { useConnectCrypto } from './useConnectCrypto.js';

const renownAtom = atom<Promise<IRenown | undefined> | undefined>(
    window.renown ? Promise.resolve(window.renown) : undefined,
);

export function useRenown() {
    const [renown, setRenown] = useAtom(renownAtom);
    const { did } = useConnectCrypto();

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

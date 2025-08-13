import { logger } from 'document-drive';
import { useEffect, useState } from 'react';
import { useIsMounted } from 'usehooks-ts';
import { type IRenown, type User } from '../services/renown/index.js';
import { useConnectCrypto } from './useConnectCrypto.js';

export type RenownStatus = 'idle' | 'loading' | 'finished' | 'error';

export function useRenown() {
    const [renown, setRenown] = useState<IRenown | undefined>(undefined);
    const [renownStatus, setRenownStatus] = useState<RenownStatus>('idle');
    const { did } = useConnectCrypto();

    useEffect(() => {
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
            initRenown(did).then(setRenown).catch(logger.error);
        }
    }, [did, renown, renownStatus]);

    return renown;
}

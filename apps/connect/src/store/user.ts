import { useRenown } from '#hooks';
import type { User } from '#services';
import {
    setUser as setSentryUser,
    type User as SentryUser,
} from '@sentry/react';
import { atom, useAtom } from 'jotai';
import { useEffect } from 'react';

let userInit = false;

const userAtom = atom<User | null | undefined>(undefined);
userAtom.debugLabel = 'userAtomInConnect';

export const useUser = () => {
    const [user, setUser] = useAtom(userAtom);
    const renown = useRenown();

    useEffect(() => {
        let sentryUser: SentryUser | null = null;
        if (user) {
            // saves the user info except the credential
            const { credential, ...rest } = user;
            sentryUser = { id: rest.did, username: rest.ens?.name, ...rest };
        }
        setSentryUser(sentryUser);
    }, [user]);

    useEffect(() => {
        if (userInit) return;
        userInit = true;
        renown
            ?.user()
            .then(user => {
                setUser(user || null);
            })
            .catch(() => {
                setUser(null);
            });

        const unsub = renown?.on.user(user => {
            setUser(user || null);
        });

        return () => {
            unsub?.();
            userInit = false;
        };
    }, [renown, userInit]);

    return user;
};

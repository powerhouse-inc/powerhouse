import {
    setUser as setSentryUser,
    type User as SentryUser,
} from '@sentry/react';
import { atom, useAtom } from 'jotai';
import { useEffect } from 'react';
import { useRenown } from 'src/hooks/useRenown';
import type { User } from 'src/services/renown/types';

let userInit = false;

const userAtom = atom<User | undefined>(undefined);

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
                setUser(user);
            })
            .catch(() => {
                setUser(undefined);
            });

        const unsub = renown?.on.user(user => {
            setUser(user);
        });

        return () => {
            unsub?.();
            userInit = false;
        };
    }, [renown, userInit]);

    return user;
};

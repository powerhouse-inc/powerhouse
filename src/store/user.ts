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

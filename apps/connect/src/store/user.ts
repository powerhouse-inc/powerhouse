import { useEffect, useState } from 'react';
import { useRenown } from 'src/hooks/useRenown';
import type { User } from 'src/services/renown/types';

export const useUser = () => {
    const [user, setUser] = useState<User | undefined>(undefined);
    const renown = useRenown();

    useEffect(() => {
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

        return unsub;
    }, [renown]);

    return user;
};

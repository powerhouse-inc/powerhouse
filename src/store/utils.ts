import { atomWithStorage } from 'jotai/utils';

export const atomWithStorageCallback = <T>(
    key: string,
    initialValue: T,
    callback: (value: T) => void
) =>
    atomWithStorage<T>(key, initialValue, {
        getItem(key, initialValue) {
            const value = localStorage.getItem(key);
            return value ? (JSON.parse(value) as T) : initialValue;
        },
        setItem(key, value) {
            localStorage.setItem(key, JSON.stringify(value));
            callback(value);
        },
        removeItem(key) {
            localStorage.removeItem(key);
        },
        subscribe(key, callback) {
            if (
                typeof window === 'undefined' ||
                typeof window.addEventListener === 'undefined'
            ) {
                return () => null;
            }

            function listener(e: StorageEvent) {
                if (e.storageArea === localStorage && e.key === key) {
                    callback((e.newValue ?? '') as T);
                }
            }
            window.addEventListener('storage', listener);

            return () => window.removeEventListener('storage', listener);
        },
    });

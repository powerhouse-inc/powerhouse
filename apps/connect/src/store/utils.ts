// import connectConfig from '#connect-config';

// import { atomWithStorage as _atomWithStorage } from 'jotai/utils';
// import type { SyncStorage } from 'jotai/vanilla/utils/atomWithStorage';

// const namespace = connectConfig.routerBasename;

// export const atomWithStorage = <T>(
//     key: string,
//     initialValue: T,
//     storage?: SyncStorage<T>,
//     options?: {
//         getOnInit?: boolean;
//     },
// ) => {
//     const atom = _atomWithStorage<T>(
//         `${namespace}:${key}`,
//         initialValue,
//         storage ? storage : undefined,
//         options,
//     );
//     atom.debugLabel = `storageAtom:${namespace}:${key}`;
//     return atom;
// };

// export const atomWithStorageCallback = <T>(
//     key: string,
//     initialValue: T,
//     callback: (value: T) => void,
// ) => {
//     const atom = _atomWithStorage<T>(key, initialValue, {
//         getItem(key, initialValue) {
//             const value = localStorage.getItem(`${namespace}:${key}`);
//             return value ? (JSON.parse(value) as T) : initialValue;
//         },
//         setItem(key, value) {
//             localStorage.setItem(`${namespace}:${key}`, JSON.stringify(value));
//             callback(value);
//         },
//         removeItem(key) {
//             localStorage.removeItem(`${namespace}:${key}`);
//         },
//         subscribe(key, callback) {
//             if (typeof window.addEventListener === 'undefined') {
//                 return () => null;
//             }

//             function listener(e: StorageEvent) {
//                 if (
//                     e.storageArea === localStorage &&
//                     e.key === `${namespace}:${key}`
//                 ) {
//                     callback((e.newValue ?? '') as T);
//                 }
//             }
//             window.addEventListener('storage', listener);

//             return () => window.removeEventListener('storage', listener);
//         },
//     });
//     atom.debugLabel = `storageAtomWithCallback:${namespace}:${key}`;
//     return atom;
// };

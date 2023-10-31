import { useAtomValue } from 'jotai';
import { atomWithStorageCallback } from './utils';

export type Theme = 'light' | 'dark';
export const themeAtom = atomWithStorageCallback<Theme>(
    'theme',
    'light',
    theme => {
        if (typeof window !== 'undefined') {
            window.electronAPI?.setTheme(theme);
        }
    }
);

export const useTheme = () => useAtomValue(themeAtom);

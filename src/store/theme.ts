import { useAtomValue } from 'jotai';
import { atomWithStorageCallback } from './utils';

const THEMES = ['light', 'dark'] as const;

export type Theme = (typeof THEMES)[number];

export const themeAtom = atomWithStorageCallback<Theme>(
    'theme',
    'light',
    theme => {
        if (typeof window !== 'undefined') {
            window.electronAPI?.setTheme(theme);
        }
    },
);

export const useTheme = () => useAtomValue(themeAtom);

export function isTheme(theme: string): theme is Theme {
    return THEMES.includes(theme);
}

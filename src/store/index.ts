import { atom, useAtomValue } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
type Theme = 'light' | 'dark';

export const themeAtom = atomWithStorage<Theme>('theme', 'dark');

export const sidebarCollapsedAtom = atomWithStorage('sidebar-collapsed', false);

export const userAtom = atom<string | undefined>(undefined);

export const useTheme = () => useAtomValue(themeAtom);

export default { themeAtom, sidebarCollapsedAtom, userAtom };

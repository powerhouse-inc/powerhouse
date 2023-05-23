import { atomWithStorage } from 'jotai/utils';
type Theme = 'light' | 'dark';

export const themeAtom = atomWithStorage<Theme>('theme', 'dark');

export const sidebarCollapsedAtom = atomWithStorage('sidebar-collapsed', false);

export default { themeAtom, sidebarCollapsedAtom };

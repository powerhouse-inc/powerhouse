import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { themeAtom } from './theme';

export const sidebarCollapsedAtom = atomWithStorage('sidebar-collapsed', false);
export const sidebarDisableHoverStyles = atom(false);

export const userAtom = atom<string | undefined>(undefined);

export * from './document-drive';
export * from './tabs';
export * from './theme';
export default { themeAtom, sidebarCollapsedAtom, userAtom };

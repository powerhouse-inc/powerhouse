import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { userAtom } from './user';

export const sidebarCollapsedAtom = atomWithStorage('sidebar-collapsed', false);
export const sidebarDisableHoverStyles = atom(false);

export * from './theme';
export default { sidebarCollapsedAtom, userAtom };

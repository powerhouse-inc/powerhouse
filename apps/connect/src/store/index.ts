import { atom } from 'jotai';
import { atomWithStorage } from 'src/store/utils';

export const sidebarCollapsedAtom = atomWithStorage('sidebar-collapsed', false);
export const sidebarDisableHoverStyles = atom(false);

export * from './theme';
export default { sidebarCollapsedAtom };

import { atom, createStore } from 'jotai';
import { atomWithStorage } from 'src/store/utils';
import { themeAtom } from './theme';

export type Store = ReturnType<typeof createStore>;

export const atomStore: Store = createStore();

export const sidebarCollapsedAtom = atomWithStorage('sidebar-collapsed', false);
export const sidebarDisableHoverStyles = atom(false);

export * from './theme';
export default { sidebarCollapsedAtom, themeAtom };

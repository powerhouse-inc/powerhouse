import { atom, createStore } from 'jotai';
import { themeAtom } from './theme';

export type Store = ReturnType<typeof createStore>;

export const atomStore: Store = createStore();

export const sidebarDisableHoverStyles = atom(false);

export * from './theme';
export default { themeAtom };

import { atom, createStore } from 'jotai';
import { themeAtom } from './theme.js';

export type Store = ReturnType<typeof createStore>;

export const atomStore: Store = createStore();

export const sidebarDisableHoverStyles = atom(false);

export const atoms = {
    themeAtom,
};

export * from './document-drive.js';
export * from './document-model.js';
export * from './editor.js';
export * from './external-packages.js';
export * from './reactor.js';
export * from './theme.js';
export * from './user.js';
export * from './utils.js';


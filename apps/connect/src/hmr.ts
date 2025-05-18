import type { ViteHotContext } from 'vite/types/hot.js';

export const hmr = import.meta.hot as ViteHotContext | undefined;

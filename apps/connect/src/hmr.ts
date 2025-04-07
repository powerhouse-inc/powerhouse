import type { ViteHotContext } from 'vite-envs/types/hot';

// CI fails without type assertion
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
export const hmr = import.meta.hot as ViteHotContext | undefined;

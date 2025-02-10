export async function getHMRModule() {
    // if running connect in dev mode then use its hmr
    if (import.meta.hot) {
        return import.meta.hot;
    }
    try {
        const module = await import('PH:HMR_MODULE');
        const hmr = module.default;
        return hmr;
    } catch {
        return undefined;
    }
}

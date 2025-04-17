import connectConfig from '#connect-config';
import { type IAnalyticsStore } from '@powerhousedao/reactor-browser/analytics';
import { atom, useAtomValue } from 'jotai';
import { atomWithLazy, unwrap } from 'jotai/utils';

async function createAnalyticsStore() {
    const { BrowserAnalyticsStore } = await import(
        '@powerhousedao/reactor-browser/analytics/store/browser'
    );
    const store = new BrowserAnalyticsStore({
        databaseName: `${connectConfig.routerBasename}:analytics`,
    });
    await store.init();
    return store;
}

export const analyticsStoreAtom =
    atomWithLazy<Promise<IAnalyticsStore>>(createAnalyticsStore);

const unwrappedAnalyticsStore = unwrap(analyticsStoreAtom);

// blocks rendering until analytics store is initialized
export const useAnalyticsStore = (): IAnalyticsStore | undefined =>
    useAtomValue(analyticsStoreAtom);

// will return undefined until analytics store is initialized. Does not block rendering.
export const useUnwrappedAnalyticsStore = (): IAnalyticsStore | undefined =>
    useAtomValue(unwrappedAnalyticsStore);

// will return undefined until analytics store is initialized. Does not block rendering or trigger initialization
export const useAsyncAnalyticsStore = (): IAnalyticsStore | undefined =>
    useAtomValue(analyticsAsyncAtom);

const analyticsAsyncAtom = atom<IAnalyticsStore | undefined>(undefined);
analyticsAsyncAtom.onMount = setAtom => {
    const baseOnMount = analyticsStoreAtom.onMount;
    analyticsStoreAtom.onMount = setStoreAtom => {
        setStoreAtom(storePromise => {
            storePromise.then(store => setAtom(store)).catch(console.error);
            return storePromise;
        });
        return baseOnMount?.(setStoreAtom);
    };
};

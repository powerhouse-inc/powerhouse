import Store from 'electron-store';
import type { User } from '../services/renown/types';
import type { Theme } from '../store/theme';

type StoreType = {
    user?: User | undefined;
    theme: Theme;
};

const store = new Store<StoreType>({ defaults: { theme: 'light' } });

// only allow typed setter
type TypedStore = Omit<typeof store, 'set'> & {
    set<Key extends keyof StoreType>(key: Key, value?: StoreType[Key]): void;
};

export default store as TypedStore;

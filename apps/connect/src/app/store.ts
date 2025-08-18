// import { type User } from '@renown/sdk';
// import Store from 'electron-store';

// type StoreType = {
//     user?: User | undefined;
//     theme: 'light' | 'dark';
// };

// const store = new Store<StoreType>({ defaults: { theme: 'light' } });

// // only allow typed setter
// type TypedStore = Omit<typeof store, 'set'> & {
//     set<Key extends keyof StoreType>(key: Key, value?: StoreType[Key]): void;
// };

// export default store as TypedStore;

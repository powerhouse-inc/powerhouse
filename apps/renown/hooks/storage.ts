import { atom, useAtomValue } from "jotai";
import { LocalStorage } from "../services/local-storage";

export interface ISafeStorage {
    save(key: string, value: unknown): Promise<void>;
    load<T>(key: string): Promise<T | undefined>;
    delete(key: string): Promise<void>;
}

const safeStorage = new LocalStorage();
const safeStorageAtom = atom<ISafeStorage>(safeStorage);

export const useSafeStorage = () => useAtomValue(safeStorageAtom);

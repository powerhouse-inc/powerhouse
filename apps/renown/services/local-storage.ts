import type { ISafeStorage } from "../hooks/storage";

export class LocalStorage implements ISafeStorage {
    static #STORE_NAME = "safeStorage";

    static #buildKey(key: string): string {
        return `${LocalStorage.#STORE_NAME}:${key}`;
    }

    async save(key: string, value: unknown): Promise<void> {
        localStorage.setItem(
            LocalStorage.#buildKey(key),
            JSON.stringify(value)
        );
    }

    async load<T>(key: string): Promise<T | undefined> {
        const value = localStorage.getItem(LocalStorage.#buildKey(key));
        if (!value) {
            return undefined;
        }
        return JSON.parse(value) as T;
    }

    async delete(key: string): Promise<void> {
        localStorage.removeItem(LocalStorage.#buildKey(key));
    }
}

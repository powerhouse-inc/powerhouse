import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useMemo } from "react";
import { useConfig } from "./config.js";

export function useNamespacedStorageAtom<T>(key: string, initial: T) {
  const { routerBasename } = useConfig();
  const storageAtom = useMemo(
    () => atomWithStorage<T>(`${routerBasename}:${key}`, initial),
    [routerBasename, key, initial],
  );
  storageAtom.debugLabel = `storageAtom:${key}`;
  return useAtom(storageAtom);
}

const namespace = "TODO REPLACE IF NEEDED";

const atomWithStorageCallback = <T>(
  key: string,
  initialValue: T,
  callback: (value: T) => void,
) =>
  atomWithStorage<T>(key, initialValue, {
    getItem(key, initialValue) {
      const value = localStorage.getItem(`${namespace}:${key}`);
      return value ? (JSON.parse(value) as T) : initialValue;
    },
    setItem(key, value) {
      localStorage.setItem(`${namespace}:${key}`, JSON.stringify(value));
      callback(value);
    },
    removeItem(key) {
      localStorage.removeItem(`${namespace}:${key}`);
    },
    subscribe(key, callback) {
      if (typeof window.addEventListener === "undefined") {
        return () => null;
      }

      function listener(e: StorageEvent) {
        if (e.storageArea === localStorage && e.key === `${namespace}:${key}`) {
          callback((e.newValue ?? "") as T);
        }
      }
      window.addEventListener("storage", listener);

      return () => window.removeEventListener("storage", listener);
    },
  });

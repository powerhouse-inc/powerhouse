import { getAdminUsers } from "./getters.js";

/** @deprecated Nothing reads it; read `ADMIN_USERS` at your own edge. Reads env on each access. */
export const ADMIN_USERS: readonly string[] = new Proxy<string[]>([], {
  get: (_target, key): unknown => Reflect.get(getAdminUsers(), key),
  has: (_target, key) => Reflect.has(getAdminUsers(), key),
  ownKeys: () => Reflect.ownKeys(getAdminUsers()),
  getOwnPropertyDescriptor: (_target, key) =>
    Reflect.getOwnPropertyDescriptor(getAdminUsers(), key),
});

import { createStore } from "jotai";

/** The atom store for the app.
 *
 * All derived hooks should use this store.
 */
export const atomStore = createStore();

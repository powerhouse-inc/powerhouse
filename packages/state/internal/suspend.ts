/* Will suspend until the atom is set elsewhere.
 * Returns a promise that will never resolve of type T.
 *
 * Makes use of Jotai's "async forever" pattern as described here https://jotai.org/docs/guides/async#async-forever
 */
export function suspendUntilSet<T>(): Promise<T> {
  return new Promise(() => {});
}

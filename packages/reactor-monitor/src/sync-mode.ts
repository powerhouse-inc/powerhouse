/**
 * Whether `sync.local` asks for a lone local factory with no gql. Strict: a
 * descriptor can arrive over `postMessage`, so anything but a boolean is refused.
 *
 * @throws Error if `local` is neither a boolean nor absent
 */
export function isLocalOnlySync(local: unknown): boolean {
  if (local === undefined || typeof local === "boolean") {
    return local === true;
  }
  throw new Error(
    `Invalid sync configuration: local must be a boolean or absent, got ${typeof local}`,
  );
}

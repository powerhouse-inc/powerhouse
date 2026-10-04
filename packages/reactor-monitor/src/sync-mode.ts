/**
 * The ONE read of the local-ONLY sync mode, shared by `build-reactor.ts` (which
 * acts on it) and `capabilities.ts` (which describes it).
 *
 * `sync.local` / `localSync` selects a reactor built on a lone
 * `LocalChannelFactory`: deliberately Switchboard- and GraphQL-free
 * (multi-reactor W1.2), and NOT what a reactor needs in order to adopt brokered
 * local peers -- a gql-scheme reactor composes a local factory onto its scheme
 * (W3.0) and serves both.
 *
 * Strict, and validated at the descriptor boundary rather than coerced at each
 * reader: a descriptor can arrive from another realm over `postMessage`
 * (`parseWorkerConstruct`), so an untyped truthy value is a malformed
 * descriptor, not a request for local-only. Two readers each spelling their own
 * truthiness test is how the builder and the contract it declares drift apart.
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

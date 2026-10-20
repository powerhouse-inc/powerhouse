/**
 * Output tokens (typed-host-configs G3) live in
 * `@powerhousedao/shared/host-tokens` (zod only, platform-neutral), so
 * Connect's config schema in shared can make its fields token-able without
 * a dependency cycle. host-core re-exports them unchanged: its public API
 * (`.`, `./schema`) is the same as before the move.
 */
export * from "@powerhousedao/shared/host-tokens";

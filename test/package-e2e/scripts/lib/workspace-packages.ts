/**
 * Workspace packages that should be re-published to the local registry from
 * source (so docker containers exercise local code, not whatever happens to
 * be on npmjs at the @dev tag).
 *
 * Mirrors the build-filter list in the root package.json, minus
 * private/test-only ones. Used by:
 *   - publish-workspace.ts (the publish targets)
 *   - run.ts (the --local-packages arg passed to ph-registry, so verdaccio
 *     resolves these locally rather than proxying npmjs)
 *
 * Order doesn't matter — verdaccio config builds an exact-match-first
 * matcher anyway. Just keep the list flat (no `@powerhousedao/*` glob),
 * because that glob also matches third-party packages owned by
 * @powerhousedao on npmjs (e.g. document-engineering) that are NOT in this
 * workspace; broad-globbing them as local-only makes their install fail.
 */
export const WORKSPACE_PUBLISH_PACKAGES = [
  "@powerhousedao/config",
  "@powerhousedao/common",
  "@powerhousedao/builder-tools",
  "@powerhousedao/codegen",
  "document-model",
  "@powerhousedao/design-system",
  "@powerhousedao/pglite-fs",
  "@powerhousedao/reactor-api",
  "@powerhousedao/reactor-attachments",
  "@powerhousedao/reactor-browser",
  "@powerhousedao/reactor",
  "@powerhousedao/reactor-hypercore",
  "@powerhousedao/reactor-mcp",
  "@powerhousedao/opentelemetry-instrumentation-reactor",
  "@powerhousedao/registry",
  "@powerhousedao/shared",
  "@powerhousedao/vetra",
  "@powerhousedao/powerhouse-vetra-packages",
  "@powerhousedao/analytics-engine-browser",
  "@powerhousedao/analytics-engine-core",
  "@powerhousedao/analytics-engine-graphql",
  "@powerhousedao/analytics-engine-knex",
  "@powerhousedao/analytics-engine-pg",
  "@powerhousedao/connect",
  "@powerhousedao/switchboard",
  "@powerhousedao/ph-cli",
  "ph-cmd",
] as const;

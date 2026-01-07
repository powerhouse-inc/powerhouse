export const POWERHOUSE_ORG = "@powerhousedao";

/** Special packages that don't use the @powerhousedao organization */
export const SPECIAL_PACKAGES = [
  "document-model",
  "document-drive",
  "@renown/sdk",
];

/** Packages to exclude from version resolution (external dependencies) */
export const EXCLUDED_PACKAGES = [
  "@powerhousedao/document-engineering",
  "@powerhousedao/scalars",
  "@powerhousedao/diff-analyzer",
  "@powerhousedao/analytics-engine-core",
  "@powerhousedao/analytics-engine-graphql",
  "@powerhousedao/analytics-engine-pg",
  "@powerhousedao/analytics-engine-browser",
  "@powerhousedao/analytics-engine-knex",
];

/** Version tags that should be resolved to actual versions */
export const VERSION_TAGS = ["dev", "staging", "latest"];

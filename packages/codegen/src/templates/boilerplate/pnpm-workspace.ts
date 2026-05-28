import {
  BOILERPLATE_ALLOWED_BUILDS,
  BOILERPLATE_PNPM_OVERRIDES,
} from "@powerhousedao/shared/clis";

// Allowlists transitive postinstall scripts so `pnpm install` does not fail
// under pnpm 11's `strict-dep-builds=true` (which promotes the
// ERR_PNPM_IGNORED_BUILDS warning to an error). pnpm 10 also reads this map.
const allowBuildsBody = BOILERPLATE_ALLOWED_BUILDS.map(
  (pkg) => `  ${/[@/]/.test(pkg) ? `"${pkg}"` : pkg}: true`,
).join("\n");

// Forces single versions of duplicate-prone transitive deps (see constants).
const overridesBody = Object.entries(BOILERPLATE_PNPM_OVERRIDES)
  .map(
    ([pkg, version]) =>
      `  ${/[@/]/.test(pkg) ? `"${pkg}"` : pkg}: "${version}"`,
  )
  .join("\n");

export const pnpmWorkspaceTemplate = `allowBuilds:\n${allowBuildsBody}\noverrides:\n${overridesBody}\n`;

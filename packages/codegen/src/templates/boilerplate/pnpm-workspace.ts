import {
  BOILERPLATE_ALLOWED_BUILDS,
  BOILERPLATE_DEPENDENCY_OVERRIDES,
} from "@powerhousedao/shared/clis";

// Allowlists transitive postinstall scripts so `pnpm install` does not fail
// under pnpm 11's `strict-dep-builds=true` (which promotes the
// ERR_PNPM_IGNORED_BUILDS warning to an error). pnpm 10 also reads this map.
const allowBuildsBody = BOILERPLATE_ALLOWED_BUILDS.map(
  (pkg) => `  ${/[@/]/.test(pkg) ? `"${pkg}"` : pkg}: true`,
).join("\n");

// Forces single versions of duplicate-prone transitive deps (see constants).
const overridesBody = Object.entries(BOILERPLATE_DEPENDENCY_OVERRIDES)
  .map(
    ([pkg, version]) =>
      `  ${/[@/]/.test(pkg) ? `"${pkg}"` : pkg}: "${version}"`,
  )
  .join("\n");

// pnpm 11 defaults `minimumReleaseAge` to 1440 minutes. `ph init` resolves a
// fresh lockfile, so any dependency npm published in the last day — the
// @powerhousedao line on a release day, but third-party transitives just as
// often — makes every later pnpm command in the generated project fail the
// lockfile policy check. `migrate` already sidesteps this with
// `--config.minimumReleaseAge=0`; the boilerplate needs it persisted, since
// the check runs on each script invocation, not just on install. The exclude
// list records intent: pnpm 11.5's lockfile verifier ignores it, so the gate
// has to be off for the value to hold.
const releaseAgeBody = `minimumReleaseAge: 0
minimumReleaseAgeExclude:
${["@powerhousedao/*", "@renown/*", "document-model"]
  .map((pkg) => `  - ${/[@/]/.test(pkg) ? `"${pkg}"` : pkg}`)
  .join("\n")}`;

export const pnpmWorkspaceTemplate = `allowBuilds:\n${allowBuildsBody}\noverrides:\n${overridesBody}\n${releaseAgeBody}\n`;

import { packageJsonExports } from "@powerhousedao/shared/clis";
import { json } from "@tmpl/core";

function innerJsonBody(value: object): string {
  return JSON.stringify(value, null, 2).slice(2, -2).trimEnd();
}

function sortedJsonBody(value: Record<string, string>): string {
  const sorted = Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
  );
  return innerJsonBody(sorted);
}

export const exportsTemplate = innerJsonBody(packageJsonExports);

// Maps a bare-name override map (as pnpm `overrides` use) to yarn v1
// `resolutions` form; the `**/` prefix applies the pin to transitive
// occurrences. Yarn v1 cannot pin the project's own direct dependencies
// (bare names normalize to `**/`, and root requests carry no parent
// path for it to match), so a direct dep keeps resolving within its
// declared range while transitive occurrences stay pinned.
export function toYarnResolutions(
  overrides: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(overrides).map(([pkg, version]) => [`**/${pkg}`, version]),
  );
}

export const packageJsonTemplate = (
  projectName: string,
  peerDependencies: Record<string, string>,
  devDependencies: Record<string, string>,
  resolutions?: Record<string, string>,
) => {
  // Leading comma: the block follows the devDependencies close brace.
  const resolutionsBody = resolutions
    ? `,\n  "resolutions": {
    ${sortedJsonBody(resolutions)}
  }`
    : "";
  return json`
{
  "name": "${projectName}",
  "version": "1.0.0",
  "license": "AGPL-3.0-only",
  "type": "module",
  "files": [
    "/dist"
  ],
  "sideEffects": false,
  "exports": {
    ${exportsTemplate}
  },
  "scripts": {
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage --passWithNoTests",
    "lint": "oxlint --type-aware --type-check",
    "lint:fix": "oxlint --type-aware --type-check --fix",
    "format": "oxfmt",
    "format:check": "oxfmt --check",
    "tsc": "tsc",
    "tsc:watch": "tsc --watch",
    "check-circular-imports": "npx dpdm -T ./index.ts",
    "generate": "ph-cli generate",
    "connect": "ph-cli connect",
    "build": "ph-cli build",
    "reactor": "ph-cli reactor",
    "service": "ph-cli service",
    "vetra": "ph-cli vetra",
    "service-startup": "bash ./node_modules/@powerhousedao/ph-cli/dist/scripts/service-startup.sh",
    "service-unstartup": "bash ./node_modules/@powerhousedao/ph-cli/dist/scripts/service-unstartup.sh"
  },
  "peerDependencies": {
    ${sortedJsonBody(peerDependencies)}
  },
  "devDependencies": {
    ${sortedJsonBody(devDependencies)}
  }${resolutionsBody}
}
`.raw;
};

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

// The `**/`-prefixed `resolutions` keys scaffolds wrote before bare names.
// Only yarn 1 and bun read them: pnpm 9 and 10 reject them, while npm, yarn 4
// and pnpm 11 and later ignore them. `ph migrate` replaces them.
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
  overrides?: Record<string, string>,
) => {
  // Leading comma: each block follows the previous close brace.
  const block = (key: string, body?: Record<string, string>) =>
    body
      ? `,\n  "${key}": {
    ${sortedJsonBody(body)}
  }`
      : "";
  const pinBlocks =
    block("overrides", overrides) + block("resolutions", resolutions);
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
    "lint": "ph-cli generate connect-routes && oxlint --type-aware --type-check",
    "lint:fix": "ph-cli generate connect-routes && oxlint --type-aware --type-check --fix",
    "format": "oxfmt",
    "format:check": "oxfmt --check",
    "tsc": "ph-cli generate connect-routes && tsc",
    "tsc:watch": "tsc --watch",
    "check-circular-imports": "npx dpdm -T ./index.ts",
    "generate": "ph-cli generate",
    "connect": "ph-cli connect",
    "build": "ph-cli build",
    "reactor": "ph-cli reactor",
    "service": "ph-cli service",
    "vetra": "ph-cli vetra",
    "mcp": "ph-cli mcp",
    "service-startup": "bash ./node_modules/@powerhousedao/ph-cli/dist/scripts/service-startup.sh",
    "service-unstartup": "bash ./node_modules/@powerhousedao/ph-cli/dist/scripts/service-unstartup.sh"
  },
  "peerDependencies": {
    ${sortedJsonBody(peerDependencies)}
  },
  "devDependencies": {
    ${sortedJsonBody(devDependencies)}
  }${pinBlocks}
}
`.raw;
};

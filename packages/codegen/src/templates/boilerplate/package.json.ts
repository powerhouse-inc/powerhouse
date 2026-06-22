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

export const packageJsonTemplate = (
  projectName: string,
  peerDependencies: Record<string, string>,
  devDependencies: Record<string, string>,
) =>
  json`
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
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint --config eslint.config.js --cache --cache-strategy content",
    "lint:fix": "npm run lint -- --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
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
  }
}
`.raw;

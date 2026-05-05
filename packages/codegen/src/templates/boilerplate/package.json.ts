import { json } from "@tmpl/core";
import {
  externalDependencies,
  externalDevDependencies,
  packageJsonExports,
} from "../../file-builders/constants.js";

/**
 * Renders a JS object as the inner body of a JSON object
 */
function innerJsonBody(value: object): string {
  return JSON.stringify(value, null, 2).slice(2, -2).trimEnd();
}

export const exportsTemplate = innerJsonBody(packageJsonExports);

const externalDepsTemplate = innerJsonBody(externalDependencies);
const externalDevDepsTemplate = innerJsonBody(externalDevDependencies);

const scriptsTemplate = json`
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "lint": "eslint --config eslint.config.js --cache --cache-strategy content",
  "lint:fix": "npm run lint -- --fix",
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
`.raw;

const dependenciesTemplate = (versionedDependencies: string[]) =>
  json`
  ${versionedDependencies.join(",\n  ")},
${externalDepsTemplate}
`.raw;

const devDependenciesTemplate = (versionedDevDependencies: string[]) =>
  json`
  ${versionedDevDependencies.join(",\n  ")},
${externalDevDepsTemplate}
`.raw;

export const packageJsonTemplate = (
  projectName: string,
  versionedDependencies: string[],
  versionedDevDependencies: string[],
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
    ${scriptsTemplate}
  },
  "dependencies": {
    ${dependenciesTemplate(versionedDependencies)}
  },
  "devDependencies": {
    ${devDependenciesTemplate(versionedDevDependencies)}
  }
}
`.raw;

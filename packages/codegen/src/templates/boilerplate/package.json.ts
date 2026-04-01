import { json } from "@tmpl/core";

export const exportsTemplate = json`
  ".": {
    "types": "./dist/index.d.ts",
    "browser": "./dist/browser/index.js",
    "node": "./dist/node/index.mjs"
  },
  "./document-models": {
    "types": "./dist/document-models/index.d.ts",
    "browser": "./dist/browser/document-models/index.js",
    "node": "./dist/node/document-models/index.mjs"
  },
  "./document-models/*": {
    "types": "./dist/document-models/*/index.d.ts",
    "browser": "./dist/browser/document-models/*/index.js",
    "node": "./dist/node/document-models/*/index.mjs"
  },
  "./editors": {
    "types": "./dist/editors/index.d.ts",
    "browser": "./dist/browser/editors/index.js",
    "node": "./dist/node/editors/index.mjs"
  },
  "./editors/*": {
    "types": "./dist/editors/*/index.d.ts",
    "browser": "./dist/browser/editors/*/index.js",
    "node": "./dist/node/editors/*/index.mjs"
  },
  "./subgraphs": {
    "types": "./dist/subgraphs/index.d.ts",
    "browser": "./dist/browser/subgraphs/index.js",
    "node": "./dist/node/subgraphs/index.mjs"
  },
  "./processors": {
    "types": "./dist/processors/index.d.ts",
    "browser": "./dist/browser/processors/index.js",
    "node": "./dist/node/processors/index.mjs"
  },
  "./manifest": "./dist/powerhouse.manifest.json",
  "./style.css": "./dist/style.css"
`.raw;

const scriptsTemplate = json`
  "test": "vitest run",
  "test:watch": "vitest",
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
  ${versionedDependencies.join(",\n")},
  "@powerhousedao/document-engineering": "1.40.1",
  "graphql": "^16.10.0",
  "graphql-tag": "^2.12.6",
  "zod": "^4.3.5",
  "react": "^19.2.3",
  "react-dom": "^19.2.3"
`.raw;

const devDependenciesTemplate = (versionedDevDependencies: string[]) =>
  json`
  ${versionedDevDependencies.join(",\n")},
  "@electric-sql/pglite": "0.3.15",
  "@electric-sql/pglite-tools": "0.2.20",
  "@eslint/js": "^9.38.0",
  "@tailwindcss/cli": "^4.1.18",
  "@types/node": "^24.9.2",
  "@types/react": "^19.2.3",
  "eslint": "^9.38.0",
  "eslint-plugin-react": "^7.37.5",
  "eslint-plugin-react-hooks": "^7.0.1",
  "eslint-config-prettier": "^10.1.8",
  "eslint-plugin-prettier": "^5.5.4",
  "globals": "^16.4.0",
  "tailwindcss": "^4.1.16",
  "typescript": "^5.9.3",
  "typescript-eslint": "^8.46.2",
  "vitest": "4.1.1",
  "@vitejs/plugin-react": "6.0.1",
  "vite-tsconfig-paths": "6.1.1"
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

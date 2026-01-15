import { json } from "@tmpl/core";

const exportsTemplate = json`
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  },
  "./document-models": {
    "types": "./dist/document-models/index.d.ts",
    "import": "./dist/document-models/index.js"
  },
  "./editors": {
    "types": "./dist/editors/index.d.ts",
    "import": "./dist/editors/index.js"
  },
  "./document-models/*": {
    "types": "./dist/document-models/*/index.d.ts",
    "import": "./dist/document-models/*/index.js"
  },
  "./editors/*": {
    "types": "./dist/editors/*/index.d.ts",
    "import": "./dist/editors/*/index.js"
  },
  "./subgraphs": {
    "types": "./dist/subgraphs/index.d.ts",
    "import": "./dist/subgraphs/index.js"
  },
  "./processors": {
    "types": "./dist/processors/index.d.ts",
    "import": "./dist/processors/index.js"
  },
  "./manifest": "./dist/powerhouse.manifest.json",
  "./style.css": "./dist/style.css"
`;

const scriptsTemplate = json`
  "build": "npm run tsc && npm run tailwind",
  "test": "vitest run",
  "test:watch": "vitest",
  "lint": "eslint --config eslint.config.js --cache --cache-strategy content",
  "lint:fix": "npm run lint -- --fix",
  "tsc": "tsc",
  "tsc:watch": "tsc --watch",
  "tailwind": "npx @tailwindcss/cli -i ./style.css -o ./dist/style.css",
  "prepublishOnly": "npm run build",
  "check-circular-imports": "npx dpdm -T ./index.ts",
  "generate": "ph-cli generate",
  "connect": "ph-cli connect",
  "reactor": "ph-cli reactor",
  "service": "ph-cli service",
  "vetra": "ph-cli vetra",
  "service-startup": "bash ./node_modules/@powerhousedao/ph-cli/dist/scripts/service-startup.sh",
  "service-unstartup": "bash ./node_modules/@powerhousedao/ph-cli/dist/scripts/service-unstartup.sh"
`;

const dependenciesTemplate = (versionedDependencies: string[]) => json`
  ${versionedDependencies.join(",\n")},
  "@powerhousedao/document-engineering": "^1.38.0",
  "graphql": "^16.10.0",
  "graphql-tag": "^2.12.6",
  "zod": "^4.3.5"
`;

const devDependenciesTemplate = (versionedDevDependencies: string[]) => json`
  ${versionedDevDependencies.join(",\n")},
  "@electric-sql/pglite": "^0.2.12",
  "@eslint/js": "^9.38.0",
  "@powerhousedao/analytics-engine-core": "^0.5.0",
  "@tailwindcss/cli": "^4.1.4",
  "@testing-library/react": "^16.3.0",
  "@types/node": "^24.9.2",
  "@types/react": "^19.2.3",
  "@vitejs/plugin-react": "^5.1.0",
  "eslint": "^9.38.0",
  "vite-plugin-node-polyfills": "^0.24.0",
  "eslint-plugin-react": "^7.37.5",
  "eslint-plugin-react-hooks": "^7.0.1",
  "eslint-config-prettier": "^10.1.8",
  "eslint-plugin-prettier": "^5.5.4",
  "globals": "^16.4.0",
  "package-manager-detector": "^0.2.8",
  "pm2": "^5.4.3",
  "react": "^19.2.3",
  "react-dom": "^19.2.3",
  "tailwindcss": "^4.1.16",
  "typescript": "^5.9.3",
  "typescript-eslint": "^8.46.2",
  "vite": "^6.2.3",
  "vitest": "^3.0.9"
`;

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
  },
  "peerDependencies": {
    "react": ">=19.0.0",
    "react-dom": ">=19.0.0"
  }
}
`.raw;

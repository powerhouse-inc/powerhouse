import type { Manifest } from "@powerhousedao/shared";

export const exportPaths = [
  "document-models",
  "editors",
  "subgraphs",
  "processors",
] as const;

export const rootExportPaths = {
  ".": {
    types: "./dist/index.d.ts",
    browser: "./dist/browser/index.js",
    node: "./dist/node/index.mjs",
  },
} as const;

export const nonStandardExportPaths = {
  "./manifest": "./dist/powerhouse.manifest.json",
  "./style.css": "./dist/style.css",
} as const;

export const packageScripts = {
  "test:watch": "vitest",
  lint: "eslint --config eslint.config.js --cache",
  "lint:fix": "npm run lint -- --fix",
  tsc: "tsc",
  "tsc:watch": "tsc --watch",
  generate: "ph-cli generate",
  connect: "ph-cli connect",
  build: "ph-cli build",
  reactor: "ph-cli reactor",
  service: "ph-cli service",
  vetra: "ph-cli vetra",
  "service-startup":
    "bash ./node_modules/@powerhousedao/ph-cli/dist/scripts/service-startup.sh",
  "service-unstartup":
    "bash ./node_modules/@powerhousedao/ph-cli/dist/scripts/service-unstartup.sh",
} as const;

export const externalDependencies = {
  "@powerhousedao/document-engineering": "1.40.1",
  graphql: "^16.10.0",
  "graphql-tag": "^2.12.6",
  zod: "^4.3.5",
  react: "^19.2.3",
  "react-dom": "^19.2.3",
} as const;

export const externalDevDependencies = {
  "@eslint/js": "^9.38.0",
  "@tailwindcss/cli": "^4.1.18",
  "@types/node": "^24.9.2",
  "@types/react": "^19.2.3",
  eslint: "^9.38.0",
  "eslint-plugin-react": "^7.37.5",
  "eslint-plugin-react-hooks": "^7.0.1",
  "eslint-config-prettier": "^10.1.8",
  "eslint-plugin-prettier": "^5.5.4",
  globals: "^16.4.0",
  tailwindcss: "^4.1.16",
  typescript: "^5.9.3",
  "typescript-eslint": "^8.46.2",
  vitest: "4.1.1",
  "@vitejs/plugin-react": "6.0.1",
  "vite-tsconfig-paths": "6.1.1",
} as const;

export const defaultManifest: Manifest = {
  name: "",
  description: "",
  category: "",
  publisher: {
    name: "",
    url: "",
  },
  documentModels: [],
  editors: [],
  apps: [],
  subgraphs: [],
  processors: [],
};

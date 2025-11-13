export const packageJsonScriptsTemplate = {
  build: "npm run tsc && npm run tailwind",
  test: "vitest run",
  "test:watch": "vitest",
  lint: "eslint --config eslint.config.js --cache --cache-strategy content",
  "lint:fix": "npm run lint --fix",
  tsc: "tsc",
  "tsc:watch": "tsc --watch",
  tailwind: "npx @tailwindcss/cli -i ./style.css -o ./dist/style.css",
  prepublishOnly: "npm run build",
  "check-circular-imports": "npx dpdm -T ./index.ts",
  generate: "ph-cli generate",
  connect: "ph-cli connect",
  reactor: "ph-cli reactor",
  service: "ph-cli service",
  vetra: "ph-cli vetra",
  migrate: "ph-cli migrate",
  "service-startup":
    "bash ./node_modules/@powerhousedao/ph-cli/dist/scripts/service-startup.sh",
  "service-unstartup":
    "bash ./node_modules/@powerhousedao/ph-cli/dist/scripts/service-unstartup.sh",
};

export const packageJsonExportsTemplate = {
  ".": {
    types: "./dist/index.d.ts",
    default: "./dist/index.js",
  },
  "./document-models": {
    types: "./dist/document-models/index.d.ts",
    default: "./dist/document-models/index.js",
  },
  "./editors": {
    types: "./dist/editors/index.d.ts",
    default: "./dist/editors/index.js",
  },
  "./document-models/*": {
    types: "./dist/document-models/*/index.d.ts",
    default: "./dist/document-models/*/index.js",
  },
  "./editors/*": {
    types: "./dist/editors/*/index.d.ts",
    default: "./dist/editors/*/index.js",
  },
  "./subgraphs": {
    types: "./dist/subgraphs/index.d.ts",
    default: "./dist/subgraphs/index.js",
  },
  "./processors": {
    types: "./dist/processors/index.d.ts",
    default: "./dist/processors/index.js",
  },
  "./manifest": {
    default: "./dist/powerhouse.manifest.json",
  },
  "./style.css": "./dist/style.css",
};

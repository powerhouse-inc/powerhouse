import { json } from "@tmpl/core";

export const tsconfigPathsTemplate = json`
"document-models": [
  "./document-models/index.ts"
],
"document-models/*": [
  "./document-models/*/index.ts"
],
"editors": [
  "./editors/index.ts"
],
"editors/*": [
  "./editors/*/index.ts"
],
"processors/*": [
  "./processors/*/index.ts"
],
"subgraphs": [
  "./subgraphs/index.ts"
],
"subgraphs/*": [
  "./subgraphs/*/index.ts"
]`.raw;

export const tsConfigTemplate = json`
{
  "compilerOptions": {
    "rootDir": ".",
    // paths for easy access to project modules
    "paths": {
      ${tsconfigPathsTemplate}
    },
    "module": "nodenext",
    "moduleDetection": "force",
    "target": "esnext",
    "jsx": "react-jsx",
    "types": ["node", "vitest/globals"],
    "lib": ["ESNext", "dom", "dom.iterable"],
    "declaration": true,
    "declarationDir": "./dist/types",
    "declarationMap": true,
    "emitDeclarationOnly": true,
    "incremental": true,
    "strict": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "noUncheckedSideEffectImports": true,
    "skipLibCheck": true
  },
  "include": ["**/*", "./powerhouse.manifest.json"],
  "exclude": ["dist", "node_modules", ".ph", "vitest.config.ts", "main.tsx"]
}
`.raw;

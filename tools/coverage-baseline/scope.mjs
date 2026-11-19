import { matchesGlob } from "node:path";

export const include = ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"];
const structural = [
  "**/{node_modules,dist,build,.next,.ph,.tsbuild,coverage,test-results,playwright-report}/**",
  "tools/{coverage,coverage-baseline,test-coverage}/**",
  "tools/doc-harness/catalog/pinned/**",
  "**/*.d.{ts,mts,cts}",
];
const configuration =
  "**/{vitest,playwright,mcr,vite,tsdown,rollup,webpack,next,postcss,tailwind,eslint,babel,knip,storybook,docusaurus,commitlint}*.config.{js,mjs,cjs,ts,mts,cts}";
export const exclude = [
  ...structural,
  "**/*.{test,spec,bench,stories}.{js,jsx,mjs,cjs,ts,tsx,mts,cts}",
  "**/{test,tests,__tests__,test-utils,test-helpers,e2e,fixture,fixtures,__fixtures__,goldens,__snapshots__}/**",
  configuration,
  "**/.storybook/**",
  "**/{setup,setupTests,teardown,global-setup,global-teardown}.{js,jsx,mjs,cjs,ts,tsx,mts,cts}",
  "packages/{document-model,workflow,powerhouse-vetra-packages}/build.ts",
  "packages/shared/bundle.ts",
  "packages/{reactor-api,reactor-browser}/codegen.ts",
  "packages/workflow/scripts/ui-{stack,shots}.ts",
];
const consumers =
  "test/{versioned-documents,e2e-utils,test-client,test-connect,test-sync-queue,test-fusion}/**";
const consumerSupport = [
  "test/*/{test,tests,__tests__,test-utils,test-helpers,e2e,scripts}/**",
  "**/{fixture,fixtures,__fixtures__,goldens,__snapshots__}/**",
  "**/*.{test,spec,stories}.{js,jsx,mjs,cjs,ts,tsx,mts,cts}",
  "**/{build,setup,setupTests,teardown,global-setup,global-teardown,codegen,copy-dirs}.{js,mjs,cjs,ts,mts,cts}",
  configuration,
];

// Enumerate explicit provider includes with this predicate; template emitters are product code.
export function sourceIncluded(path) {
  path = path.replaceAll("\\", "/").replace(/^\.\//, "");
  const matches = (pattern) => matchesGlob(path, pattern);
  if (!include.some(matches) || structural.some(matches)) return false;
  if (path.startsWith("packages/codegen/src/templates/")) return true;
  if (matches(consumers)) return !consumerSupport.some(matches);
  if (path.startsWith("test/")) return false;
  return !exclude.some(matches);
}

export function ownerOf(path) {
  return (
    path.match(
      /^(packages\/(?:analytics-engine\/[^/]+|reactor\/(?:bench\/host|test\/atlas))|(?:apps|clis|packages|test|tools)\/[^/]+|scripts|releases)(?:\/|$)/,
    )?.[1] ?? "."
  );
}

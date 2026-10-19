import { existsSync, readFileSync, writeFileSync } from "node:fs";

// nx <= 22 emits `pnpm publish --"@scope:registry=<url>"`, which pnpm 12
// rejects; pnpm 11+ spells it `--config.@scope:registry`, as nx 23 does.
const NX_PACKAGE_MANAGER_FILES = [
  "node_modules/nx/dist/src/utils/package-manager.js",
  "releases/node_modules/nx/dist/src/utils/package-manager.js",
];

const OLD_FLAG = `--"\${allowRegistryConfigKey ? registryConfigKey : 'registry'}=\${registry}"`;

const NEW_FLAG =
  `--"\${allowRegistryConfigKey ? ((0, semver_1.gte)(getPackageManagerVersion('pnpm', root), '11.0.0') ` +
  `? \`config.\${registryConfigKey}\` : registryConfigKey) : 'registry'}=\${registry}"`;

// Patched on disk rather than through patchedDependencies: that entry makes
// pnpm re-resolve the graph and flips unrelated peer dependencies.
function patchNxPublishRegistryFlag(): number {
  let patched = 0;
  for (const file of NX_PACKAGE_MANAGER_FILES) {
    if (!existsSync(file)) continue;

    const source = readFileSync(file, "utf8");
    if (!source.includes(OLD_FLAG)) {
      console.log(`No pnpm publish flag to patch in ${file}`);
      continue;
    }

    writeFileSync(file, source.replace(OLD_FLAG, NEW_FLAG));
    console.log(`Patched pnpm publish registry flag in ${file}`);
    patched++;
  }
  return patched;
}

// nx's regex for `pnpm publish --json` output breaks on packed paths with braces
// (`{-$nodeSlug}.tsx`); scan string-aware from line-start `{` first.
const NX_EXTRACT_JSON_FILES = [
  "node_modules/@nx/js/src/executors/release-publish/extract-npm-publish-json-data.js",
  "releases/node_modules/@nx/js/src/executors/release-publish/extract-npm-publish-json-data.js",
];

const OLD_MATCH = "const jsonMatches = str.match(jsonRegex);";

const NEW_MATCH =
  "const jsonMatches = [...findJsonObjects(str), ...(str.match(jsonRegex) || [])];";

const FIND_JSON_OBJECTS = `
function findJsonObjects(str) {
    const objects = [];
    let depth = 0, start = -1, inString = false, escaped = false;
    for (let i = 0; i < str.length; i++) {
        const c = str[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (c === '\\\\') escaped = true;
            else if (c === '"') inString = false;
        } else if (c === '"') {
            inString = depth > 0;
        } else if (c === '{') {
            if (depth > 0) depth++;
            else if (i === 0 || str[i - 1] === '\\n') { depth = 1; start = i; }
        } else if (c === '}' && depth > 0 && --depth === 0) {
            objects.push(str.slice(start, i + 1));
        }
    }
    return objects;
}
`;

function patchNxPublishJsonExtraction(): number {
  let patched = 0;
  for (const file of NX_EXTRACT_JSON_FILES) {
    if (!existsSync(file)) continue;

    const source = readFileSync(file, "utf8");
    if (!source.includes(OLD_MATCH)) {
      console.log(`No publish JSON extraction to patch in ${file}`);
      continue;
    }

    writeFileSync(
      file,
      source.replace(OLD_MATCH, NEW_MATCH) + FIND_JSON_OBJECTS,
    );
    console.log(`Patched publish JSON extraction in ${file}`);
    patched++;
  }
  return patched;
}

if (patchNxPublishRegistryFlag() === 0) {
  console.log(
    "nx publish flag left unchanged: already fixed upstream, or nx moved the code.",
  );
}
if (patchNxPublishJsonExtraction() === 0) {
  console.log(
    "nx publish JSON extraction left unchanged: already fixed upstream, or nx moved the code.",
  );
}

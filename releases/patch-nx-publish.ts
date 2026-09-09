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

const patched = patchNxPublishRegistryFlag();
if (patched === 0) {
  console.log(
    "nx publish flag left unchanged: already fixed upstream, or nx moved the code.",
  );
}

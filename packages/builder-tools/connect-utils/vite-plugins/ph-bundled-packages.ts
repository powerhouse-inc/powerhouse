import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

export type PhBundledPackagesPluginOptions = {
  /**
   * Package names (with `provider: "local"` in powerhouse.config.json)
   * that should be bundled into Connect at build time. Each must be
   * resolvable from node_modules.
   */
  packages: string[];
  /** Project root used to read each bundled package's package.json version. */
  projectRoot?: string;
};

const VIRTUAL_ID = "virtual:ph-bundled-packages";
const RESOLVED_VIRTUAL_ID = "\0" + VIRTUAL_ID;

function readBundledPackageVersion(
  projectRoot: string,
  name: string,
): string | undefined {
  try {
    const raw = fs.readFileSync(
      path.join(projectRoot, "node_modules", name, "package.json"),
      "utf-8",
    );
    const pkg = JSON.parse(raw) as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : undefined;
  } catch {
    return undefined;
  }
}

function makeRegisterModule(packages: string[], projectRoot: string): string {
  if (packages.length === 0) {
    return "export default () => {};\n";
  }
  const imports: string[] = [];
  const calls: string[] = [];

  packages.forEach((name, i) => {
    const moduleName = `pkg${i}`;
    const version = readBundledPackageVersion(projectRoot, name);
    imports.push(`import * as ${moduleName} from ${JSON.stringify(name)};`);
    imports.push(`import ${JSON.stringify(`${name}/style.css`)};`);
    calls.push(
      `  pm.addLocalPackage(${JSON.stringify(name)}, ${moduleName}, ${JSON.stringify(version)});`,
    );
  });

  return `${imports.join("\n")}\n\nexport default function register(pm) {\n${calls.join("\n")}\n};\n`;
}

/**
 * Emits a virtual module `virtual:ph-bundled-packages` whose default export
 * is a `register(packageManager)` function. When called at runtime (from
 * Connect's bootstrap), it registers each bundled package with the package
 * manager the same way Common/Vetra are registered — meaning they work
 * offline without the registry being reachable.
 *
 * When the list is empty, the module exports a no-op function so Connect's
 * bootstrap code can always import it unconditionally.
 */
export function phBundledPackagesPlugin(
  options: PhBundledPackagesPluginOptions,
): Plugin {
  const projectRoot = options.projectRoot ?? process.cwd();
  const moduleSource = makeRegisterModule(options.packages, projectRoot);

  return {
    name: "vite-plugin-ph-bundled-packages",
    enforce: "pre",
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_ID) return moduleSource;
    },
  };
}

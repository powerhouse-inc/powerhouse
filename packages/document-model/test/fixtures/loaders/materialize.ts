import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const FIXTURE = join(HERE, "loader-package");

const COMPILER_PACKAGE = resolve(HERE, "..", "..", "..");

export const FIXTURE_PACKAGE_NAME = "@powerhousedao/loader-fixture";

export type MaterializedPackage = {
  readonly root: string;
  readonly schemaFirstRoot: string;
  readonly legacyRoot: string;
  readonly registryUrl: string;
  readonly dispose: () => void;
};

/**
 * Host loaders differ in the subpath they read, the exports they keep, and the
 * version they pick. Only resolution against a package on disk shows that.
 */
export function materializeLoaderPackage(): MaterializedPackage {
  // macOS temp paths go through a symlink, and a root spelled two ways
  // evaluates its modules twice.
  const base = realpathSync.native(
    mkdtempSync(join(tmpdir(), "ph-loader-fixture-")),
  );
  const root = join(base, "package");
  cpSync(FIXTURE, root, { recursive: true });
  mkdirSync(join(root, "node_modules", "@powerhousedao"), { recursive: true });
  symlinkSync(COMPILER_PACKAGE, join(root, "node_modules", "document-model"));
  // `defineSubgraph` comes from reactor-api, as in a real subgraph package.
  symlinkSync(
    resolve(COMPILER_PACKAGE, "..", "reactor-api"),
    join(root, "node_modules", "@powerhousedao", "reactor-api"),
  );
  symlinkSync(
    resolve(COMPILER_PACKAGE, "..", "shared"),
    join(root, "node_modules", "@powerhousedao", "shared"),
  );

  // The HTTP loader fetches
  // `${registryUrl}-/cdn/${spec}/node/document-models/index.mjs`.
  const cdn = join(base, "registry", "-", "cdn", FIXTURE_PACKAGE_NAME);
  mkdirSync(dirname(cdn), { recursive: true });
  symlinkSync(root, cdn);

  return {
    root,
    schemaFirstRoot: join(root, "schema-first"),
    legacyRoot: join(root, "legacy"),
    registryUrl: `${pathToFileURL(join(base, "registry")).href}/`,
    dispose: () => rmSync(base, { recursive: true, force: true }),
  };
}

export function observedModels(modules: readonly DocumentModelModule[]) {
  return modules
    .map((module) => ({
      id: module.documentModel.global.id,
      name: module.documentModel.global.name,
      version: module.version ?? 1,
      actions: Object.keys(
        (module as unknown as { actions?: Record<string, unknown> }).actions ??
          {},
      )
        .filter((key) => !key.startsWith("_"))
        .sort(),
      specifications: module.documentModel.global.specifications.map(
        (specification) => ({
          version: specification.version,
          globalSchema: specification.state.global.schema,
          operations: specification.modules.flatMap((entry) =>
            entry.operations.map((operation) => ({
              name: operation.name,
              schema: operation.schema,
            })),
          ),
        }),
      ),
    }))
    .sort((left, right) => left.version - right.version);
}

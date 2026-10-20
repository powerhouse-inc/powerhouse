import type { DocumentModelLib } from "document-model";

/** A module namespace, as `import * as pkg` or Vite HMR hands it over. */
export type ModuleNamespace = Record<string, any> & {
  [Symbol.toStringTag]: "Module";
};

export type LocalPackage = DocumentModelLib<any> | ModuleNamespace;

/** The package itself, or a loader (`() => import("./index.js")`) that keeps it off the boot path. */
export type LocalPackageSource = LocalPackage | (() => Promise<LocalPackage>);

/** Starts loading the project's package; a loader runs once, here. */
export function loadLocalPackage(
  source: LocalPackageSource | undefined,
): DocumentModelLib | Promise<DocumentModelLib> | undefined {
  const pkg = (typeof source === "function" ? source() : source) as
    | DocumentModelLib
    | Promise<DocumentModelLib>
    | undefined;
  // Consumers await it; this only stops an early rejection being reported as unhandled.
  if (pkg instanceof Promise) pkg.catch(() => undefined);
  return pkg;
}

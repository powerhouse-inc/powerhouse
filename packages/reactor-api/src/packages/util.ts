import type {
  ProcessorFactoryBuilder,
  SubgraphClass,
} from "@powerhousedao/reactor-api";
import type {
  DocumentModelModule,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import { childLogger } from "document-model";
import { execFileSync } from "node:child_process";
import path from "node:path";

import { pathToFileURL } from "node:url";
import {
  isMissingImportForSpecifier,
  resolveLinkedPackage,
} from "./import-resolver.js";

// Define the expected module export structures
type DocumentModelsExport = Record<string, DocumentModelModule>;
type SubgraphsExport = Record<string, Record<string, SubgraphClass>>;
type ProcessorsExport = {
  processorFactory?: ProcessorFactoryBuilder;
  processorFactoryLegacy?: ProcessorFactoryBuilder;
};

const _logger = childLogger(["reactor-api", "packages/util"]);

export const installPackages = (packages: string[]): Promise<void> => {
  for (const packageName of packages) {
    execFileSync("ph", ["install", packageName]);
  }
  return Promise.resolve();
};

export const readManifest = () => {
  const manifest = execFileSync("ph", ["manifest"]).toString();
  return manifest;
};

/** Import document models, falling back to linked-package resolution. */
export async function loadDocumentModels(
  packageName: string,
): Promise<DocumentModelsExport | null> {
  return loadDependency(packageName, "document-models");
}

/** Import subgraphs, falling back to linked-package resolution. */
export async function loadSubgraphs(
  packageName: string,
): Promise<SubgraphsExport | null> {
  return loadDependency(packageName, "subgraphs");
}

/** Import processors, falling back to linked-package resolution. */
export async function loadProcessors(
  packageName: string,
): Promise<ProcessorsExport | null> {
  return loadDependency(packageName, "processors");
}

/**
 * Import a package subpath, retrying through linked-package resolution for
 * module-resolution failures. Evaluation and unresolved-import errors propagate.
 */
async function loadDependency<T = unknown>(
  packageName: string,
  subPath: string,
): Promise<T> {
  // A local package is identified by an absolute path, which has to become a
  // file:// URL: the ESM loader reads the drive letter in a Windows path as a
  // URL scheme.
  const fullPath = packageSubpathSpecifier(packageName, subPath);

  // Try the standard import first
  try {
    // vite does not support this, but that's okay as we have provided the
    // vite-loader for this purpose

    const module = (await import(/* @vite-ignore */ fullPath)) as T;
    return module;
  } catch (e) {
    // Handle module not found errors with fallback resolution.
    // A package may omit a legacy subpath from exports, and a directory
    // specifier that is a plain path fails with ERR_UNSUPPORTED_ESM_URL_SCHEME
    // on Windows where POSIX reports ERR_UNSUPPORTED_DIR_IMPORT.
    if (isModuleResolutionError(e, fullPath)) {
      const result = await resolveLinkedPackage<T>(packageName, subPath);
      if (result) return result;
    }
    throw e;
  }
}

export function isModuleResolutionError(
  error: unknown,
  requestedSpecifier: string,
): error is Error & { code: string } {
  return isMissingImportForSpecifier(error, requestedSpecifier);
}

export function packageSubpathSpecifier(
  packageName: string,
  subPath: string,
): string {
  return path.isAbsolute(packageName)
    ? pathToFileURL(path.join(packageName, subPath)).href
    : `${packageName}/${subPath}`;
}

function isUpgradeManifest(
  value: unknown,
): value is UpgradeManifest<readonly number[]> {
  return (
    typeof value === "object" &&
    value !== null &&
    "documentType" in value &&
    "supportedVersions" in value &&
    "upgrades" in value
  );
}

/**
 * Collect manifests using this loader's existing shallow namespace rules.
 * Aggregate arrays and individual exports are accepted; the last manifest for
 * a document type wins.
 */
export function extractUpgradeManifests(
  namespace: Record<string, unknown>,
): UpgradeManifest<readonly number[]>[] {
  const manifests = new Map<string, UpgradeManifest<readonly number[]>>();
  const add = (value: unknown) => {
    if (isUpgradeManifest(value)) manifests.set(value.documentType, value);
  };
  for (const value of Object.values(namespace)) {
    if (Array.isArray(value)) value.forEach(add);
    else add(value);
  }
  return Array.from(manifests.values());
}

export function debounce<T extends unknown[], R>(
  func: (...args: T) => Promise<R>,
  delay = 250,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: {
    resolve: (value: R | PromiseLike<R>) => void;
    reject: (reason?: unknown) => void;
  }[] = [];

  return (immediate = false, ...args: T) => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    return new Promise<R>((resolve, reject) => {
      pending.push({ resolve, reject });
      const run = () => {
        timer = undefined;
        const waiters = pending;
        pending = [];
        Promise.resolve()
          .then(() => func(...args))
          .then(
            (value) => waiters.forEach((waiter) => waiter.resolve(value)),
            (error: unknown) =>
              waiters.forEach((waiter) => waiter.reject(error)),
          );
      };
      if (immediate) {
        run();
      } else {
        timer = setTimeout(run, delay);
      }
    });
  };
}

export function isSubpath(parent: string, dir: string) {
  const relative = path.relative(parent, dir);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

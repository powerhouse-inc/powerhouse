import type { SubgraphClass } from "#graphql/index.js";
import { childLogger } from "document-drive";
import type {
  IProcessorHostModule,
  ProcessorFactory,
} from "document-drive/processors/types";
import type { DocumentModelModule } from "document-model";
import { execSync } from "node:child_process";
import { resolveLinkedPackage } from "./import-resolver.js";

// Define the expected module export structures
type DocumentModelsExport = Record<string, DocumentModelModule>;
type SubgraphsExport = Record<string, Record<string, SubgraphClass>>;
type ProcessorsExport = {
  processorFactory: (module: IProcessorHostModule) => ProcessorFactory;
};

const logger = childLogger(["reactor-api", "packages/util"]);

export const installPackages = async (packages: string[]) => {
  for (const packageName of packages) {
    execSync(`ph install ${packageName}`);
  }
};

export const readManifest = () => {
  const manifest = execSync(`ph manifest`).toString();
  return manifest;
};

/**
 * Tries to import document models from a package. This function cannot throw.
 */
export async function loadDocumentModels(
  packageName: string,
): Promise<DocumentModelsExport | null> {
  return loadDependency(packageName, "document-models");
}

/**
 * Tries to import subgraphs from a package. This function cannot throw.
 */
export async function loadSubgraphs(
  packageName: string,
): Promise<SubgraphsExport | null> {
  return loadDependency(packageName, "subgraphs");
}

/**
 * Tries to import processors from a package. This function cannot throw.
 */
export async function loadProcessors(
  packageName: string,
): Promise<ProcessorsExport | null> {
  return loadDependency(packageName, "processors");
}

/**
 * Generic dependency loader - tries to import a dependency from a package. This function cannot throw.
 * Returns null if the dependency cannot be loaded.
 */
async function loadDependency<T = unknown>(
  packageName: string,
  subPath: string,
): Promise<T | null> {
  const fullPath = `${packageName}/${subPath}`;

  // Try the standard import first
  try {
    // vite does not support this, but that's okay as we have provided the
    // vite-loader for this purpose
    const module = (await import(/* @vite-ignore */ fullPath)) as T;
    return module;
  } catch (e) {
    // Handle module not found errors with fallback resolution
    if (
      e instanceof Error &&
      "code" in e &&
      (e.code === "ERR_MODULE_NOT_FOUND" ||
        e.code === "ERR_UNSUPPORTED_DIR_IMPORT")
    ) {
      const result = await resolveLinkedPackage<T>(packageName, subPath);
      if (result) return result;

      // Only log when ALL attempts have failed
      logger.warn(
        `Unable to load dependency ${fullPath} - tried standard import, suggested paths, resolved paths, and workspace patterns`,
      );

      logger.error(e);
    } else if (
      e instanceof Error &&
      "code" in e &&
      ["ERR_PACKAGE_PATH_NOT_EXPORTED", "ERR_MODULE_NOT_FOUND"].includes(
        e.code as string,
      )
    ) {
      return null;
    } else {
      logger.error(`Unexpected error loading ${fullPath}:`, e);
    }

    return null;
  }
}

export function debounce<T extends (...args: any[]) => void>(
  func: T,
  delay = 100,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>): void => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

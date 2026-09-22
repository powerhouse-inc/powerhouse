import type {
  ProcessorFactoryBuilder,
  SubgraphClass,
} from "@powerhousedao/reactor-api";
import type {
  DocumentModelModule,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";

// One entry of a reactor package's pieces list, declared here rather than
// imported so reactor-api needs no dependency on a package meant for pieces.
export interface PackagePiece {
  name: string;
  version: string;
  /** Built output, relative to the package root: a directory in npm shape. */
  bundle?: string;
  /** Built output, relative to the package root: a single module file. */
  entry?: string;
}

// A declared piece, located. Absolute either way, because what consumes it is
// a worker that knows nothing of the package the piece came from.

// A path when the package is on this disk; a URL when it was loaded from a
// registry, which serves the built module but nothing to point a path at.
export interface PackagePieceEntry {
  name: string;
  version: string;
  entryPath?: string;
  bundleDir?: string;
  entryUrl?: string;
}

export interface IPackageLoader {
  name: string;
  loadDocumentModels(
    identifier: string,
    immediate?: boolean,
  ): Promise<DocumentModelModule[]>;
  /**
   * Loads the upgrade manifests a package exports alongside its document
   * models. Optional: loaders that predate versioned models may omit it.
   */
  loadUpgradeManifests?(
    identifier: string,
  ): Promise<UpgradeManifest<readonly number[]>[]>;
  loadSubgraphs(
    identifier: string,
    immediate?: boolean,
  ): Promise<SubgraphClass[]>;
  loadProcessors(
    identifier: string,
    immediate?: boolean,
  ): Promise<ProcessorFactoryBuilder | null>;
  /** The pieces a package ships, each located absolutely on this disk. */
  loadPieces(
    identifier: string,
    immediate?: boolean,
  ): Promise<PackagePieceEntry[]>;
}

export interface ISubscriptionOptions {
  debounce?: number; // defaults to 100ms
}

export interface ISubscribablePackageLoader extends IPackageLoader {
  onDocumentModelsChange?(
    identifier: string,
    handler: (documentModels: DocumentModelModule[]) => void,
    options?: ISubscriptionOptions,
  ): () => void;
  onSubgraphsChange?(
    identifier: string,
    handler: (subgraphs: SubgraphClass[]) => void,
    options?: ISubscriptionOptions,
  ): () => void;
  onProcessorsChange?(
    identifier: string,
    handler: (processors: ProcessorFactoryBuilder | null) => void,
    options?: ISubscriptionOptions,
  ): () => void;
  onPiecesChange?(
    identifier: string,
    handler: (pieces: PackagePieceEntry[]) => void,
    options?: ISubscriptionOptions,
  ): () => void;
}

export interface IPackageManager {
  onDocumentModelsChange(
    handler: (documentModels: Record<string, DocumentModelModule[]>) => void,
  ): void;
  /**
   * Remove a package from all package maps and emit the change events.
   * Used when a dynamically installed package is uninstalled.
   */
  removePackage(packageName: string): void;
}

export type IPackageLoaderOptions = {
  logger?: ILogger;
};

export type IPackageManagerOptions = {
  packages?: string[];
  configFile?: string;
};

export interface PackageConfig {
  packageName: string;
}

export interface PowerhouseConfig {
  packages?: PackageConfig[];
}

export type PackageManagerResult = {
  documentModels: DocumentModelModule[];
  upgradeManifests: UpgradeManifest<readonly number[]>[];
  subgraphs: Map<string, SubgraphClass[]>;
  processors: Map<string, ProcessorFactoryBuilder[]>;
  pieces: Map<string, PackagePieceEntry[]>;
};

// What a host binds its piece holder to: what is loaded now, and every change
// after. Declared as an interface so nothing outside has to name the manager.
export interface IPackagePieceSource {
  getPieces(): Map<string, PackagePieceEntry[]>;
  onPiecesChange(
    handler: (pieces: Map<string, PackagePieceEntry[]>) => void,
  ): void;
}

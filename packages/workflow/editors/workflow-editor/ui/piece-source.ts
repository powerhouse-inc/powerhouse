// Catalog source for the block selector's piece browser. Provided by the
// editor shell's RuntimeProvider through context, to keep ui/ decoupled.
import { checkTriggerStrategy } from "@powerhousedao/pieces-framework/workflow";
import { createContext, useContext } from "react";

export interface PieceSummaryUi {
  name: string;
  displayName: string;
  description: string;
  logoUrl: string;
  actionCount: number;
  triggerCount: number;
  // Activepieces category ids; empty for uncategorised pieces.
  categories: string[];
  // Absent from older runtimes, which list Activepieces pieces only.
  source?: PieceSourceKind;
  // Why none of the piece's blocks can run on this reactor.
  unsupported?: string | null;
  // Retired by its publisher: still listed, marked as such.
  deprecated?: boolean;
  // The installed version; pins the blocks picked from it.
  version?: string;
  // A local package shadowing a published piece: the version published.
  publishedVersion?: string;
}

export interface BlockSearchHitUi {
  pieceName: string;
  pieceVersion: string;
  // The action or trigger name.
  name: string;
  pieceDisplayName: string;
  logoUrl: string;
  displayName: string;
  description: string;
  kind: "action" | "trigger";
  strategy: string | null;
  unsupported?: string | null;
}

// Where a piece is listed from: a reactor package, the Powerhouse registry,
// or the Activepieces cloud catalog.
export type PieceSourceKind = "local" | "registry" | "activepieces";

export interface PieceSearchMatchUi {
  pieceName: string;
  pieceVersion: string;
  displayName: string;
  description: string;
  logoUrl: string;
  categories: string[];
  source: PieceSourceKind;
  deprecated?: boolean | null;
  unsupported?: string | null;
  // Every query token matched the piece's own name.
  namedPiece: boolean;
  // Matching blocks, best first.
  blocks: BlockSearchHitUi[];
}

export interface PieceSearchResultUi {
  status: "ready" | "indexing" | "error";
  pieces: PieceSearchMatchUi[];
  error: string | null;
}

export interface PieceSearchFilterUi {
  kind: "action" | "trigger";
  // Any of; all when absent.
  sources?: readonly PieceSourceKind[];
  // Category ids, any of; all when absent.
  categories?: readonly string[];
}

// One action of a piece, at the version its listing answered with.
export interface PieceActionUi {
  pieceName: string;
  pieceVersion: string;
  name: string;
  displayName: string;
  description: string;
  unsupported?: string | null;
}

export interface PieceTriggerUi {
  pieceName: string;
  pieceVersion: string;
  name: string;
  displayName: string;
  description: string;
  // Read through checkTriggerStrategy.
  strategy: string;
  unsupported?: string | null;
}

// Why a listed block cannot be picked, or undefined when it can: the
// runtime's own reason first, then a trigger strategy it cannot serve.
export function blockUnavailable(entry: {
  unsupported?: string | null;
  kind?: "action" | "trigger";
  strategy?: string | null;
}): string | undefined {
  if (entry.unsupported) return entry.unsupported;
  if (entry.kind !== "trigger") return undefined;
  const strategy = checkTriggerStrategy(entry.strategy);
  return "issue" in strategy ? strategy.issue : undefined;
}

export interface PieceCatalogSource {
  loadCatalog: () => Promise<PieceSummaryUi[]>;
  // Refetches past any cached answer; loadCatalog is used when absent.
  reloadCatalog?: () => Promise<PieceSummaryUi[]>;
  loadActions: (packageName: string) => Promise<PieceActionUi[]>;
  loadTriggers: (packageName: string) => Promise<PieceTriggerUi[]>;
  // Catalog-wide search grouped by piece; optional for offline sources.
  searchPieces?: (
    query: string,
    filter: PieceSearchFilterUi,
  ) => Promise<PieceSearchResultUi>;
}

const PieceSourceContext = createContext<PieceCatalogSource | undefined>(
  undefined,
);

export const PieceSourceProvider = PieceSourceContext.Provider;

export function usePieceSource(): PieceCatalogSource | undefined {
  return useContext(PieceSourceContext);
}

// Catalog source for the block selector's piece browser. Registered by the
// editor shell (same pattern as registerCanvasHandlers) to keep ui/ decoupled.

export interface PieceSummaryUi {
  name: string;
  displayName: string;
  description: string;
  logoUrl: string;
  actionCount: number;
  triggerCount: number;
  // Activepieces category ids; empty for uncategorised pieces.
  categories: string[];
}

export interface BlockSearchHitUi {
  blockType: string;
  pieceName: string;
  pieceDisplayName: string;
  logoUrl: string;
  displayName: string;
  description: string;
  kind: "action" | "trigger";
  strategy: string | null;
}

export interface BlockSearchResultUi {
  status: "ready" | "indexing" | "error";
  hits: BlockSearchHitUi[];
  error: string | null;
}

export interface PieceActionUi {
  name: string;
  displayName: string;
  description: string;
  blockType: string;
}

export interface PieceTriggerUi {
  name: string;
  displayName: string;
  description: string;
  // POLLING | WEBHOOK | APP_WEBHOOK.
  strategy: string;
  blockType: string;
}

// APP_WEBHOOK is the one the runtime cannot serve: it maps to polling, and an
// app-webhook trigger's run hook needs a request, so a poll calls it blind.
export function triggerStrategyRuns(strategy: string | null | undefined) {
  return (strategy ?? "POLLING") !== "APP_WEBHOOK";
}

export interface PieceCatalogSource {
  loadCatalog: () => Promise<PieceSummaryUi[]>;
  loadActions: (packageName: string) => Promise<PieceActionUi[]>;
  loadTriggers: (packageName: string) => Promise<PieceTriggerUi[]>;
  // Catalog-wide action/trigger name search; optional for offline sources.
  searchBlocks?: (
    query: string,
    limit?: number,
  ) => Promise<BlockSearchResultUi>;
}

let source: PieceCatalogSource | undefined;

export function registerPieceSource(next: PieceCatalogSource): void {
  source = next;
}

export function getPieceSource(): PieceCatalogSource | undefined {
  return source;
}

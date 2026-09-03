// Catalog source for the block selector's piece browser. Registered by the
// editor shell (same pattern as registerCanvasHandlers) to keep ui/ decoupled.

export interface PieceSummaryUi {
  name: string;
  displayName: string;
  description: string;
  logoUrl: string;
  actionCount: number;
  triggerCount: number;
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
  // POLLING | WEBHOOK | APP_WEBHOOK; only POLLING runs today.
  strategy: string;
  blockType: string;
}

export interface PieceCatalogSource {
  loadCatalog: () => Promise<PieceSummaryUi[]>;
  loadActions: (packageName: string) => Promise<PieceActionUi[]>;
  loadTriggers: (packageName: string) => Promise<PieceTriggerUi[]>;
}

let source: PieceCatalogSource | undefined;

export function registerPieceSource(next: PieceCatalogSource): void {
  source = next;
}

export function getPieceSource(): PieceCatalogSource | undefined {
  return source;
}

// Catalog source for the block selector's piece browser. Registered by the
// editor shell (same pattern as registerCanvasHandlers) to keep ui/ decoupled.

export interface PieceSummaryUi {
  name: string;
  displayName: string;
  description: string;
  logoUrl: string;
  actionCount: number;
}

export interface PieceActionUi {
  name: string;
  displayName: string;
  description: string;
  blockType: string;
}

export interface PieceCatalogSource {
  loadCatalog: () => Promise<PieceSummaryUi[]>;
  loadActions: (packageName: string) => Promise<PieceActionUi[]>;
}

let source: PieceCatalogSource | undefined;

export function registerPieceSource(next: PieceCatalogSource): void {
  source = next;
}

export function getPieceSource(): PieceCatalogSource | undefined {
  return source;
}

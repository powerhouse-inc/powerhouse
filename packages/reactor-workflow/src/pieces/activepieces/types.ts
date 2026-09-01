// Structural types for published Activepieces bundles (Path B). Bundles inline
// their framework, so all typing is duck-typed — see ../../10-spike-notes-s6a.md.

// Open set: SHORT_TEXT, NUMBER, CHECKBOX, OBJECT, STATIC_DROPDOWN, DROPDOWN, DYNAMIC, ...
export type ApPropertyType = string;

export interface ApDropdownOption {
  label: string;
  value: unknown;
}

// STATIC_DROPDOWN options are plain data; DROPDOWN options is a resolver function.
export interface ApStaticDropdownState {
  options: ApDropdownOption[];
  disabled?: boolean;
  placeholder?: string;
}

export interface ApProperty {
  displayName?: string;
  description?: string;
  type?: ApPropertyType;
  required?: boolean;
  defaultValue?: unknown;
  options?: ApStaticDropdownState | ((...args: unknown[]) => unknown);
  // Resolver function on DYNAMIC properties.
  props?: (...args: unknown[]) => unknown;
}

export interface ApAction {
  name?: string;
  displayName?: string;
  description?: string;
  // UI metadata only — pieces run without auth despite it (spike finding).
  requireAuth?: boolean;
  props?: Record<string, ApProperty>;
  run: (ctx: unknown) => Promise<unknown>;
}

export interface ApPiece {
  displayName: string;
  description?: string;
  logoUrl?: string;
  authors?: string[];
  categories?: string[];
  auth?: ApProperty;
  minimumSupportedRelease?: string;
  maximumSupportedRelease?: string;
  actions?: Record<string, ApAction> | (() => Record<string, ApAction>);
  triggers?: Record<string, unknown> | (() => Record<string, unknown>);
  getAction?: (name: string) => ApAction | undefined;
  metadata?: () => Record<string, unknown>;
}

// Normalizes the record-vs-method variants of `piece.actions`.
export function getActions(piece: ApPiece): Record<string, ApAction> {
  const actions =
    typeof piece.actions === "function" ? piece.actions() : piece.actions;
  return actions ?? {};
}

// Normalizes the record-vs-method variants of `piece.triggers`.
export function getTriggers(piece: ApPiece): Record<string, unknown> {
  const triggers =
    typeof piece.triggers === "function" ? piece.triggers() : piece.triggers;
  return triggers ?? {};
}

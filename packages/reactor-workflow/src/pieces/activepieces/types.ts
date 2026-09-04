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
  placeholder?: string;
  type?: ApPropertyType;
  required?: boolean;
  defaultValue?: unknown;
  options?: ApStaticDropdownState | ((...args: unknown[]) => unknown);
  // Resolver function on DYNAMIC properties.
  props?: (...args: unknown[]) => unknown;
  // DROPDOWN / DYNAMIC: sibling prop names whose values feed the resolver.
  refreshers?: string[];
  // ARRAY: schema of each item's fields; absent for plain value arrays.
  properties?: Record<string, ApProperty>;
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

// Emitted trigger payloads may carry their own dedup key under this property.
export const DEDUPE_KEY_PROPERTY = "_dedupe_key";

// WEBHOOK | POLLING | MANUAL | APP_WEBHOOK
export type ApTriggerStrategy = string;

export interface ApTrigger {
  name?: string;
  displayName?: string;
  description?: string;
  requireAuth?: boolean;
  type?: ApTriggerStrategy;
  // SIMULATION | TEST_FUNCTION
  testStrategy?: string;
  props?: Record<string, ApProperty>;
  sampleData?: unknown;
  onEnable?: (ctx: unknown) => Promise<void>;
  onDisable?: (ctx: unknown) => Promise<void>;
  onStart?: (ctx: unknown) => Promise<unknown>;
  run?: (ctx: unknown) => Promise<unknown[]>;
  test?: (ctx: unknown) => Promise<unknown[]>;
  onHandshake?: (ctx: unknown) => Promise<unknown>;
  onRenew?: (ctx: unknown) => Promise<void>;
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
  triggers?: Record<string, ApTrigger> | (() => Record<string, ApTrigger>);
  getAction?: (name: string) => ApAction | undefined;
  getTrigger?: (name: string) => ApTrigger | undefined;
  metadata?: () => Record<string, unknown>;
}

// Normalizes the record-vs-method variants of `piece.actions`.
export function getActions(piece: ApPiece): Record<string, ApAction> {
  const actions =
    typeof piece.actions === "function" ? piece.actions() : piece.actions;
  return actions ?? {};
}

// Normalizes the record-vs-method variants of `piece.triggers`.
export function getTriggers(piece: ApPiece): Record<string, ApTrigger> {
  const triggers =
    typeof piece.triggers === "function" ? piece.triggers() : piece.triggers;
  return triggers ?? {};
}

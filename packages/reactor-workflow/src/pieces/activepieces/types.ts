// Structural types for published Activepieces bundles (Path B). Bundles inline
// their framework, so all typing is duck-typed — see ../../10-spike-notes-s6a.md.
import type {
  ActionBase,
  BasePropertySchema,
  DropdownOption,
  DropdownProperty,
  DropdownState,
  PieceBase,
  TriggerBase,
  WebhookHandshakeConfiguration,
} from "@powerhousedao/pieces-framework";

export { DEDUPE_KEY_PROPERTY } from "@powerhousedao/pieces-framework";

// Widened from the framework's PropertyType: a bundle inlines its own copy of
// the enum, so a value read off one is compared as a string, never by identity.
export type ApPropertyType = string;

export type ApDropdownOption = Pick<DropdownOption<unknown>, "label" | "value">;

// STATIC_DROPDOWN options are plain data; DROPDOWN options is a resolver function.
export type ApStaticDropdownState = Pick<
  DropdownState<unknown>,
  "disabled" | "placeholder"
> & { options: ApDropdownOption[] };

// Every field optional: an unknown bundle version may omit any of them, and a
// missing field must read as absent rather than fail the descriptor.
export type ApProperty = Partial<
  Pick<BasePropertySchema, "displayName" | "description" | "placeholder">
> &
  Partial<Pick<DropdownProperty<unknown, boolean>, "refreshers">> & {
    type?: ApPropertyType;
    required?: boolean;
    defaultValue?: unknown;
    options?: ApStaticDropdownState | ((...args: unknown[]) => unknown);
    // Resolver function on DYNAMIC properties.
    props?: (...args: unknown[]) => unknown;
    // ARRAY: schema of each item's fields; absent for plain value arrays.
    properties?: Record<string, ApProperty>;
  };

// requireAuth is UI metadata only — pieces run without auth despite it (spike finding).
export type ApAction = Partial<
  Pick<ActionBase, "name" | "displayName" | "description" | "requireAuth">
> & {
  props?: Record<string, ApProperty>;
  // Authored shape of run()'s return, for the expression picker. Plain data,
  // and never validated against — a piece may return whatever it likes.
  outputSchema?: unknown;
  // "human" | "ai" | "both"; absent counts as human-visible.
  audience?: string;
  run: (ctx: unknown) => Promise<unknown>;
};

// Widened from TriggerStrategy for the same reason as ApPropertyType:
// WEBHOOK | POLLING | MANUAL | APP_WEBHOOK, read off a foreign bundle's enum.
export type ApTriggerStrategy = string;

// strategy widened from WebhookHandshakeStrategy: NONE | HEADER_PRESENT |
// QUERY_PRESENT | BODY_PARAM_PRESENT | HEAD_REQUEST.
export type ApHandshakeConfiguration = Partial<
  Omit<WebhookHandshakeConfiguration, "strategy">
> & { strategy?: string };

export type ApTrigger = Partial<
  Pick<
    TriggerBase,
    "name" | "displayName" | "description" | "requireAuth" | "sampleData"
  >
> & {
  type?: ApTriggerStrategy;
  // Widened from TriggerTestStrategy: SIMULATION | TEST_FUNCTION.
  testStrategy?: string;
  props?: Record<string, ApProperty>;
  outputSchema?: unknown;
  handshakeConfiguration?: ApHandshakeConfiguration;
  // Widened from WebhookRenewConfiguration: CRON | NONE.
  renewConfiguration?: { strategy?: string; cronExpression?: string };
  onEnable?: (ctx: unknown) => Promise<void>;
  onDisable?: (ctx: unknown) => Promise<void>;
  onStart?: (ctx: unknown) => Promise<unknown>;
  run?: (ctx: unknown) => Promise<unknown[]>;
  test?: (ctx: unknown) => Promise<unknown[]>;
  onHandshake?: (ctx: unknown) => Promise<unknown>;
  onRenew?: (ctx: unknown) => Promise<void>;
};

// `categories` is widened from PieceCategory[] for the cross-bundle reason
// above; `auth` is the raw property, not the framework's PieceAuthProperty.
export type ApPiece = Pick<PieceBase, "displayName"> &
  Partial<
    Pick<
      PieceBase,
      | "description"
      | "logoUrl"
      | "authors"
      | "minimumSupportedRelease"
      | "maximumSupportedRelease"
    >
  > & {
    categories?: string[];
    // An array when the piece offers several auth methods.
    auth?: ApProperty | ApProperty[];
    // A bundle exposes these as the built record or as a zero-arg method; the
    // framework's own Piece class only ever has the method.
    actions?: Record<string, ApAction> | (() => Record<string, ApAction>);
    triggers?: Record<string, ApTrigger> | (() => Record<string, ApTrigger>);
    getAction?: (name: string) => ApAction | undefined;
    getTrigger?: (name: string) => ApTrigger | undefined;
    metadata?: () => Record<string, unknown>;
  };

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

// Form descriptors driving property panels; pure data, mirrors the
// ConnectorPropDescriptor shape from the workflow runtime.
import type { BlockRef } from "@powerhousedao/pieces-framework/block-type";
import type { TriggerDelivery } from "@powerhousedao/pieces-framework/workflow";

export interface BlockFormProp {
  name: string;
  displayName: string;
  type: string;
  required: boolean;
  defaultValue?: unknown;
  staticOptions?: FormOption[];
  // A STATIC_DROPDOWN's own state, beside its options.
  staticDisabled?: boolean;
  staticPlaceholder?: string;
  hasDynamicResolver?: boolean;
  description?: string;
  placeholder?: string;
  // Sibling prop names whose values feed the resolver; a change re-runs it.
  refreshers?: string[];
  // Nested shape: ARRAY item fields, or what a DYNAMIC resolver produced.
  properties?: BlockFormProp[];
  // Folded behind "Advanced": fields with a working default, so the common
  // case is short. Opens expanded when set, else live config would be hidden.
  advanced?: boolean;
  // Shown only while a sibling prop holds one of these values; data, not a
  // predicate, so a form arriving as JSON can express it.
  showWhen?: { prop: string; oneOf: unknown[] };
  // Activepieces layout and control hints, as the piece declared them.
  width?: "half" | "full";
  icon?: string;
  // CHECKBOX: sibling props shown only while it is checked.
  reveals?: string[];
  // MARKDOWN: BORDERLESS | INFO | WARNING | TIP.
  variant?: string;
  // STATIC_DROPDOWN "cards", NUMBER "stepper", DATE_RANGE "dropdown",
  // LONG_TEXT "code" (monospace).
  display?: string;
  min?: number;
  max?: number;
  step?: number;
  // DROPDOWN: options() is re-run with what the author types.
  refreshOnSearch?: boolean;
  // RICH_TEXT: the sibling whose value picks plain, markdown or html.
  formatProperty?: string;
  // SHORT_TEXT: a checkbox with this label that stores "" on purpose.
  emptyChoice?: string;
}

export interface FormOption {
  label: string;
  value: unknown;
  description?: string;
  icon?: string;
}

export interface PropertyGroup {
  key: string;
  // tabs | section | summary | builder | footer
  display: string;
  label?: string;
  description?: string;
  icon?: string;
  props: string[];
}

export interface ErrorHandlingDefaults {
  retryOnFailure?: { defaultValue?: boolean; hide?: boolean };
  continueOnFailure?: { defaultValue?: boolean; hide?: boolean };
}

export interface BlockForm {
  title: string;
  requireAuth: boolean;
  // Whether the block takes a connection: none hides the field entirely.
  auth?: "none" | "optional" | "required";
  props: BlockFormProp[];
  // Output ports the block declares; edges on any other are never taken.
  ports?: readonly string[];
  // A form drawn instead of the props, e.g. "schedule" for the builder.
  display?: string;
  // Triggers only, from checkTriggerStrategy. A webhook trigger is fed by a
  // request, so the panel shows its endpoint URL.
  triggerDelivery?: TriggerDelivery;
  // What the step does, as the piece describes it.
  description?: string;
  propertyGroups?: PropertyGroup[];
  // READ | SEARCH | WRITE | DESTRUCTIVE
  classification?: string;
  errorHandling?: ErrorHandlingDefaults;
}

export interface ConnectionSummary {
  id: string;
  name: string;
  connectorId: string;
  authType: string;
  status: string;
  accountLabel: string | null;
}

export interface SecretStat {
  ref: string;
  label: string | null;
  version: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// Minting seam for PH_SECRET_REF props: the field takes a value and the
// document only ever receives the ref that comes back.
export interface SecretFormService {
  save: (input: {
    ref?: string;
    value: string;
    label: string;
  }) => Promise<SecretStat>;
  stat: (ref: string) => Promise<SecretStat | null>;
}

export interface WebhookEndpoint {
  workflowId: string;
  url: string;
  // False when `url` is a bare path because the reactor has no public origin.
  absoluteUrl: boolean;
  armed: boolean;
  createdAt: string;
}

export interface DesignTimeService {
  getBlockForm: (block: BlockRef) => Promise<BlockForm | null>;
  loadOptions: (
    block: BlockRef,
    propName: string,
    input: Record<string, unknown>,
    connectionId?: string,
    searchValue?: string,
  ) => Promise<unknown>;
  // Runs the current workflow's piece trigger test hook; sample items back.
  testTrigger?: () => Promise<unknown>;
  // Runs one draft step against the last tests of the blocks it reads.
  testStep?: (stepId: string) => Promise<StepTestOutcome>;
  // The current workflow's webhook endpoint, for the core webhook trigger.
  webhookEndpoint?: () => Promise<WebhookEndpoint | null>;
  // Backs PH_SECRET_REF props; absent when the runtime refuses secret writes.
  secrets?: SecretFormService;
  // powerhouse/connection documents for the connection picker.
  listConnections?: () => Promise<ConnectionSummary[]>;
  // Tells apart listings narrowed differently, e.g. per drive; part of the key.
  connectionScope?: string;
  // The workflow being edited; keys its run and endpoint queries.
  workflowId?: string;
  // The current workflow's most recent run, for a step's "Last run" preview.
  latestRun?: () => Promise<LatestRun | null>;
  // One journaled run by id, e.g. the trigger's last test.
  fetchRun?: (runId: string) => Promise<LatestRun | null>;
  // The piece version each draft block runs, trigger first.
  blockResolutions?: () => Promise<BlockResolutionView[]>;
}

export type BlockMatchView =
  | "exact"
  | "compatible"
  | "fallback"
  | "installed"
  | "missing";

// A draft block as the runtime would run it; host-bound pieces are "installed".
export interface BlockResolutionView {
  stepId: string;
  pieceName: string;
  // The version the block pins.
  pieceVersion: string;
  name: string;
  kind: "action" | "trigger";
  resolvedVersion: string | null;
  source: string | null;
  match: BlockMatchView;
  note: string | null;
  latestVersion: string | null;
}

export interface StepTestOutcome {
  // Null when nothing ran, e.g. `Test "fetch" first`.
  runId: string | null;
  status: "SUCCEEDED" | "FAILED";
  output?: unknown;
  error: string | null;
  durationMs: number;
}

export interface LatestRun {
  id?: string;
  status: string;
  error?: string | null;
  startedAt: string;
  triggerPayload: unknown;
  steps: {
    stepKey: string;
    status: string;
    input: unknown;
    output: unknown;
    error: string | null;
  }[];
}

// Ours, not the piece's: the reactor's poll cadence for a piece trigger.
// Appended to every piece trigger's form; see splitPollInterval in the runtime.
export const POLL_INTERVAL_PROP: BlockFormProp = {
  name: "pollEverySeconds",
  displayName: "Poll every (seconds)",
  type: "NUMBER",
  required: false,
  description:
    "How often the reactor checks this trigger; 60 at the least. Omit to follow the piece's own cadence.",
};

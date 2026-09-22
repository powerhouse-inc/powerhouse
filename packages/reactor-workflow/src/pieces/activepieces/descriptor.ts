import {
  getActions,
  getTriggers,
  type ApPiece,
  type ApProperty,
  type ApPropertyType,
  type ApDropdownOption,
  type ApTrigger,
  type ApTriggerStrategy,
} from "./types.js";

export interface PiecePropDescriptor {
  name: string;
  displayName: string;
  description?: string;
  placeholder?: string;
  type: ApPropertyType;
  required: boolean;
  defaultValue?: unknown;
  // STATIC_DROPDOWN choices, extracted so the editor needs no runtime call.
  staticOptions?: ApDropdownOption[];
  // True when the prop carries a design-time resolver (DROPDOWN options() / DYNAMIC props()).
  hasDynamicResolver: boolean;
  // Synthesised domain-provider id: activepieces:<pkg>#<action>.<prop> (doc 08 §6.3).
  // Only top-level props get one; nested resolvers are not addressable yet.
  dynamicResolverId?: string;
  // Sibling prop names whose values feed the resolver; the editor re-runs
  // it when any of them changes.
  refreshers?: string[];
  // Nested shape: an ARRAY item's fields, or the props a DYNAMIC resolver
  // produced (see describeProperties). OBJECT props are free-form and carry none.
  properties?: PiecePropDescriptor[];
}

export interface PieceActionDescriptor {
  name: string;
  displayName: string;
  description?: string;
  // UI metadata only — not a credential contract (spike finding).
  requireAuth: boolean;
  props: PiecePropDescriptor[];
  // Carried verbatim: it is what the expression picker builds a later step's
  // field list from, and a package piece has no published listing to read.
  outputSchema?: unknown;
  // Orders the action picker, so a package piece that declares it must be
  // ordered by it too rather than counting as unset.
  audience?: string;
}

export interface PieceTriggerDescriptor {
  name: string;
  displayName: string;
  description?: string;
  strategy: ApTriggerStrategy;
  testStrategy?: string;
  requireAuth: boolean;
  props: PiecePropDescriptor[];
  outputSchema?: unknown;
  hasSampleData: boolean;
  // The sample itself, not just whether there is one: a trigger that declares
  // no outputSchema is read for its shape instead.
  sampleData?: unknown;
  // How the sender proves the endpoint exists before it will register it.
  // Absent when the trigger declares no handshake, or declares NONE.
  handshake?: { strategy: string; paramName?: string };
}

export interface PieceAuthDescriptor {
  type: ApPropertyType;
  displayName?: string;
  description?: string;
  required?: boolean;
  // CUSTOM_AUTH's own fields. Without them a connection form has nothing to
  // ask for, which is what a piece read from a package rather than a published
  // listing would otherwise leave the editor with.
  props?: PiecePropDescriptor[];
}

// NONE is how the framework spells "no handshake", so it is not carried:
// a caller checking the field would otherwise have to know that too.
function describeHandshake(
  trigger: ApTrigger,
): { strategy: string; paramName?: string } | undefined {
  const strategy = trigger.handshakeConfiguration?.strategy;
  if (!strategy || strategy === "NONE") return undefined;
  return { strategy, paramName: trigger.handshakeConfiguration?.paramName };
}

export interface PieceSource {
  packageName: string;
  version: string;
}

// Serializable descriptor of an adapted piece; the engine never learns
// Activepieces exists (doc 08 §6.2).
export interface PieceDescriptor {
  id: string;
  source: PieceSource;
  displayName: string;
  description?: string;
  logoUrl?: string;
  categories?: string[];
  auth?: PieceAuthDescriptor;
  minimumSupportedRelease?: string;
  maximumSupportedRelease?: string;
  actions: PieceActionDescriptor[];
  triggers: PieceTriggerDescriptor[];
}

function hasResolver(prop: ApProperty): boolean {
  return typeof prop.options === "function" || typeof prop.props === "function";
}

function toPropDescriptor(
  name: string,
  prop: ApProperty,
  resolverId?: string,
): PiecePropDescriptor {
  const dynamic = hasResolver(prop);
  const descriptor: PiecePropDescriptor = {
    name,
    displayName: prop.displayName ?? name,
    type: prop.type ?? "UNKNOWN",
    required: prop.required ?? false,
    hasDynamicResolver: dynamic,
  };
  if (typeof prop.description === "string" && prop.description !== "") {
    descriptor.description = prop.description;
  }
  if (typeof prop.placeholder === "string" && prop.placeholder !== "") {
    descriptor.placeholder = prop.placeholder;
  }
  if (prop.defaultValue !== undefined) {
    descriptor.defaultValue = prop.defaultValue;
  }
  if (dynamic && resolverId) {
    descriptor.dynamicResolverId = resolverId;
  }
  if (dynamic && Array.isArray(prop.refreshers)) {
    descriptor.refreshers = prop.refreshers.filter(
      (entry): entry is string => typeof entry === "string",
    );
  }
  if (typeof prop.options === "object" && Array.isArray(prop.options.options)) {
    descriptor.staticOptions = prop.options.options.map((o) => ({
      label: o.label,
      value: o.value,
    }));
  }
  if (prop.properties && typeof prop.properties === "object") {
    const nested = describeProperties(prop.properties);
    if (nested.length > 0) descriptor.properties = nested;
  }
  return descriptor;
}

// Descriptor list for a props map: nested ARRAY items and what a DYNAMIC
// resolver returns, so the editor never sees raw piece properties.
export function describeProperties(
  props: Record<string, ApProperty> | null | undefined,
  resolverIdFor?: (propName: string) => string,
): PiecePropDescriptor[] {
  if (!props || typeof props !== "object") return [];
  return Object.entries(props)
    .filter((entry): entry is [string, ApProperty] =>
      isPropertyObject(entry[1]),
    )
    .map(([propName, prop]) =>
      toPropDescriptor(propName, prop, resolverIdFor?.(propName)),
    );
}

// Bundles are duck-typed; a props map may carry non-object junk.
function isPropertyObject(value: unknown): value is ApProperty {
  return value !== null && typeof value === "object";
}

// Pure translation over a loaded piece; performs no I/O and never executes
// piece code beyond the actions()/triggers() accessors.
export function buildDescriptor(
  piece: ApPiece,
  source: PieceSource,
): PieceDescriptor {
  const actions = Object.entries(getActions(piece)).map(
    ([actionName, action]): PieceActionDescriptor => ({
      name: action.name ?? actionName,
      displayName: action.displayName ?? actionName,
      description: action.description,
      requireAuth: action.requireAuth ?? false,
      props: describeProperties(
        action.props,
        (propName) =>
          `activepieces:${source.packageName}#${actionName}.${propName}`,
      ),
      ...(action.outputSchema !== undefined
        ? { outputSchema: action.outputSchema }
        : {}),
      ...(action.audience !== undefined ? { audience: action.audience } : {}),
    }),
  );

  const triggers = Object.entries(getTriggers(piece)).map(
    ([triggerName, trigger]): PieceTriggerDescriptor => ({
      name: trigger.name ?? triggerName,
      displayName: trigger.displayName ?? triggerName,
      description: trigger.description,
      strategy: trigger.type ?? "UNKNOWN",
      testStrategy: trigger.testStrategy,
      requireAuth: trigger.requireAuth ?? false,
      props: describeProperties(
        trigger.props,
        (propName) =>
          `activepieces:${source.packageName}#${triggerName}.${propName}`,
      ),
      ...(trigger.outputSchema !== undefined
        ? { outputSchema: trigger.outputSchema }
        : {}),
      hasSampleData:
        trigger.sampleData !== undefined && trigger.sampleData !== null,
      ...(trigger.sampleData !== undefined && trigger.sampleData !== null
        ? { sampleData: trigger.sampleData }
        : {}),
      handshake: describeHandshake(trigger),
    }),
  );

  const descriptor: PieceDescriptor = {
    id: `activepieces:${source.packageName}`,
    source,
    displayName: piece.displayName,
    description: piece.description,
    logoUrl: piece.logoUrl,
    categories: piece.categories,
    minimumSupportedRelease: piece.minimumSupportedRelease,
    maximumSupportedRelease: piece.maximumSupportedRelease,
    actions,
    triggers,
  };
  if (piece.auth && typeof piece.auth === "object") {
    // CUSTOM_AUTH carries a record here; a DYNAMIC prop would carry a
    // resolver function, which is not an auth shape at all.
    const authProps =
      piece.auth.props && typeof piece.auth.props === "object"
        ? describeProperties(piece.auth.props)
        : [];
    descriptor.auth = {
      type: piece.auth.type ?? "UNKNOWN",
      displayName: piece.auth.displayName,
      description: piece.auth.description,
      required: piece.auth.required,
      ...(authProps.length > 0 ? { props: authProps } : {}),
    };
  }
  return descriptor;
}

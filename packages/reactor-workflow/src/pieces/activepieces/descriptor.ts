import {
  getActions,
  getTriggers,
  type ApPiece,
  type ApProperty,
  type ApPropertyType,
  type ApDropdownOption,
  type ApTriggerStrategy,
} from "./types.js";

export interface ConnectorPropDescriptor {
  name: string;
  displayName: string;
  type: ApPropertyType;
  required: boolean;
  defaultValue?: unknown;
  // STATIC_DROPDOWN choices, extracted so the editor needs no runtime call.
  staticOptions?: ApDropdownOption[];
  // True when the prop carries a design-time resolver (DROPDOWN options() / DYNAMIC props()).
  hasDynamicResolver: boolean;
  // Synthesised domain-provider id: activepieces:<pkg>#<action>.<prop> (doc 08 §6.3).
  dynamicResolverId?: string;
}

export interface ConnectorActionDescriptor {
  name: string;
  displayName: string;
  description?: string;
  // UI metadata only — not a credential contract (spike finding).
  requireAuth: boolean;
  props: ConnectorPropDescriptor[];
}

export interface ConnectorTriggerDescriptor {
  name: string;
  displayName: string;
  description?: string;
  strategy: ApTriggerStrategy;
  testStrategy?: string;
  requireAuth: boolean;
  props: ConnectorPropDescriptor[];
  hasSampleData: boolean;
}

export interface ConnectorAuthDescriptor {
  type: ApPropertyType;
  displayName?: string;
  required?: boolean;
}

export interface ConnectorSource {
  packageName: string;
  version: string;
}

// Serializable descriptor of an adapted piece; the engine never learns
// Activepieces exists (doc 08 §6.2).
export interface ConnectorDescriptor {
  id: string;
  source: ConnectorSource;
  displayName: string;
  description?: string;
  logoUrl?: string;
  categories?: string[];
  auth?: ConnectorAuthDescriptor;
  minimumSupportedRelease?: string;
  maximumSupportedRelease?: string;
  actions: ConnectorActionDescriptor[];
  triggers: ConnectorTriggerDescriptor[];
}

function hasResolver(prop: ApProperty): boolean {
  return typeof prop.options === "function" || typeof prop.props === "function";
}

function toPropDescriptor(
  name: string,
  prop: ApProperty,
  resolverId: string,
): ConnectorPropDescriptor {
  const dynamic = hasResolver(prop);
  const descriptor: ConnectorPropDescriptor = {
    name,
    displayName: prop.displayName ?? name,
    type: prop.type ?? "UNKNOWN",
    required: prop.required ?? false,
    hasDynamicResolver: dynamic,
  };
  if (prop.defaultValue !== undefined) {
    descriptor.defaultValue = prop.defaultValue;
  }
  if (dynamic) {
    descriptor.dynamicResolverId = resolverId;
  }
  if (typeof prop.options === "object" && Array.isArray(prop.options.options)) {
    descriptor.staticOptions = prop.options.options.map((o) => ({
      label: o.label,
      value: o.value,
    }));
  }
  return descriptor;
}

// Pure translation over a loaded piece; performs no I/O and never executes
// piece code beyond the actions()/triggers() accessors.
export function buildDescriptor(
  piece: ApPiece,
  source: ConnectorSource,
): ConnectorDescriptor {
  const actions = Object.entries(getActions(piece)).map(
    ([actionName, action]): ConnectorActionDescriptor => ({
      name: action.name ?? actionName,
      displayName: action.displayName ?? actionName,
      description: action.description,
      requireAuth: action.requireAuth ?? false,
      props: Object.entries(action.props ?? {}).map(([propName, prop]) =>
        toPropDescriptor(
          propName,
          prop,
          `activepieces:${source.packageName}#${actionName}.${propName}`,
        ),
      ),
    }),
  );

  const triggers = Object.entries(getTriggers(piece)).map(
    ([triggerName, trigger]): ConnectorTriggerDescriptor => ({
      name: trigger.name ?? triggerName,
      displayName: trigger.displayName ?? triggerName,
      description: trigger.description,
      strategy: trigger.type ?? "UNKNOWN",
      testStrategy: trigger.testStrategy,
      requireAuth: trigger.requireAuth ?? false,
      props: Object.entries(trigger.props ?? {}).map(([propName, prop]) =>
        toPropDescriptor(
          propName,
          prop,
          `activepieces:${source.packageName}#${triggerName}.${propName}`,
        ),
      ),
      hasSampleData:
        trigger.sampleData !== undefined && trigger.sampleData !== null,
    }),
  );

  const descriptor: ConnectorDescriptor = {
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
    descriptor.auth = {
      type: piece.auth.type ?? "UNKNOWN",
      displayName: piece.auth.displayName,
      required: piece.auth.required,
    };
  }
  return descriptor;
}

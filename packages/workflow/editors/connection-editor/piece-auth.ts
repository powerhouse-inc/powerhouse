// Turns a piece's PieceAuth descriptor into a concrete field plan that maps
// onto powerhouse/connection state: config fields vs secret refs.
import type { ConnectionAuthType } from "document-models/connection";

export interface AuthField {
  name: string;
  displayName: string;
  required: boolean;
  description?: string;
  // Non-secret fields only: SHORT_TEXT | NUMBER | CHECKBOX | STATIC_DROPDOWN.
  inputType?: string;
  options?: { label: string; value: unknown }[];
}

// A piece auth type this runtime doesn't know: shown, never saved.
export const UNKNOWN_AUTH = "UNKNOWN";

export interface AuthPlan {
  authType: ConnectionAuthType | typeof UNKNOWN_AUTH;
  displayName?: string;
  description?: string;
  configFields: AuthField[];
  secretFields: AuthField[];
  // OAUTH2 / OIDC are declared but not executable by the runtime yet.
  supported: boolean;
  // The piece's own name for an UNKNOWN auth type.
  declaredType?: string;
}

// Missing means unset, explicitly null, or emptied to "" - not `false`/`0`.
export function isConfigValueMissing(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

// Whether every required config/secret field of the plan is filled; pure so
// it can drive a live re-check as the user edits, not just a one-time mark.
export function isAuthComplete(
  plan: AuthPlan,
  config: Record<string, unknown>,
  refs: Map<string, string>,
): boolean {
  const configOk = plan.configFields.every(
    (field) => !field.required || !isConfigValueMissing(config[field.name]),
  );
  const secretsOk = plan.secretFields.every(
    (field) => !field.required || Boolean(refs.get(field.name)),
  );
  return configOk && secretsOk;
}

interface AuthPropDescriptor {
  displayName?: string;
  description?: string;
  required?: boolean;
  type?: string;
  options?: { options?: { label?: string; value?: unknown }[] };
}

interface PieceAuthDescriptor {
  type?: string;
  unsupported?: string;
  displayName?: string;
  description?: string;
  required?: boolean;
  props?: Partial<Record<string, AuthPropDescriptor>>;
}

function toField(name: string, prop: AuthPropDescriptor): AuthField {
  return {
    name,
    displayName: prop.displayName ?? name,
    required: prop.required ?? false,
    description: prop.description,
    inputType: prop.type,
    options: prop.options?.options
      ?.filter((option) => option.value !== undefined)
      .map((option) => ({
        label: option.label ?? String(option.value as string),
        value: option.value,
      })),
  };
}

// Every sign-in method a piece offers, in its order, one per auth type.
export function plansFromAuth(auth: unknown): AuthPlan[] {
  const plans = (Array.isArray(auth) ? auth : [auth]).map(planFromAuth);
  return plans.filter(
    (plan, index) =>
      plans.findIndex((other) => other.authType === plan.authType) === index,
  );
}

// The method a connection signs in with: the one of its auth type when the
// runtime can run it, otherwise the piece's default.
export function planForConnection(
  auth: unknown,
  authType: ConnectionAuthType,
): AuthPlan {
  return (
    plansFromAuth(auth).find(
      (plan) => plan.authType === authType && plan.supported,
    ) ?? planFromAuth(auth)
  );
}

export function planFromAuth(auth: unknown): AuthPlan {
  // Some pieces declare multiple auth methods; prefer one the runtime supports.
  if (Array.isArray(auth)) {
    const plans = auth.map(planFromAuth);
    return (
      plans.find((plan) => plan.supported && plan.authType !== "NONE") ??
      plans.at(0) ??
      planFromAuth(null)
    );
  }
  const descriptor = (auth ?? null) as PieceAuthDescriptor | null;
  const plan = planForDescriptor(descriptor);
  // The runtime's own verdict, e.g. a CUSTOM_AUTH that needs token refresh.
  return descriptor?.unsupported ? { ...plan, supported: false } : plan;
}

function planForDescriptor(descriptor: PieceAuthDescriptor | null): AuthPlan {
  const base = {
    displayName: descriptor?.displayName,
    description: descriptor?.description,
  };
  switch (descriptor?.type) {
    case "SECRET_TEXT":
      return {
        ...base,
        authType: "SECRET_TEXT",
        configFields: [],
        secretFields: [
          {
            name: "value",
            displayName: descriptor.displayName ?? "Secret",
            required: descriptor.required ?? true,
            description: descriptor.description,
          },
        ],
        supported: true,
      };
    case "BASIC_AUTH": {
      const props = descriptor.props ?? {};
      return {
        ...base,
        authType: "BASIC_AUTH",
        configFields: [
          toField("username", props.username ?? { displayName: "Username" }),
        ],
        secretFields: [
          toField("password", props.password ?? { displayName: "Password" }),
        ],
        supported: true,
      };
    }
    case "CUSTOM_AUTH": {
      const entries = Object.entries(descriptor.props ?? {}).filter(
        (entry): entry is [string, AuthPropDescriptor] =>
          entry[1] !== undefined,
      );
      return {
        ...base,
        authType: "CUSTOM_AUTH",
        configFields: entries
          .filter(([, prop]) => prop.type !== "SECRET_TEXT")
          .map(([name, prop]) => toField(name, prop)),
        secretFields: entries
          .filter(([, prop]) => prop.type === "SECRET_TEXT")
          .map(([name, prop]) => toField(name, prop)),
        supported: true,
      };
    }
    case "OAUTH2":
      return {
        ...base,
        authType: "OAUTH2",
        configFields: [],
        secretFields: [],
        supported: false,
      };
    case "OIDC":
      return {
        ...base,
        authType: "OIDC",
        configFields: [],
        secretFields: [],
        supported: false,
      };
    case undefined:
    case "NONE":
      return {
        ...base,
        authType: "NONE",
        configFields: [],
        secretFields: [],
        supported: true,
      };
    default:
      return {
        ...base,
        authType: UNKNOWN_AUTH,
        declaredType: descriptor?.type,
        configFields: [],
        secretFields: [],
        supported: false,
      };
  }
}

// "@activepieces/piece-gotify" -> "@activepieces/piece-gotify#gotify"
export function connectorIdForPiece(packageName: string): string {
  const short =
    packageName
      .split("/")
      .pop()
      ?.replace(/^piece-/, "") ?? packageName;
  return `${packageName}#${short}`;
}

// "<piece package>#<short name>" -> the package; a bare name is its own.
export function packageFromConnectorId(connectorId: string): string {
  const separator = connectorId.lastIndexOf("#");
  if (separator <= 0) return connectorId;
  const spec = connectorId.slice(0, separator);
  const at = spec.indexOf("@", 1);
  return at > 0 ? spec.slice(0, at) : spec;
}

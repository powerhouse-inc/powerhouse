import { checkTriggerStrategy } from "@powerhousedao/pieces-framework/workflow";
import { Cron } from "croner";

// Piece features this engine cannot run. Read off a loaded piece or off its
// published listing alike, since both carry auth and triggers as data.
const ISSUES_URL = "https://github.com/powerhouse-inc/powerhouse/issues/";

export interface UnsupportedFeature {
  feature: string;
  issue: number;
  // "<feature> is not supported yet (<issue url>)", what a listing shows.
  reason: string;
}

function unsupported(feature: string, issue: number): UnsupportedFeature {
  return {
    feature,
    issue,
    reason: `${feature} is not supported yet (${ISSUES_URL}${issue})`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// A piece's auth, from the bundle or the listing. With several methods the
// piece runs if any one does; the connection picks which.
export function unsupportedAuth(auth: unknown): UnsupportedFeature | undefined {
  if (Array.isArray(auth)) {
    const reasons = auth.map(unsupportedMethod);
    return reasons.some((reason) => reason === undefined)
      ? undefined
      : reasons[0];
  }
  return unsupportedMethod(auth);
}

// The method a connection of `type` signs in with: the piece's only auth,
// or the entry of that type among several (upstream's getAuthPropertyForValue).
export function authMethodFor(auth: unknown, type: unknown): unknown {
  if (!Array.isArray(auth)) return auth;
  return auth.find((entry) => isRecord(entry) && entry.type === type);
}

function unsupportedMethod(auth: unknown): UnsupportedFeature | undefined {
  if (!isRecord(auth)) return undefined;
  if (auth.type === "OAUTH2" && auth.grantType === "client_credentials") {
    return unsupported("OAuth2 client credentials", 3091);
  }
  if (auth.type === "OIDC") return unsupported("OIDC auth", 3091);
  if (auth.type === "CUSTOM_AUTH" && auth.refresh != null) {
    return unsupported("CustomAuth refresh", 3091);
  }
  return undefined;
}

// A piece trigger; the core piece's triggers are fed by the host and never pass here.
export function unsupportedTrigger(trigger: {
  type?: unknown;
  renewConfiguration?: unknown;
}): UnsupportedFeature | undefined {
  if (trigger.type === "MANUAL") {
    return unsupported("TriggerStrategy.MANUAL", 3091);
  }
  const strategy = checkTriggerStrategy(trigger.type);
  if ("issue" in strategy) {
    const issue = trigger.type === "APP_WEBHOOK" ? 3081 : 3091;
    return {
      feature: `TriggerStrategy ${String(trigger.type)}`,
      issue,
      reason: `${strategy.issue} (${ISSUES_URL}${issue})`,
    };
  }
  const problem = renewProblem(trigger.renewConfiguration);
  if (problem) {
    return {
      feature: "renewConfiguration",
      issue: 3090,
      reason: `renewConfiguration ${problem} (${ISSUES_URL}3090)`,
    };
  }
  return undefined;
}

// A subscription the supervisor renews on a UTC cron by calling onRenew.
export interface TriggerRenew {
  strategy: "CRON";
  cronExpression: string;
}

function cronFires(cron: string): boolean {
  try {
    return (
      new Cron(cron, { timezone: "UTC", legacyMode: false }).nextRun() !== null
    );
  } catch {
    return false;
  }
}

// createTrigger fills in { strategy: "NONE" } for every trigger.
function renewProblem(renew: unknown): string | undefined {
  if (renew === undefined || renew === null) return undefined;
  if (!isRecord(renew)) return "is not an object";
  if (renew.strategy === "NONE") return undefined;
  if (renew.strategy !== "CRON") {
    return `strategy ${String(renew.strategy)} is not supported`;
  }
  const cron = renew.cronExpression;
  if (typeof cron !== "string" || !cronFires(cron)) {
    return `cron ${JSON.stringify(cron)} is invalid`;
  }
  return undefined;
}

// The trigger's renewal, when it declares a valid CRON one.
export function triggerRenew(trigger: {
  renewConfiguration?: unknown;
}): TriggerRenew | undefined {
  const renew = trigger.renewConfiguration;
  if (!isRecord(renew) || renew.strategy !== "CRON") return undefined;
  if (renewProblem(renew)) return undefined;
  return { strategy: "CRON", cronExpression: renew.cronExpression as string };
}

export class UnsupportedPieceFeatureError extends Error {
  readonly feature: string;
  readonly issue: number;

  constructor(subject: string, unsupportedFeature: UnsupportedFeature) {
    super(`${subject}: ${unsupportedFeature.reason}`);
    this.name = "UnsupportedPieceFeatureError";
    this.feature = unsupportedFeature.feature;
    this.issue = unsupportedFeature.issue;
  }
}

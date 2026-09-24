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

// A piece's auth, from the bundle or the listing.
export function unsupportedAuth(auth: unknown): UnsupportedFeature | undefined {
  if (Array.isArray(auth)) {
    return unsupported("Multi-auth (auth as an array)", 3091);
  }
  if (!isRecord(auth)) return undefined;
  if (auth.type === "OAUTH2") return unsupported("OAuth2 auth", 3091);
  if (auth.type === "OIDC") return unsupported("OIDC auth", 3091);
  if (auth.type === "CUSTOM_AUTH" && auth.refresh != null) {
    return unsupported("CustomAuth refresh", 3091);
  }
  return undefined;
}

// A piece trigger; core#manual is the engine's own and never passes here.
export function unsupportedTrigger(trigger: {
  type?: unknown;
  renewConfiguration?: unknown;
}): UnsupportedFeature | undefined {
  if (trigger.type === "MANUAL") {
    return unsupported("TriggerStrategy.MANUAL", 3091);
  }
  const renew = trigger.renewConfiguration;
  // createTrigger fills in { strategy: "NONE" } for every trigger.
  if (isRecord(renew) && renew.strategy !== "NONE") {
    return unsupported("renewConfiguration", 3090);
  }
  return undefined;
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

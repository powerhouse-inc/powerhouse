/**
 * The publication gate: the host's authorization facts, judged.
 *
 * Publishing a project through Portle puts its switchboard on the internet,
 * so the plugin refuses to bring the tunnel up unless the host is locked
 * down and the person asking is one of its admins. The gate is expressed in
 * terms of the RESOLVED authorization settings, never the environment
 * variables that produced them: `DEFAULT_PROTECTION` is inert under
 * `ADMIN_ONLY`, and the env can be contradicted by the config file.
 *
 * It is an interlock, not security. The server does not become safer because
 * the studio refuses; what makes the gate mean something is that the same
 * plugin owns the tunnel, so "published" implies "locked down" for as long as
 * the plugin is the thing publishing.
 */

/** The host's authorization policy, as reactor-api resolves it at boot. */
export type PortlePolicy = "OPEN" | "ADMIN_ONLY" | "DOCUMENT_PERMISSIONS";

/** What the gate judges: read off the switchboard's `API` object. */
export interface GateFacts {
  policy: PortlePolicy;
  /** Lower-cased addresses of the host's supreme admins. */
  admins: readonly string[];
  /** Documents without a permission row count as protected. */
  defaultProtection: boolean;
  /** The bearer is verified and `ctx.user` is populated. */
  identityResolved: boolean;
  /** Anonymous callers are refused with a 401 before any resolver. */
  requireAuthenticatedCaller: boolean;
}

export interface GateCheck {
  id: GateCheckId;
  ok: boolean;
  /** What was found. */
  detail: string;
  /** What to change when `ok` is false. */
  fix?: string;
}

export type GateCheckId =
  | "identity"
  | "floor"
  | "policy"
  | "protection"
  | "admins"
  | "caller"
  | "custom-subgraphs";

export interface GateReport {
  /** Every check passed: the tunnel may come up for this caller. */
  publishable: boolean;
  checks: GateCheck[];
  /** True of every deployment; not blocking, never silent. */
  warnings: GateCheck[];
}

/** One of the host's listed admins, whatever the policy. */
export function isListedAdmin(
  admins: readonly string[],
  address: string | undefined,
): boolean {
  if (!address) return false;
  const caller = address.toLowerCase();
  return admins.some((admin) => admin.toLowerCase() === caller);
}

const POLICY_FIX =
  "Set AUTH_ENABLED=true (or auth.enabled in powerhouse.config.json). ADMIN_ONLY is enough; DOCUMENT_PERMISSIONS_ENABLED=true with DEFAULT_PROTECTION=true also passes.";

export function evaluateGate(
  facts: GateFacts,
  caller: { address?: string } | undefined,
): GateReport {
  const policyOk =
    facts.policy === "ADMIN_ONLY" ||
    (facts.policy === "DOCUMENT_PERMISSIONS" && facts.defaultProtection);

  const checks: GateCheck[] = [
    {
      id: "identity",
      ok: facts.identityResolved,
      detail: facts.identityResolved
        ? "Bearer tokens are verified and the caller is known to every resolver."
        : "The host never reads a bearer; no caller can be identified.",
      fix: facts.identityResolved
        ? undefined
        : "Set RESOLVE_CALLER_IDENTITY=true.",
    },
    {
      id: "floor",
      ok: facts.requireAuthenticatedCaller,
      detail: facts.requireAuthenticatedCaller
        ? "Anonymous callers are refused with a 401 before any resolver runs."
        : "Anonymous callers reach every subgraph.",
      fix: facts.requireAuthenticatedCaller
        ? undefined
        : "Set REQUIRE_AUTHENTICATED_CALLER=true (needs RESOLVE_CALLER_IDENTITY=true).",
    },
    {
      id: "policy",
      ok: policyOk,
      detail: describePolicy(facts),
      fix: policyOk ? undefined : POLICY_FIX,
    },
    {
      id: "protection",
      ok: facts.policy !== "DOCUMENT_PERMISSIONS" || facts.defaultProtection,
      detail:
        facts.policy === "DOCUMENT_PERMISSIONS"
          ? facts.defaultProtection
            ? "Documents without a permission row are protected."
            : "Documents without a permission row are readable by any caller."
          : "Not consulted under this policy.",
      fix:
        facts.policy === "DOCUMENT_PERMISSIONS" && !facts.defaultProtection
          ? "Set DEFAULT_PROTECTION=true."
          : undefined,
    },
    {
      id: "admins",
      ok: facts.admins.length > 0,
      detail:
        facts.admins.length > 0
          ? `${facts.admins.length} admin address(es) listed.`
          : "No admin address is listed; nobody could administer the published host.",
      fix:
        facts.admins.length > 0
          ? undefined
          : "Set ADMINS to the comma-separated addresses that may publish.",
    },
    {
      id: "caller",
      ok: isListedAdmin(facts.admins, caller?.address),
      detail: caller?.address
        ? isListedAdmin(facts.admins, caller.address)
          ? "You are one of the listed admins."
          : "You are signed in, but not one of the listed admins."
        : "You are not signed in.",
      fix: isListedAdmin(facts.admins, caller?.address)
        ? undefined
        : "Sign in with Renown as one of the ADMINS addresses.",
    },
  ];

  const warnings: GateCheck[] = [
    {
      id: "custom-subgraphs",
      ok: false,
      detail:
        "The project's own subgraphs enforce nothing by themselves; the policy and the floor do not reach their resolvers.",
      fix: "Have every custom resolver check the caller (assertCanRead or canRead on the drive it serves).",
    },
  ];

  return {
    publishable: checks.every((check) => check.ok),
    checks,
    warnings,
  };
}

/**
 * The gate without the caller: what the host itself must satisfy before the
 * tunnel may come up unattended at boot. The caller check is per request.
 */
export function bootGatePasses(facts: GateFacts): boolean {
  return evaluateGate(facts, undefined).checks.every(
    (check) => check.ok || check.id === "caller",
  );
}

function describePolicy(facts: GateFacts): string {
  switch (facts.policy) {
    case "OPEN":
      return "OPEN: everyone, anonymous included, may read and write everything.";
    case "ADMIN_ONLY":
      return "ADMIN_ONLY: only the listed admins may read or write anything.";
    case "DOCUMENT_PERMISSIONS":
      return facts.defaultProtection
        ? "DOCUMENT_PERMISSIONS with default protection: grants decide, unprotected documents do not exist."
        : "DOCUMENT_PERMISSIONS without default protection: documents with no permission row are open to every caller.";
  }
}

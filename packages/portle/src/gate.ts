/**
 * The publication gate: the host's authorization facts, judged.
 *
 * Publishing a project through Portle puts its switchboard on the internet,
 * so the plugin refuses to bring the tunnel up unless the host is locked
 * down and the person asking operates it (`ADMINS`, or whom its launcher
 * named with `PH_OPERATOR`). The gate is expressed in
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
  /**
   * Whether anyone operates the host: an address in `ADMINS`, or whom its
   * launcher named (`PH_OPERATOR`).
   */
  operatorsConfigured: boolean;
  /** Who operates the host, as its authorization settings name them. */
  operators: string;
  /** Whether `address` operates the host (its authorization service's `isOperator`). */
  isOperator: (address: string | undefined) => boolean;
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

const POLICY_FIX =
  "Set AUTH_ENABLED=true (or auth.enabled in powerhouse.config.json). ADMIN_ONLY is enough; DOCUMENT_PERMISSIONS_ENABLED=true with DEFAULT_PROTECTION=true also passes.";

export function evaluateGate(
  facts: GateFacts,
  caller: { address?: string } | undefined,
): GateReport {
  const policyOk =
    facts.policy === "ADMIN_ONLY" ||
    (facts.policy === "DOCUMENT_PERMISSIONS" && facts.defaultProtection);
  const callerOperates = facts.isOperator(caller?.address);

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
      ok: facts.operatorsConfigured,
      detail: facts.operatorsConfigured
        ? `An operator is configured: ${facts.operators}.`
        : "No operator is configured: neither ADMINS nor the launcher (PH_OPERATOR) names one, so nobody could administer the published host.",
      fix: facts.operatorsConfigured
        ? undefined
        : "Set ADMINS to the comma-separated addresses that may publish, or start the host with a launcher that sets PH_OPERATOR (ph run, ph vetra).",
    },
    {
      id: "caller",
      ok: callerOperates,
      detail: caller?.address
        ? callerOperates
          ? "You operate this host."
          : "You are signed in, but you do not operate this host (ADMINS, PH_OPERATOR)."
        : "You are not signed in.",
      fix: callerOperates
        ? undefined
        : "Sign in as one of the ADMINS addresses, or as the person the launcher names (PH_OPERATOR).",
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
      return "ADMIN_ONLY: only the host's operators (ADMINS, and whom its launcher named) may read or write anything.";
    case "DOCUMENT_PERMISSIONS":
      return facts.defaultProtection
        ? "DOCUMENT_PERMISSIONS with default protection: grants decide, unprotected documents do not exist."
        : "DOCUMENT_PERMISSIONS without default protection: documents with no permission row are open to every caller.";
  }
}

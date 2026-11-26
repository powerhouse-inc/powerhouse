import { describe, expect, it } from "vitest";
import { evaluateGate, type GateFacts } from "../src/gate.js";

const ADMIN = "0xAbC0000000000000000000000000000000000001";

const locked: GateFacts = {
  policy: "ADMIN_ONLY",
  operatorsConfigured: true,
  operators: "ADMINS (1)",
  isOperator: (address) => address?.toLowerCase() === ADMIN.toLowerCase(),
  defaultProtection: false,
  identityResolved: true,
  requireAuthenticatedCaller: true,
};

/** A host with no operator: no `ADMINS`, and no launcher named one. */
const unoperated: Partial<GateFacts> = {
  operatorsConfigured: false,
  operators: "nobody",
  isOperator: () => false,
};

function ids(report: ReturnType<typeof evaluateGate>, ok: boolean) {
  return report.checks.filter((c) => c.ok === ok).map((c) => c.id);
}

describe("evaluateGate", () => {
  it("passes a locked ADMIN_ONLY host for an operator", () => {
    const report = evaluateGate(locked, { address: ADMIN });
    expect(report.publishable).toBe(true);
    expect(ids(report, false)).toEqual([]);
    expect(report.checks.map((c) => c.id)).toEqual([
      "identity",
      "floor",
      "policy",
      "protection",
      "admins",
      "caller",
    ]);
    expect(report.checks.find((c) => c.id === "admins")?.detail).toBe(
      "An operator is configured: ADMINS (1).",
    );
  });

  it("does not consult default protection under ADMIN_ONLY", () => {
    const report = evaluateGate(
      { ...locked, defaultProtection: false },
      { address: ADMIN },
    );
    expect(report.publishable).toBe(true);
    expect(report.checks.find((c) => c.id === "protection")?.detail).toMatch(
      /not consulted/i,
    );
  });

  it("passes DOCUMENT_PERMISSIONS only with default protection", () => {
    const without = evaluateGate(
      { ...locked, policy: "DOCUMENT_PERMISSIONS", defaultProtection: false },
      { address: ADMIN },
    );
    expect(without.publishable).toBe(false);
    expect(ids(without, false)).toEqual(["policy", "protection"]);
    expect(without.checks.find((c) => c.id === "protection")?.fix).toBe(
      "Set DEFAULT_PROTECTION=true.",
    );

    const withProtection = evaluateGate(
      { ...locked, policy: "DOCUMENT_PERMISSIONS", defaultProtection: true },
      { address: ADMIN },
    );
    expect(withProtection.publishable).toBe(true);
  });

  it("fails an OPEN host on the policy, whoever asks", () => {
    const report = evaluateGate(
      { ...locked, policy: "OPEN" },
      { address: ADMIN },
    );
    expect(report.publishable).toBe(false);
    expect(ids(report, false)).toEqual(["policy"]);
    expect(report.checks.find((c) => c.id === "policy")?.fix).toContain(
      "AUTH_ENABLED=true",
    );
  });

  it("fails when identity resolution or the floor is off", () => {
    expect(
      ids(
        evaluateGate(
          { ...locked, identityResolved: false },
          { address: ADMIN },
        ),
        false,
      ),
    ).toEqual(["identity"]);
    expect(
      ids(
        evaluateGate(
          { ...locked, requireAuthenticatedCaller: false },
          { address: ADMIN },
        ),
        false,
      ),
    ).toEqual(["floor"]);
  });

  it("fails when no operator is configured, naming ADMINS and PH_OPERATOR, and the caller check too", () => {
    const report = evaluateGate(
      { ...locked, ...unoperated },
      { address: ADMIN },
    );
    expect(report.publishable).toBe(false);
    expect(ids(report, false)).toEqual(["admins", "caller"]);
    const check = report.checks.find((c) => c.id === "admins")!;
    expect(check.detail).toContain("No operator is configured");
    for (const text of [check.detail, check.fix]) {
      expect(text).toContain("ADMINS");
      expect(text).toContain("PH_OPERATOR");
    }
  });

  it("passes an operator the launcher named, in no ADMINS", () => {
    const launched = "0x0000000000000000000000000000000000000003";
    const report = evaluateGate(
      {
        ...locked,
        operators: "the OS user running it",
        isOperator: (address) => address === launched,
      },
      { address: launched },
    );
    expect(report.publishable).toBe(true);
    expect(report.checks.find((c) => c.id === "caller")?.detail).toBe(
      "You operate this host.",
    );
  });

  it("fails the caller check for an anonymous caller or one who does not operate the host", () => {
    const anonymous = evaluateGate(locked, undefined);
    expect(anonymous.publishable).toBe(false);
    expect(ids(anonymous, false)).toEqual(["caller"]);
    expect(anonymous.checks.find((c) => c.id === "caller")?.detail).toBe(
      "You are not signed in.",
    );

    const stranger = evaluateGate(locked, {
      address: "0x0000000000000000000000000000000000000002",
    });
    expect(ids(stranger, false)).toEqual(["caller"]);
    const caller = stranger.checks.find((c) => c.id === "caller")!;
    expect(caller.detail).toMatch(/do not operate this host/);
    expect(caller.fix).toContain("ADMINS");
    expect(caller.fix).toContain("PH_OPERATOR");
  });

  it("always carries the custom-subgraphs warning, which never blocks", () => {
    const report = evaluateGate(locked, { address: ADMIN });
    expect(report.warnings.map((w) => w.id)).toEqual(["custom-subgraphs"]);
    expect(report.publishable).toBe(true);
  });

  it("gives every failing check a fix and every passing check none", () => {
    const report = evaluateGate(
      {
        ...locked,
        ...unoperated,
        policy: "OPEN",
        identityResolved: false,
        requireAuthenticatedCaller: false,
      },
      undefined,
    );
    for (const check of report.checks) {
      expect(Boolean(check.fix)).toBe(!check.ok);
    }
  });
});

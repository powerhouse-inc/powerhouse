import { describe, expect, it } from "vitest";
import { evaluateGate, isListedAdmin, type GateFacts } from "../src/gate.js";

const ADMIN = "0xAbC0000000000000000000000000000000000001";

const locked: GateFacts = {
  policy: "ADMIN_ONLY",
  admins: [ADMIN.toLowerCase()],
  defaultProtection: false,
  identityResolved: true,
  requireAuthenticatedCaller: true,
};

function ids(report: ReturnType<typeof evaluateGate>, ok: boolean) {
  return report.checks.filter((c) => c.ok === ok).map((c) => c.id);
}

describe("isListedAdmin", () => {
  it("compares addresses case-insensitively", () => {
    expect(isListedAdmin([ADMIN.toLowerCase()], ADMIN)).toBe(true);
    expect(isListedAdmin([ADMIN], ADMIN.toLowerCase())).toBe(true);
  });

  it("refuses an anonymous or unlisted caller", () => {
    expect(isListedAdmin([ADMIN], undefined)).toBe(false);
    expect(
      isListedAdmin([ADMIN], "0x0000000000000000000000000000000000000002"),
    ).toBe(false);
    expect(isListedAdmin([], ADMIN)).toBe(false);
  });
});

describe("evaluateGate", () => {
  it("passes a locked ADMIN_ONLY host for a listed admin", () => {
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

  it("fails when no admin is listed, and names the caller check too", () => {
    const report = evaluateGate({ ...locked, admins: [] }, { address: ADMIN });
    expect(report.publishable).toBe(false);
    expect(ids(report, false)).toEqual(["admins", "caller"]);
  });

  it("fails the caller check for an anonymous or unlisted caller", () => {
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
    expect(stranger.checks.find((c) => c.id === "caller")?.detail).toMatch(
      /not one of the listed admins/,
    );
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
        policy: "OPEN",
        identityResolved: false,
        requireAuthenticatedCaller: false,
        admins: [],
      },
      undefined,
    );
    for (const check of report.checks) {
      expect(Boolean(check.fix)).toBe(!check.ok);
    }
  });
});

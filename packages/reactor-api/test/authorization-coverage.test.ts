import { describe, expect, it } from "vitest";
import { AuthSubgraph } from "../src/graphql/auth/subgraph.js";
import type { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { PackagesSubgraph } from "../src/graphql/packages/subgraph.js";
import { ReactorSubgraph } from "../src/graphql/reactor/subgraph.js";
import { SystemSubgraph } from "../src/graphql/system/subgraph.js";
import type { SubgraphArgs } from "../src/graphql/types.js";

/**
 * Default-deny backstop for resolver authorization (AUTH_REVIEW §2.2 A5).
 *
 * Enforcement in this codebase is per-resolver and opt-in: a resolver that
 * forgets to call an assertCan* helper (or consult the authorization
 * service) silently ships unguarded. This test makes that failure mode loud:
 * every operation resolver must either reference the authorization service
 * in its source, or be listed below with an explicit, reviewable reason.
 *
 * Adding a new resolver without an authorization check fails this test until
 * the check is added or the field is deliberately exempted here. Entries that
 * cite AUTH_REVIEW finding IDs (S-C2, S-H1, ...) are known gaps awaiting the
 * security remediation work — do NOT add to their ranks casually.
 *
 * Scope: the statically-defined subgraphs registered by the server.
 * DocumentModelSubgraph resolvers are generated per document model and are
 * exercised by document-model-subgraph-permissions.test.ts instead. The
 * AnalyticsSubgraph reuses resolvers from @powerhousedao/analytics-engine-graphql
 * wholesale and is tracked by S-L3.
 */

/** Field-level exemptions: `TypeName.fieldName` -> reason. */
const EXEMPT: Record<string, Record<string, string>> = {
  reactor: {
    "Query.documentModels":
      "Document model metadata, not document content (AUTH_REVIEW §4: low-sensitivity).",
    "Query.jobStatus":
      "Job status by id, not document content (AUTH_REVIEW §4: low-sensitivity).",
  },
  auth: {
    "Query.userDocumentPermissions":
      "Self-scoped: returns only the caller's own grants; anonymous gets [].",
  },
  packages: {
    "Query.Packages": "Namespace stub resolver; returns an empty object.",
    "Mutation.Packages": "Namespace stub resolver; returns an empty object.",
    "PackagesQueries.installedPackages":
      "KNOWN GAP S-L2: discloses installed packages. Remediation order #7.",
    "PackagesQueries.installedPackage":
      "KNOWN GAP S-L2: discloses installed packages. Remediation order #7.",
  },
  system: {
    "Query.system": "Version/build info; intentionally public.",
  },
};

/**
 * A resolver counts as guarded when its source references the authorization
 * service — directly, or via the BaseSubgraph assertCan-and-canReadDocument
 * helpers (including the *Canonical variants for already-resolved ids), or via
 * the packages requireAdmin helper.
 */
const GUARD_PATTERN =
  /\bassertCan(Read|Write|Create|ExecuteOperation|ExecuteOperations)(Canonical)?\b|\bauthorizationService\b|\bcanReadDocument\b|\brequireAdmin\b/;

function resolverSource(value: unknown): string {
  if (typeof value === "function") return value.toString();
  if (value && typeof value === "object") {
    // Subscription resolvers are { subscribe, resolve? } objects.
    return Object.values(value)
      .filter((v) => typeof v === "function")
      .map((v: (...args: unknown[]) => unknown) => v.toString())
      .join("\n");
  }
  return "";
}

function collectFields(
  subgraph: BaseSubgraph,
): { field: string; source: string }[] {
  const out: { field: string; source: string }[] = [];
  for (const [typeName, fields] of Object.entries(subgraph.resolvers)) {
    if (!fields || typeof fields !== "object") continue;
    for (const [fieldName, resolver] of Object.entries(
      fields as Record<string, unknown>,
    )) {
      out.push({
        field: `${typeName}.${fieldName}`,
        source: resolverSource(resolver),
      });
    }
  }
  return out;
}

const mockArgs = {
  reactorClient: {},
  relationalDb: {},
  analyticsStore: {},
  graphqlManager: {
    driveOwnershipCache: {
      has: () => false,
      add: () => undefined,
      remove: () => undefined,
      size: () => 0,
    },
    setAdditionalContextFields: () => undefined,
  },
  syncManager: {},
  authorizationService: {},
  documentPermissionService: {},
  packageManagementService: {},
} as unknown as SubgraphArgs;

const SUBGRAPHS: Record<string, () => BaseSubgraph> = {
  reactor: () => new ReactorSubgraph(mockArgs),
  auth: () => new AuthSubgraph(mockArgs),
  packages: () =>
    new PackagesSubgraph(
      mockArgs as ConstructorParameters<typeof PackagesSubgraph>[0],
    ),
  system: () => new SystemSubgraph(mockArgs),
};

describe("resolver authorization coverage (default-deny backstop)", () => {
  for (const [name, build] of Object.entries(SUBGRAPHS)) {
    describe(`${name} subgraph`, () => {
      const exemptions = EXEMPT[name] ?? {};
      const fields = collectFields(build());

      it("collects the subgraph's resolvers (guards against a vacuous pass)", () => {
        expect(fields.length).toBeGreaterThan(0);
      });

      it("every resolver is guarded or explicitly exempted", () => {
        const unguarded = fields
          .filter(({ source }) => !GUARD_PATTERN.test(source))
          .map(({ field }) => field)
          .filter((field) => !(field in exemptions));

        expect(
          unguarded,
          `Unguarded resolvers without an exemption in ${name}: ` +
            `${unguarded.join(", ")}. Add an authorization check, or add an ` +
            "exemption with a reviewable reason to EXEMPT in this test.",
        ).toEqual([]);
      });

      it("every exemption still matches an unguarded resolver", () => {
        const unguardedSet = new Set(
          fields
            .filter(({ source }) => !GUARD_PATTERN.test(source))
            .map(({ field }) => field),
        );
        const stale = Object.keys(exemptions).filter(
          (field) => !unguardedSet.has(field),
        );

        expect(
          stale,
          `Stale exemptions in ${name} (field is gone or now guarded — ` +
            `remove the entry): ${stale.join(", ")}`,
        ).toEqual([]);
      });
    });
  }
});

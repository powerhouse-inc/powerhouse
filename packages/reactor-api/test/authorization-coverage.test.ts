import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { describe, expect, it } from "vitest";
import { AnalyticsSubgraph } from "../src/graphql/analytics-subgraph.js";
import { AuthSubgraph } from "../src/graphql/auth/subgraph.js";
import type { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { DocumentModelSubgraph } from "../src/graphql/document-model-subgraph.js";
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
 * Scope: the statically-defined subgraphs registered by the server, the
 * analytics subgraph, and one generated document-model subgraph standing for
 * every model's.
 *
 * A second backstop covers what a guard does not: a resolver that reaches the
 * reactor client must read as the caller, through viewSubject or
 * servesDocument, since a read with no subject is served as the host sees it.
 */

/** Field-level exemptions: `TypeName.fieldName` -> reason. */
const EXEMPT: Record<string, Record<string, string>> = {
  reactor: {
    "Query.documentModels":
      "Document model metadata, not document content (AUTH_REVIEW §4: low-sensitivity).",
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
  analytics: {
    "AnalyticsQuery.series":
      "Reached only through Query.analytics, which is gated.",
    "AnalyticsQuery.multiCurrencySeries":
      "Reached only through Query.analytics, which is gated.",
    "AnalyticsQuery.metrics":
      "Reached only through Query.analytics, which is gated.",
    "AnalyticsQuery.dimensions":
      "Reached only through Query.analytics, which is gated.",
    "AnalyticsQuery.currencies":
      "Reached only through Query.analytics, which is gated.",
  },
  "document-model": {
    "Query.DocumentModel": "Namespace stub resolver; returns an empty object.",
    "Mutation.DocumentModel":
      "Namespace stub resolver; returns an empty object.",
  },
};

/**
 * Resolvers that reach the reactor client without reading as the caller:
 * `TypeName.fieldName` -> reason. Each must return no document content.
 */
const NOT_A_READ: Record<string, Record<string, string>> = {
  reactor: {
    "Query.documentModels": "Document model metadata, not a document.",
    "Mutation.executeAsync": "Returns a job, not a document.",
    "Mutation.mutateDocumentAsync": "Returns a job id, not a document.",
    "Mutation.deleteDocument": "Returns a boolean.",
    "Mutation.deleteDocuments": "Returns a boolean.",
  },
};

/** A resolver that reaches the reactor client, itself or by handing it on. */
const READS_PATTERN = /\breactorClient\b/;

/** Reads as the caller's subject. */
const AS_CALLER_PATTERN = /\bviewSubject\b|\bservesDocument\b/;

/**
 * A resolver counts as guarded when its source references the authorization
 * service — directly, or via the BaseSubgraph assertCan-and-canReadDocument
 * helpers (including the *Canonical variants for already-resolved ids), or via
 * the packages requireAdmin, analytics assertCanReadAnalytics or
 * document-model readableItems helpers.
 */
const GUARD_PATTERN =
  /\bassertCan(Read|Write|Create|ExecuteOperation|ExecuteOperations)(Canonical)?\b|\bauthorizationService\b|\bcanReadDocument\b|\bservesDocument\b|\brequireAdmin\b|\bassertCanReadAnalytics\b|\breadableItems\b/;

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
  analytics: () => new AnalyticsSubgraph(mockArgs),
  "document-model": () =>
    new DocumentModelSubgraph(
      documentModelDocumentModelModule as unknown as DocumentModelModule,
      mockArgs,
    ),
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

      it("every resolver that reaches the reactor reads as the caller", () => {
        const exempt = NOT_A_READ[name] ?? {};
        const asHost = fields
          .filter(
            ({ source }) =>
              READS_PATTERN.test(source) && !AS_CALLER_PATTERN.test(source),
          )
          .map(({ field }) => field)
          .filter((field) => !(field in exempt));

        expect(
          asHost,
          `Resolvers in ${name} reading the reactor with no subject: ` +
            `${asHost.join(", ")}. Read as viewSubject(ctx), or add an entry ` +
            "to NOT_A_READ if the resolver returns no document content.",
        ).toEqual([]);
      });

      it("every read exemption still matches a resolver reading as the host", () => {
        const asHost = new Set(
          fields
            .filter(
              ({ source }) =>
                READS_PATTERN.test(source) && !AS_CALLER_PATTERN.test(source),
            )
            .map(({ field }) => field),
        );
        const stale = Object.keys(NOT_A_READ[name] ?? {}).filter(
          (field) => !asHost.has(field),
        );

        expect(stale, `Stale NOT_A_READ entries in ${name}`).toEqual([]);
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

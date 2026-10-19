import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule, ph } from "document-model";
import {
  createEntryBuilders,
  readEntry,
  type RegisteredEntry,
} from "document-model/tooling";
import { describe, expect, it } from "vitest";
import { AnalyticsSubgraph } from "../src/graphql/analytics-subgraph.js";
import { AuthSubgraph } from "../src/graphql/auth/subgraph.js";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { documentModelSubgraphClass } from "../src/graphql/document-model-subgraph.js";
import { InspectionSubgraph } from "../src/graphql/inspection/subgraph.js";
import { PackagesSubgraph } from "../src/graphql/packages/subgraph.js";
import { ReactorSubgraph } from "../src/graphql/reactor/subgraph.js";
import { describeSubgraphClass } from "../src/graphql/hosted-subgraph.js";
import type { SchemaBuilder } from "../src/graphql/subgraph-schema.js";
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
  inspection: {
    "Query.inspection": "Namespace stub resolver; returns an empty object.",
    "ReactorInspection.documentModels":
      "Document model metadata, as reactor's Query.documentModels.",
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
    "Mutation.executeBatch": "Returns per-job JobInfo, not a document.",
    "Mutation.mutateDocumentAsync": "Returns a job id, not a document.",
    "Mutation.deleteDocument": "Returns a boolean.",
    "Mutation.deleteDocuments": "Returns a boolean.",
  },
};

/** Each way a resolver reaches document content, and its proof of reading as the caller. */
const READ_RULES: { reads: RegExp; asCaller: RegExp }[] = [
  // The reactor client, itself or handed on.
  {
    reads: /\breactorClient\b/,
    asCaller: /\bviewSubject\b|\bservesDocument\b|\blistsDocument\b/,
  },
  // Inspection drive reads; the host's own inspector reads as the host.
  {
    reads: /\.(listDrives|checkDriveIntegrity)\(/,
    asCaller: /\bsubgraph\.#readerFor\(request\)/,
  },
];

function readsDocuments(source: string): boolean {
  return READ_RULES.some(({ reads }) => reads.test(source));
}

function readsAsHost(source: string): boolean {
  return READ_RULES.some(
    ({ reads, asCaller }) => reads.test(source) && !asCaller.test(source),
  );
}

/** Reads the backstop must see, so a pattern drift cannot pass vacuously. */
const EXPECTED_READS: Record<string, string[]> = {
  inspection: ["ReactorInspection.drives", "ReactorInspection.driveIntegrity"],
};

/**
 * A resolver counts as guarded when its source references the authorization
 * service — directly, or via the BaseSubgraph assertCan-and-canReadDocument
 * helpers (including the *Canonical variants for already-resolved ids), or via
 * the packages requireAdmin, analytics assertCanReadAnalytics,
 * document-model readableItems or inspection operator and read-gate helpers.
 */
const GUARD_PATTERN =
  /\bassertCan(Read|Write|Create|ExecuteOperation|ExecuteOperations)(Canonical)?\b|\bauthorizationService\b|\bcanReadDocument\b|\bservesDocument\b|\blistsDocument\b|\brequireAdmin\b|\bassertCanReadAnalytics\b|\breadableItems\b|\breadableByHost\b|\bisOperator\b|\brequireOperator\b|\bservedDocument\b|\breadableIds\b/;

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

type CollectedField = { field: string; source: string };

function collectFields(subgraph: BaseSubgraph): {
  collector: "typed" | "sdl";
  fields: CollectedField[];
} {
  const described = describeSubgraphClass(subgraph.constructor);
  if (described === undefined) {
    throw new Error(
      `${subgraph.constructor.name} declares no static subgraphName, so its resolvers cannot be read through the protocol.`,
    );
  }
  if (described.description.definition.schemaKind === "typed") {
    return {
      collector: "typed",
      fields: collectTypedEntries(subgraph.constructor),
    };
  }
  return {
    collector: "sdl",
    fields: collectResolverMap(described.protocol.bind(subgraph).resolvers),
  };
}

function collectResolverMap(
  resolvers: Readonly<Record<string, unknown>>,
): CollectedField[] {
  const out: CollectedField[] = [];
  for (const [typeName, fields] of Object.entries(resolvers)) {
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

const ROOTS = {
  query: "Query",
  mutation: "Mutation",
  subscription: "Subscription",
} as const;

function collectTypedEntries(subgraphClass: unknown): CollectedField[] {
  const { builders } = createEntryBuilders();
  const getSchema = (subgraphClass as typeof BaseSubgraph).getSchema;
  const entries = getSchema.call(subgraphClass, {
    ...builders,
    graphql: () => {
      throw new Error("A typed schema has no schema.graphql call.");
    },
    replaceParentSchema: () => undefined,
  } as unknown as SchemaBuilder<BaseSubgraph>) as readonly unknown[];
  return entries.map((value, index) => {
    const entry: RegisteredEntry = readEntry(value, ["entries", index]);
    switch (entry.kind) {
      case "query":
      case "mutation":
        return {
          field: `${ROOTS[entry.kind]}.${entry.fieldName}`,
          source: entry.resolve.toString(),
        };
      case "subscription":
        return {
          field: `Subscription.${entry.fieldName}`,
          source: [entry.subscribe, entry.resolve]
            .filter((callback) => callback !== undefined)
            .map(String)
            .join("\n"),
        };
      case "computed-field":
        return {
          field: `${entry.token.typeName}.${entry.token.fieldName}`,
          source: entry.resolve.toString(),
        };
      case "resolve-type":
        return {
          field: `${entry.typeName}.__resolveType`,
          source: entry.resolve.toString(),
        };
      case "is-type-of":
        return {
          field: `${entry.typeName}.__isTypeOf`,
          source: entry.resolve.toString(),
        };
    }
  });
}

function unguardedFields(
  fields: readonly CollectedField[],
  exemptions: Readonly<Record<string, string>>,
): string[] {
  return fields
    .filter(({ source }) => !GUARD_PATTERN.test(source))
    .map(({ field }) => field)
    .filter((field) => !(field in exemptions));
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
  inspection: () =>
    new InspectionSubgraph({
      ...mockArgs,
      inspection: {
        inspector: {},
        syncInspector: undefined,
        documentModelRegistry: {},
        facts: {},
      },
    } as unknown as SubgraphArgs),
  analytics: () => new AnalyticsSubgraph(mockArgs),
  "document-model": () =>
    new (documentModelSubgraphClass(
      documentModelDocumentModelModule as unknown as DocumentModelModule,
    ))(mockArgs),
};

describe("resolver authorization coverage (default-deny backstop)", () => {
  for (const [name, build] of Object.entries(SUBGRAPHS)) {
    describe(`${name} subgraph`, () => {
      const exemptions = EXEMPT[name] ?? {};
      const { fields } = collectFields(build());

      it("collects the subgraph's resolvers (guards against a vacuous pass)", () => {
        expect(fields.length).toBeGreaterThan(0);
      });

      it("every resolver is guarded or explicitly exempted", () => {
        const unguarded = unguardedFields(fields, exemptions);

        expect(
          unguarded,
          `Unguarded resolvers without an exemption in ${name}: ` +
            `${unguarded.join(", ")}. Add an authorization check, or add an ` +
            "exemption with a reviewable reason to EXEMPT in this test.",
        ).toEqual([]);
      });

      it("sees every document read the subgraph is known to make", () => {
        const reads = fields
          .filter(({ source }) => readsDocuments(source))
          .map(({ field }) => field);
        expect(reads).toEqual(
          expect.arrayContaining(EXPECTED_READS[name] ?? []),
        );
      });

      it("every resolver that reaches the reactor reads as the caller", () => {
        const exempt = NOT_A_READ[name] ?? {};
        const asHost = fields
          .filter(({ source }) => readsAsHost(source))
          .map(({ field }) => field)
          .filter((field) => !(field in exempt));

        expect(
          asHost,
          `Resolvers in ${name} reading the reactor with no subject: ` +
            `${asHost.join(", ")}. Read as viewSubject(ctx) or gate.readerFor(ctx), ` +
            "or add an entry to NOT_A_READ if the resolver returns no document content.",
        ).toEqual([]);
      });

      it("every read exemption still matches a resolver reading as the host", () => {
        const asHost = new Set(
          fields
            .filter(({ source }) => readsAsHost(source))
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

describe("the two collectors", () => {
  const Invoice = ph.object("Invoice", {
    fields: { id: ph.OID({ required: true }) },
  });

  class GuardedInvoices extends BaseSubgraph {
    static override readonly subgraphName = "guarded-invoices";
    static override getSchema(schema: SchemaBuilder<GuardedInvoices>) {
      return [
        schema.query("invoice", {
          args: { id: ph.OID({ required: true }) },
          returns: ph.ref(Invoice),
          resolve: async ({ args, subgraph, request }) => {
            await subgraph.assertCanRead(String(args.id), request);
            return { id: args.id };
          },
        }),
        schema.mutation("voidInvoice", {
          args: { id: ph.OID({ required: true }) },
          returns: ph.Boolean(),
          resolve: async ({ args, subgraph, request }) => {
            await subgraph.assertCanWrite(String(args.id), request);
            return true;
          },
        }),
      ];
    }
  }

  class LeakyInvoices extends BaseSubgraph {
    static override readonly subgraphName = "leaky-invoices";
    static override getSchema(schema: SchemaBuilder<LeakyInvoices>) {
      return [
        schema.query("invoice", {
          args: { id: ph.OID({ required: true }) },
          returns: ph.ref(Invoice),
          resolve: async ({ args, subgraph, request }) => {
            await subgraph.assertCanRead(String(args.id), request);
            return { id: args.id };
          },
        }),
        schema.query("allInvoices", {
          returns: ph.ref(Invoice),
          resolve: () => ({ id: "every-invoice" }),
        }),
      ];
    }
  }

  it("reads a typed subgraph's authored resolve callbacks, not the generated wrappers", () => {
    const { collector, fields } = collectFields(new GuardedInvoices(mockArgs));
    expect(collector).toBe("typed");
    expect(fields.map(({ field }) => field)).toEqual([
      "Query.invoice",
      "Mutation.voidInvoice",
    ]);
    expect(unguardedFields(fields, {})).toEqual([]);
  });

  it("finds an unguarded typed entry", () => {
    const { fields } = collectFields(new LeakyInvoices(mockArgs));
    expect(unguardedFields(fields, {})).toEqual(["Query.allInvoices"]);
  });

  it("reads each converted core subgraph's authored callbacks", () => {
    const typed = Object.fromEntries(
      Object.entries(SUBGRAPHS).flatMap(([name, build]) => {
        const { collector, fields } = collectFields(build());
        return collector === "typed"
          ? [[name, fields.map(({ field }) => field)]]
          : [];
      }),
    );
    expect(typed).toEqual({
      auth: [
        "Query.documentAccess",
        "Query.documentProtection",
        "Query.userDocumentPermissions",
        "Query.operationPermissions",
        "Query.canExecuteOperation",
        "Mutation.setDocumentProtection",
        "Mutation.transferDocumentOwnership",
        "Mutation.grantDocumentPermission",
        "Mutation.revokeDocumentPermission",
        "Mutation.grantOperationPermission",
        "Mutation.revokeOperationPermission",
      ],
      packages: [
        "Query.Packages",
        "PackagesQueries.installedPackages",
        "PackagesQueries.installedPackage",
        "Mutation.Packages",
        "PackagesMutations.installPackage",
        "PackagesMutations.uninstallPackage",
      ],
      system: ["Query.system"],
      inspection: [
        "Query.inspection",
        "ReactorInspection.info",
        "ReactorInspection.documentModels",
        "ReactorInspection.drives",
        "ReactorInspection.driveIntegrity",
        "ReactorInspection.attachmentInfo",
        "ReactorInspection.queueState",
        "ReactorInspection.processors",
        "ReactorInspection.catchUpStatus",
        "ReactorInspection.storageHealth",
        "ReactorInspection.validateDocument",
        "ReactorInspection.remotes",
        "ReactorInspection.remote",
        "ReactorInspection.deadLetters",
      ],
    });
  });

  it("reads every core subgraph through one of them", () => {
    const collected = Object.fromEntries(
      Object.entries(SUBGRAPHS).map(([name, build]) => {
        const { collector, fields } = collectFields(build());
        return [name, { collector, fields: fields.length > 0 }];
      }),
    );
    expect(Object.keys(collected).sort()).toEqual(
      [
        "analytics",
        "auth",
        "document-model",
        "inspection",
        "packages",
        "reactor",
        "system",
      ].sort(),
    );
    for (const { fields } of Object.values(collected)) {
      expect(fields).toBe(true);
    }
  });
});

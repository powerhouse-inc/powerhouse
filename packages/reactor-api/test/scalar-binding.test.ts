import type {
  DocumentModelDefinition,
  DocumentModelModule,
  LocationFreeGraphQLDocumentNode,
} from "@powerhousedao/shared/document-model";
import {
  resolvers as packageResolvers,
  typeDefs as scalarsTypeDefs,
} from "@powerhousedao/document-engineering/graphql";
import { scalarCatalog } from "document-model";
import { readFileSync } from "node:fs";
import { type DocumentNode, Kind, print } from "graphql";
import { GraphQLJSON, GraphQLJSONObject } from "graphql-type-json";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  HOST_SCALAR_RESOLVERS,
  forgetReportedScalarBindings,
  reportScalarBindings,
} from "../src/graphql/scalar-bindings.js";
import {
  createSchema,
  getDocumentModelTypeDefs,
} from "../src/utils/create-schema.js";
import { RECORDED_DIFFERENCES } from "../../document-model/test/definition/scalar-recorded-differences.js";
import { asSchemaFirst, hostFor } from "./utils/graphql-host.js";
import {
  CATALOG_SCALARS,
  buildScalarsModel,
  requestShapes,
} from "../../document-model/test/definition/scalars-model.js";
import {
  DOCUMENT_VALIDATION_PROFILE,
  HOST_GRAPHQL_PROFILE,
  composedWith,
  installedResolvers,
  measureCaseOutcomes,
  measureHostBindings,
  type ScalarBindingMeasurement,
} from "./utils/scalar-matrix.js";

/**
 * The catalog owns scalar names and validation metadata. The host installs
 * GraphQL coercers for two of them. Document validation and GraphQL coercion
 * are keyed apart, so a change to one cannot move the other. This file pins
 * the host's current bindings, checks the two are keyed apart, and checks that
 * a code-first model and its schema-first twin agree on every catalog scalar.
 * Regenerate the golden with
 * `pnpm exec tsx test/goldens/regenerate-scalar-bindings.ts`.
 */

const EMPTY: DocumentNode = { kind: Kind.DOCUMENT, definitions: [] };

const GOLDEN = JSON.parse(
  readFileSync(
    new URL("./goldens/host-scalar-bindings.json", import.meta.url),
    "utf8",
  ),
) as ScalarBindingMeasurement;

const hostTypeDefs = getDocumentModelTypeDefs([], EMPTY);

/** The installed package, measured now rather than read out of the golden. */
const PACKAGE_DECLARATIONS = [...scalarsTypeDefs]
  .map((line) => line.replace(/^scalar /, ""))
  .sort();
const PACKAGE_RESOLVER_KEYS = Object.keys(packageResolvers).sort();

describe("the host's scalar bindings", () => {
  it("matches the committed golden, declaration for declaration", () => {
    expect(measureHostBindings()).toEqual({
      graphqlProfile: GOLDEN.graphqlProfile,
      documentValidationProfile: GOLDEN.documentValidationProfile,
      declared: GOLDEN.declared,
      bound: GOLDEN.bound,
      unbound: GOLDEN.unbound,
      unregistered: GOLDEN.unregistered,
    });
    expect([...scalarCatalog.names].sort()).toEqual(GOLDEN.catalogNames);
  });

  it("installs exactly two coercers, last, and they are the ones named", () => {
    const authored = { PHID: { authored: true }, Query: {} };
    const resolvers = installedResolvers(authored);

    // The host's two go on last, so an authored resolver of the same name
    // loses; every other authored key survives untouched.
    expect(resolvers.JSONObject).toBe(GraphQLJSONObject);
    expect(resolvers.Unknown).toBe(GraphQLJSON);
    expect(resolvers.PHID).toBe(authored.PHID);
    expect(Object.keys(resolvers).slice(-2)).toEqual(["JSONObject", "Unknown"]);
    expect(Object.keys(HOST_SCALAR_RESOLVERS)).toEqual([
      "JSONObject",
      "Unknown",
    ]);
  });

  it("installs none of the document-engineering package's coercers", () => {
    const resolvers = installedResolvers();
    for (const key of GOLDEN.packageResolverKeys) {
      expect(Object.keys(resolvers), key).not.toContain(key);
    }
    // Every declared name is either bound or served by the identity coercion
    // an SDL-only scalar gets.
    const measured = measureHostBindings();
    expect([...measured.bound, ...measured.unbound].sort()).toEqual([
      ...measured.declared,
    ]);
    expect(measured.bound).toEqual(["JSONObject", "Unknown"]);
  });
});

describe("the two profiles are keyed apart", () => {
  it("resolves document validation only under its own profile", () => {
    expect(scalarCatalog.validationProfiles).toEqual([
      DOCUMENT_VALIDATION_PROFILE,
    ]);
    expect(scalarCatalog.validationProfiles).not.toContain(
      HOST_GRAPHQL_PROFILE,
    );
    for (const name of scalarCatalog.names) {
      expect(
        scalarCatalog.resolve(name, DOCUMENT_VALIDATION_PROFILE),
        name,
      ).toBeDefined();
      // The GraphQL profile belongs to the host, so the catalog returns nothing
      // for it instead of falling through to the validation profile.
      expect(
        scalarCatalog.resolve(name, HOST_GRAPHQL_PROFILE as never),
        name,
      ).toBeUndefined();
    }
  });

  it("records the six underscore resolver keys as evidence, not bindings", () => {
    const difference = RECORDED_DIFFERENCES.find(
      (entry) => entry.id === "underscore-resolver-keys",
    );
    expect(difference?.scalars).toEqual([
      "Amount_Money",
      "Amount_Percentage",
      "Amount_Tokens",
      "Amount_Fiat",
      "Amount_Crypto",
      "Amount_Currency",
    ]);

    // The package declares these names with an underscore and keys their
    // resolvers without one, so neither spelling is bound. The package is
    // measured live, so an upgrade that renamed `AmountMoney` to `Amount_Money`
    // fails here instead of leaving the golden stale.
    expect(PACKAGE_DECLARATIONS).toEqual(GOLDEN.packageDeclarations);
    expect(PACKAGE_RESOLVER_KEYS).toEqual(GOLDEN.packageResolverKeys);
    const resolvers = installedResolvers();
    for (const name of difference?.scalars ?? []) {
      const packageKey = name.replace("_", "");
      expect(PACKAGE_DECLARATIONS, name).toContain(name);
      expect(PACKAGE_RESOLVER_KEYS, name).toContain(packageKey);
      expect(Object.keys(resolvers), name).not.toContain(name);
      expect(Object.keys(resolvers), packageKey).not.toContain(packageKey);
      expect(GOLDEN.declared, name).toContain(name);
      expect(GOLDEN.declared, packageKey).not.toContain(packageKey);
    }
  });
});

describe("every catalog scalar behaves the same on both projections", () => {
  let measured: Awaited<ReturnType<typeof measureCaseOutcomes>>;

  // The measurement throws the moment the two projections disagree anywhere,
  // so reaching any assertion below is already the parity result.
  beforeAll(async () => {
    measured = await measureCaseOutcomes();
  });

  it("reproduces the committed outcome table exactly", () => {
    expect(measured).toEqual(GOLDEN.caseOutcomes);
  });

  for (const name of CATALOG_SCALARS) {
    it(`${name} answers over GraphQL the way the catalog partitions it`, () => {
      const row = measured[name];
      expect(Object.keys(row).length, name).toBeGreaterThan(0);
      for (const [caseKey, outcome] of Object.entries(row)) {
        const expected = caseKey.startsWith("accepts/")
          ? "accepted/accepted"
          : "rejected/rejected";
        // Only JSONObject and Unknown have a host coercer, so these verdicts
        // come from the catalog's document validator. The variable and literal
        // forms agree.
        expect(outcome, `${name} ${caseKey}`).toBe(expected);
      }
    });
  }

  it("namespaces each scalar's operation input on both projections", () => {
    const module = buildScalarsModel();
    const shapes = requestShapes(module);
    // The served subgraph schema, which is where a model's operation inputs
    // live; the host's composed type defs carry only its state types.
    const structured = Object.keys(hostFor(module).schema.getTypeMap());
    const stored = Object.keys(
      hostFor(asSchemaFirst(buildScalarsModel())).schema.getTypeMap(),
    );
    for (const name of CATALOG_SCALARS) {
      expect(structured, name).toContain(shapes.get(name)!.inputType);
      expect(stored, name).toContain(shapes.get(name)!.inputType);
    }
  });
});

/** A document that declares a scalar outside the catalog. */
const TICKET_DOCUMENT: LocationFreeGraphQLDocumentNode = {
  kind: "Document",
  definitions: [
    {
      kind: "ScalarTypeDefinition",
      name: { kind: "Name", value: "Ticket" },
      directives: [],
    },
    {
      kind: "ObjectTypeDefinition",
      name: { kind: "Name", value: "ScalarsState" },
      interfaces: [],
      directives: [],
      fields: [
        {
          kind: "FieldDefinition",
          name: { kind: "Name", value: "ticket" },
          arguments: [],
          directives: [],
          type: {
            kind: "NamedType",
            name: { kind: "Name", value: "Ticket" },
          },
        },
      ],
    },
  ],
} as LocationFreeGraphQLDocumentNode;

/**
 * A model whose last specification retains that document. The host strips
 * scalars from the caller's own type definitions, so a host-local scalar
 * reaches the assembled SDL only through a model's retained GraphQL AST.
 */
function modelDeclaringTicket(): DocumentModelModule {
  const module = buildScalarsModel() as DocumentModelModule & {
    definition: DocumentModelDefinition;
  };
  const specifications = module.definition.specifications.map(
    (specification, index) =>
      index === module.definition.specifications.length - 1
        ? {
            ...specification,
            graphQLCompatibility: {
              kind: "graphql-ast-v1" as const,
              document: TICKET_DOCUMENT,
              preserveDefinitionOrder: true as const,
            },
          }
        : specification,
  );
  return {
    ...module,
    definition: { ...module.definition, specifications },
  } as unknown as DocumentModelModule;
}

describe("report-only scalar diagnostics", () => {
  const authored = { PHID: { authored: true }, JSONObject: { authored: true } };

  it("reports an SDL scalar the catalog has no metadata for", () => {
    const typeDefs = getDocumentModelTypeDefs([modelDeclaringTicket()], EMPTY);
    expect(print(typeDefs)).toContain("scalar Ticket");

    const diagnostics = reportScalarBindings(typeDefs, {}, new Set());
    expect(diagnostics.map((entry) => entry.code)).toEqual([
      "PH-SCALAR-UNREGISTERED",
    ]);
    expect(diagnostics[0].severity).toBe("warning");
    expect(diagnostics[0].phase).toBe("composition");
    expect(diagnostics[0].received).toBe("Ticket");
  });

  it("reports an authored resolver keyed by a catalog scalar name", () => {
    const diagnostics = reportScalarBindings(hostTypeDefs, authored, new Set());
    expect(diagnostics.map((entry) => entry.code)).toEqual([
      "PH-SCALAR-RESOLVER-SHADOWED",
      "PH-SCALAR-RESOLVER-SHADOWED",
    ]);
    expect(diagnostics.map((entry) => entry.received)).toEqual([
      "JSONObject",
      "PHID",
    ]);
    for (const diagnostic of diagnostics) {
      expect(diagnostic.severity).toBe("warning");
      expect(diagnostic.phase).toBe("composition");
    }
  });

  it("says nothing when nobody authored a scalar resolver", () => {
    expect(reportScalarBindings(hostTypeDefs, {}, new Set())).toEqual([]);
  });

  it("reads the authored map, not the one the host installed over it", () => {
    // The call site passes the authored `resolvers`. Passing the installed map
    // would report the host's own two bindings as shadowed on every boot,
    // which this case reproduces.
    const asInstalled = reportScalarBindings(
      hostTypeDefs,
      HOST_SCALAR_RESOLVERS,
      new Set(),
    );
    expect(asInstalled.map((entry) => entry.received)).toEqual([
      "JSONObject",
      "Unknown",
    ]);
    // For the host's own names, the repair says the authored resolver is
    // discarded.
    for (const diagnostic of asInstalled) {
      expect(diagnostic.repair).toMatch(/installs its own .* last/);
      expect(diagnostic.repair).not.toMatch(/accept that it binds/);
    }
    // An authored resolver the host does not bind keeps the other repair.
    const authoredOnly = reportScalarBindings(
      hostTypeDefs,
      { PHID: {} },
      new Set(),
    );
    expect(authoredOnly[0].repair).toMatch(/accept that it binds PHID/);
  });

  it("changes neither schema admission nor the live resolver map", () => {
    const quiet = createSchema([buildScalarsModel()], {} as never, EMPTY);
    const noisy = createSchema(
      [modelDeclaringTicket()],
      authored as never,
      EMPTY,
    );

    // The model that triggers both diagnostics still composes, and the
    // uncatalogued scalar is in the served schema.
    expect(Object.keys(noisy.getTypeMap())).toContain("Ticket");
    expect(Object.keys(noisy.getTypeMap())).toContain("Scalars_ScalarsState");
    expect(Object.keys(quiet.getTypeMap())).toContain("Scalars_ScalarsState");

    const resolvers = installedResolvers(authored);
    expect(resolvers.JSONObject).toBe(GraphQLJSONObject);
    expect(resolvers.Unknown).toBe(GraphQLJSON);
    expect(resolvers.PHID).toBe(authored.PHID);
    expect(Object.keys(resolvers).sort()).toEqual(
      Object.keys(installedResolvers({ PHID: {}, JSONObject: {} })).sort(),
    );
  });
});

describe("the host boundary", () => {
  beforeEach(() => {
    forgetReportedScalarBindings();
  });

  it("reports both diagnostics where the host composes, not just from the helper", () => {
    const { logged, resolvers } = composedWith([modelDeclaringTicket()], {
      PHID: { authored: true },
    });
    expect(logged.join("\n")).toContain("PH-SCALAR-UNREGISTERED");
    expect(logged.join("\n")).toContain("PH-SCALAR-RESOLVER-SHADOWED");
    expect(resolvers.JSONObject).toBe(GraphQLJSONObject);
    expect(resolvers.Unknown).toBe(GraphQLJSON);
    expect(Object.keys(resolvers).slice(-2)).toEqual(["JSONObject", "Unknown"]);
  });

  it("says nothing for a host with nothing to report", () => {
    const { logged } = composedWith([], {});
    expect(logged.filter((line) => line.includes("PH-SCALAR"))).toEqual([]);
  });

  it("says each finding once, however often the host recomposes", () => {
    const authored = { PHID: { authored: true } };
    const first = composedWith([modelDeclaringTicket()], authored);
    expect(
      first.logged.filter((line) => line.includes("PH-SCALAR")),
    ).toHaveLength(2);
    // The host rebuilds every subgraph on every router update; an unchanged
    // disagreement must not repeat.
    const second = composedWith([modelDeclaringTicket()], authored);
    expect(second.logged.filter((line) => line.includes("PH-SCALAR"))).toEqual(
      [],
    );
  });
});

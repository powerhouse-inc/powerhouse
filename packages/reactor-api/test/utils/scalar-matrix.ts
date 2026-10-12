import type {
  DocumentModelModule,
  DocumentModelPHState,
  ScalarGraphQLProfile,
  ScalarValidationProfile,
} from "@powerhousedao/shared/document-model";
import { camelCase, pascalCase } from "change-case";
import { defineDocumentModel, ph, scalarCatalog } from "document-model";
import { type DocumentNode, Kind } from "graphql";
import { vi } from "vitest";
import {
  CATALOG_SCALARS,
  buildScalarsModel,
  fieldNameFor,
  jsonCases,
  literalSource,
  requestShapes,
} from "../../../document-model/test/definition/scalars-model.js";
import { reportScalarBindings } from "../../src/graphql/scalar-bindings.js";
import {
  buildSubgraphSchemaModule,
  getDocumentModelTypeDefs,
} from "../../src/utils/create-schema.js";
import { asSchemaFirst, hostFor, messages } from "./graphql-host.js";

const EMPTY: DocumentNode = { kind: Kind.DOCUMENT, definitions: [] };

/** Names the GraphQL coercion behavior this host installs. */
export const HOST_GRAPHQL_PROFILE: ScalarGraphQLProfile =
  "legacy-graphql-default-v1";

/** The profile document creation, reducer input, and replay resolve through. */
export const DOCUMENT_VALIDATION_PROFILE: ScalarValidationProfile =
  "document-engineering-1.40";

type Verdict = "accepted" | "rejected";

type ScalarRow = {
  /** `"<partition>/<caseId>"` to `"<variable verdict>/<literal verdict>"`. */
  readonly [caseKey: string]: string;
};

type HostBindings = {
  readonly graphqlProfile: string;
  readonly documentValidationProfile: string;
  /** Scalar names the host's assembled SDL declares. */
  readonly declared: readonly string[];
  /** Declared names the host installs a coercer for. */
  readonly bound: readonly string[];
  /** Declared names GraphQL serves with its default pass-through. */
  readonly unbound: readonly string[];
  /** Declared names the host reports as unknown to the catalog. */
  readonly unregistered: readonly string[];
};

export type ScalarBindingMeasurement = HostBindings & {
  readonly catalogNames: readonly string[];
  readonly packageDeclarations: readonly string[];
  readonly packageResolverKeys: readonly string[];
  readonly caseOutcomes: Readonly<Record<string, ScalarRow>>;
};

function verdict(errors: readonly string[]): Verdict {
  return errors.length === 0 ? "accepted" : "rejected";
}

function served(result: unknown, field: string): unknown {
  const data = (result as { data?: Record<string, any> }).data;
  return data?.Scalars?.[field]?.state?.global ?? null;
}

function assertEqual(left: unknown, right: unknown, where: string): void {
  const encode = (value: unknown) => JSON.stringify(value ?? null);
  if (encode(left) !== encode(right)) {
    throw new Error(
      `${where}: the two projections disagree\n  structured: ${encode(left)}\n  stored:     ${encode(right)}`,
    );
  }
}

function caseRuns(name: string, field: string, selection: string) {
  return jsonCases(name).map(({ id, value, partition }) => ({
    key: `${partition}/${id}`,
    runs: [
      {
        label: "variable",
        source: `mutation ($v: ${name}!) {
            Scalars { ${field}(docId: "doc-1", input: { value: $v }) ${selection} }
          }`,
        variables: { v: value } as Record<string, unknown> | undefined,
      },
      {
        label: "literal",
        source: `mutation {
            Scalars { ${field}(docId: "doc-1", input: { value: ${literalSource(value)} }) ${selection} }
          }`,
        variables: undefined,
      },
    ] as const,
  }));
}

function legacyInternalScalarModule(name: string): DocumentModelModule {
  const field = camelCase(name);
  const context = defineDocumentModel({
    id: "test/scalars",
    name: "Scalars",
    description: `A stored model that references ${name}.`,
    extension: "scalars",
    version: 1,
    author: { name: "Powerhouse", website: null },
    specifications: {
      global: {
        schema: ph.object("ScalarsState", {
          fields: { [field]: ph.Unknown() },
        }),
        initialValue: { [field]: null },
      },
      local: { schema: null, initialValue: {} },
    },
  });
  const setters = context.module("setters", {
    operations: ({ global }) => ({
      [`set${pascalCase(name)}`]: global({
        input: ph.input(`Set${pascalCase(name)}Input`, {
          fields: { value: ph.Unknown({ required: true }) },
        }),
        reduce(state: Record<string, unknown>, input: { value: unknown }) {
          state[field] = input.value;
        },
      }),
    }),
  });
  const module = asSchemaFirst(
    context.finalize({ modules: [setters] }) as unknown as DocumentModelModule,
  );
  const documentModel = structuredClone(
    module.documentModel,
  ) as DocumentModelPHState;
  const rename = (schema: string) => schema.replaceAll(/\bUnknown\b/g, name);
  for (const specification of documentModel.global.specifications) {
    specification.state.global.schema = rename(
      specification.state.global.schema,
    );
    for (const operation of specification.modules.flatMap(
      (module_) => module_.operations,
    )) {
      operation.schema = rename(operation.schema ?? "");
    }
  }
  return { ...module, documentModel } as DocumentModelModule;
}

async function measureInternalScalar(name: string): Promise<ScalarRow> {
  const host = hostFor(legacyInternalScalarModule(name));
  const field = `set${pascalCase(name)}`;
  const selection = `{ state { global { ${camelCase(name)} } } }`;
  const row: Record<string, string> = {};
  for (const { key, runs } of caseRuns(name, field, selection)) {
    const verdicts: Verdict[] = [];
    for (const run of runs) {
      verdicts.push(
        verdict(messages(await host.run(run.source, run.variables))),
      );
    }
    row[key] = verdicts.join("/");
  }
  return row;
}

export async function measureCaseOutcomes(): Promise<
  Readonly<Record<string, ScalarRow>>
> {
  const structuredModel = buildScalarsModel();
  const structured = hostFor(structuredModel);
  const stored = hostFor(asSchemaFirst(buildScalarsModel()));
  const shapes = requestShapes(structuredModel);

  const table: Record<string, Record<string, string>> = {};
  for (const name of CATALOG_SCALARS) {
    const { field } = shapes.get(name)!;
    const stateField = fieldNameFor(name);
    // The document id is a fresh uuid per host, so only the served state is
    // compared; that is what a scalar's output coercion decides.
    const selection = `{ state { global { ${stateField} } } }`;
    const row: Record<string, string> = {};

    for (const { key, runs } of caseRuns(name, field, selection)) {
      const verdicts: Verdict[] = [];
      for (const run of runs) {
        const left = await structured.run(run.source, run.variables);
        const right = await stored.run(run.source, run.variables);
        const where = `${name} ${key} ${run.label}`;
        assertEqual(messages(left), messages(right), `${where}: errors`);
        assertEqual(
          served(left, field),
          served(right, field),
          `${where}: served state`,
        );
        assertEqual(
          structured.state()[stateField],
          stored.state()[stateField],
          `${where}: stored state`,
        );
        verdicts.push(verdict(messages(left)));
      }
      row[key] = verdicts.join("/");
    }
    table[name] = row;
  }
  for (const name of scalarCatalog.internalNames) {
    table[name] = await measureInternalScalar(name);
  }
  return table;
}

/** How the host binds each scalar its assembled SDL declares, with no models. */
export function measureHostBindings(): HostBindings {
  const typeDefs = getDocumentModelTypeDefs([], EMPTY);
  const declared = [
    ...new Set(
      typeDefs.definitions.flatMap((definition) =>
        definition.kind === Kind.SCALAR_TYPE_DEFINITION
          ? [definition.name.value]
          : [],
      ),
    ),
  ].sort();
  const installed = new Set(Object.keys(installedResolvers()));
  return {
    graphqlProfile: HOST_GRAPHQL_PROFILE,
    documentValidationProfile: DOCUMENT_VALIDATION_PROFILE,
    declared,
    bound: declared.filter((name) => installed.has(name)),
    unbound: declared.filter((name) => !installed.has(name)),
    unregistered: reportScalarBindings(typeDefs, {}, new Set()).flatMap(
      (diagnostic) =>
        diagnostic.code === "PH-SCALAR-UNREGISTERED" &&
        diagnostic.received !== undefined
          ? [diagnostic.received]
          : [],
    ),
  };
}

/** Everything the golden pins, measured from this build of the host. */
export async function measureScalarBindings(): Promise<ScalarBindingMeasurement> {
  const pkg = (await import("@powerhousedao/document-engineering/graphql")) as {
    typeDefs: string[];
    resolvers: Record<string, unknown>;
  };
  return {
    ...measureHostBindings(),
    catalogNames: [...scalarCatalog.names].sort(),
    packageDeclarations: pkg.typeDefs
      .map((line) => line.replace(/^scalar /, ""))
      .sort(),
    packageResolverKeys: Object.keys(pkg.resolvers).sort(),
    caseOutcomes: await measureCaseOutcomes(),
  };
}

/** The resolver map the host installs for an authored map. */
export function installedResolvers(
  authored: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return buildSubgraphSchemaModule([], authored as never, EMPTY)
    .resolvers as Record<string, unknown>;
}

/**
 * Captures what `buildSubgraphSchemaModule` logged while composing. It reads
 * the console because create-schema.ts binds its child logger at import time,
 * so replacing the logger would not intercept the output.
 */
export function composedWith(
  models: readonly DocumentModelModule[],
  authored: Readonly<Record<string, unknown>>,
): {
  readonly logged: string[];
  readonly resolvers: Record<string, unknown>;
} {
  const logged: string[] = [];
  const spy = vi
    .spyOn(console, "warn")
    .mockImplementation((...args: unknown[]) => {
      logged.push(args.map((part) => String(part)).join(" "));
    });
  try {
    const module = buildSubgraphSchemaModule(
      [...models],
      authored as never,
      EMPTY,
    );
    return {
      logged,
      resolvers: module.resolvers as Record<string, unknown>,
    };
  } finally {
    spy.mockRestore();
  }
}

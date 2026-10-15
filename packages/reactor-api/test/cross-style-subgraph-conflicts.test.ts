import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { defineDocumentModel, type ILogger, ph } from "document-model";
import {
  checkDefinitions,
  type DefinitionSourceLoader,
  type HostValidationRequest,
  type LoadedDefinitionSet,
} from "document-model/tooling";
import { parse } from "graphql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { defineSubgraph } from "../src/graphql/define-subgraph.js";
import { validateSubgraphsForHost } from "../src/graphql/subgraph-validation.js";
import type { SubgraphClass } from "../src/graphql/types.js";
import { extractSubgraphs } from "../src/packages/subgraph-extraction.js";
import {
  initAndFlush,
  makeDriveModule,
  makeHarness,
  makeHarnessLogger,
  makeMockReactorClient,
} from "./utils/graphql-manager-harness.js";

/**
 * One package mixes schema-first subgraphs (`subgraphs/<dir>/`) and code-first
 * ones (`subgraphs/<name>.ts`). Each case runs the package through the real
 * GraphQL manager and asserts the check names every subgraph the server
 * refuses or leaves out, whatever order the server registers them in.
 */

type Style = "schema-first" | "code-first";
type Subgraph = { style: Style; name: string; sdl: string };
/** A package's `subgraphs/index.ts` namespace: export name to subgraph. */
type Package = Record<string, Subgraph>;

function codeFirstClass(name: string, sdl: string): SubgraphClass {
  return defineSubgraph({
    name,
    schemaKind: "graphql-ast-compat",
    compatibility: {
      kind: "graphql-ast-v1",
      typeDefs: parse(sdl),
      resolverCoordinates: [],
      getResolvers: () => ({}),
      hasSubscriptions: undefined,
      preserveDefinitionOrder: true,
    },
  });
}

function schemaFirstClass(subgraphName: string, sdl: string): SubgraphClass {
  return class extends BaseSubgraph {
    name = subgraphName;
    typeDefs = parse(sdl);
    resolvers = {};
  } as unknown as SubgraphClass;
}

function notesWithOperations(): DocumentModelModule {
  const context = defineDocumentModel({
    id: "test/notes",
    name: "Notes",
    description: "",
    extension: "notes",
    version: 1,
    author: { name: "Powerhouse", website: null },
    specifications: {
      global: {
        schema: ph.object("NotesState", { fields: { title: ph.String() } }),
        initialValue: { title: null },
      },
      local: { schema: null, initialValue: {} },
    },
  });
  const edits = context.module("edits", {
    operations: ({ global }) => ({
      setTitle: global({
        input: ph.input({ fields: { title: ph.String({ required: true }) } }),
        reduce(state, input) {
          state.title = input.title;
        },
      }),
    }),
  });
  return context.finalize({
    modules: [edits],
  }) as unknown as DocumentModelModule;
}

type Models = {
  readonly codeFirst?: readonly DocumentModelModule[];
  readonly schemaFirst?: readonly DocumentModelModule[];
};

const sourceOf = ({ style, name }: Subgraph) =>
  style === "code-first"
    ? `./subgraphs/${name}.ts`
    : `./subgraphs/${name}/schema.ts`;

function hostRequest(
  pkg: Package,
  models: Models = {},
): Omit<HostValidationRequest, "profile" | "documentModels"> {
  const subgraphs = Object.values(pkg);
  return {
    subgraphs: subgraphs
      .filter(({ style }) => style === "code-first")
      .map((subgraph) => ({
        value: codeFirstClass(subgraph.name, subgraph.sdl),
        source: { specifier: sourceOf(subgraph) as `./${string}` },
        path: ["definition"],
      })),
    schemaFirst: {
      documentModels: (models.schemaFirst ?? []).map(
        (model) => model.documentModel.global,
      ),
      subgraphs: subgraphs
        .filter(({ style }) => style === "schema-first")
        .map((subgraph) => ({
          name: subgraph.name,
          typeDefs: parse(subgraph.sdl),
          label: subgraph.name,
          source: { specifier: sourceOf(subgraph) as `./${string}` },
        })),
    },
  };
}

/** Each diagnostic as `code source path: message`. */
function check(pkg: Package, models: Models = {}): string[] {
  return validateSubgraphsForHost({
    profile: "release",
    documentModels: models.codeFirst ?? [],
    ...hostRequest(pkg, models),
  })
    .diagnostics.map(
      ({ code, source, path, message }) =>
        `${code} ${source?.specifier} ${path.join(" ")}: ${message}`,
    )
    .sort();
}

const ORIGIN_REJECTION =
  "Rejecting subgraph @name from @origin: name is taken by a subgraph from @existing";

/** What the server does with `pkg`, registered as a package loader does. */
async function serve(pkg: Package, models: Models = {}) {
  const logger = makeHarnessLogger();
  const documentModels = [
    ...(models.codeFirst ?? []),
    ...(models.schemaFirst ?? []),
  ];
  const harness = makeHarness({
    logger,
    enableDocumentModelSubgraphs: documentModels.length > 0,
    reactorClient: makeMockReactorClient({
      getDocumentModelModules: vi
        .fn()
        .mockResolvedValue({ results: [makeDriveModule(), ...documentModels] }),
    }),
  });
  await initAndFlush(harness.manager);

  const namespace = Object.defineProperty(
    Object.fromEntries(
      Object.entries(pkg).map(([exportName, { style, name, sdl }]) => [
        exportName,
        style === "code-first"
          ? codeFirstClass(name, sdl)
          : schemaFirstClass(name, sdl),
      ]),
    ),
    Symbol.toStringTag,
    { value: "Module" },
  );
  const classes = extractSubgraphs(namespace);
  const applied = harness.manager.applyPackageSubgraphs(
    new Map([["pkg", classes]]),
  );
  await vi.runAllTimersAsync();
  await applied;
  const refreshed = harness.manager.updateRouter();
  await vi.runAllTimersAsync();
  await refreshed;

  const definitions = harness.gatewayAdapter.createSupergraphHandler.mock
    .calls[0][0] as () => { name: string }[];
  const inSupergraph = new Set(
    definitions().map(({ name }) => name.replace(":graphql/", "")),
  );
  return {
    logger,
    manager: harness.manager,
    /** Export names in the order the server registered them. */
    registered: classes.map(
      (subgraphClass) =>
        Object.entries(namespace).find(
          ([, value]) => value === subgraphClass,
        )?.[0],
    ),
    /** Package subgraphs the supergraph leaves out. */
    excluded: [...new Set(Object.values(pkg).map(({ name }) => name))]
      .filter((name) => !inSupergraph.has(name))
      .sort(),
  };
}

/** `pkg` with its subgraphs under export names in each possible order. */
function everyExportOrder(subgraphs: readonly Subgraph[]): Package[] {
  const orders = (items: readonly Subgraph[]): Subgraph[][] =>
    items.length <= 1
      ? [[...items]]
      : items.flatMap((item, index) =>
          orders(items.filter((_, other) => other !== index)).map((rest) => [
            item,
            ...rest,
          ]),
        );
  return orders(subgraphs).map((order) =>
    Object.fromEntries(
      order.map((subgraph, index) => [
        String.fromCharCode(65 + index),
        subgraph,
      ]),
    ),
  );
}

function logged(logger: ILogger): string[] {
  return vi
    .mocked(logger.error)
    .mock.calls.map((call) => call.map((part) => String(part)).join(" | "));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a root field both styles define", () => {
  const alpha: Subgraph = {
    style: "schema-first",
    name: "alpha",
    sdl: "type Query { widget: String }",
  };
  const beta: Subgraph = {
    style: "code-first",
    name: "beta",
    sdl: "type Query { widget: String }",
  };
  const message =
    'Subgraphs "alpha" and "beta" both define Query.widget, and the supergraph can include only one of them.';

  it("is reported on both subgraphs, and the server leaves out the one registered later", async () => {
    for (const [pkg, registered, excluded] of [
      [{ A: alpha, B: beta }, ["A", "B"], ["beta"]],
      [{ B: alpha, A: beta }, ["A", "B"], ["alpha"]],
    ] as const) {
      const served = await serve(pkg);
      expect(served.registered).toEqual(registered);
      expect(served.excluded).toEqual(excluded);
      expect(check(pkg)).toEqual([
        `PH-GQL-COORDINATE-OWNED ./subgraphs/alpha/schema.ts composition alpha Query.widget: ${message}`,
        `PH-GQL-COORDINATE-OWNED ./subgraphs/beta.ts composition beta Query.widget: ${message}`,
      ]);
    }
  });
});

describe("a type both styles define differently", () => {
  it("is reported on both subgraphs, and the server leaves out one of them", async () => {
    const message =
      'Gadget is defined one way by "gadget-a", and another way by "gadget-b". The supergraph can include the subgraphs of only one of these definitions.';
    for (const [pkg, excluded] of [
      [
        {
          A: {
            style: "schema-first",
            name: "gadget-a",
            sdl: "type Gadget { id: ID! } type Query { a: Gadget }",
          },
          B: {
            style: "code-first",
            name: "gadget-b",
            sdl: "type Gadget { id: ID! size: Int } type Query { b: Gadget }",
          },
        },
        ["gadget-b"],
      ],
      [
        {
          B: {
            style: "schema-first",
            name: "gadget-a",
            sdl: "type Gadget { id: ID! } type Query { a: Gadget }",
          },
          A: {
            style: "code-first",
            name: "gadget-b",
            sdl: "type Gadget { id: ID! size: Int } type Query { b: Gadget }",
          },
        },
        ["gadget-a"],
      ],
    ] satisfies [Package, string[]][]) {
      expect((await serve(pkg)).excluded).toEqual(excluded);
      expect(check(pkg)).toEqual([
        `PH-GQL-SHARED-DEFINITION-MISMATCH ./subgraphs/gadget-a/schema.ts composition gadget-a Gadget: ${message}`,
        `PH-GQL-SHARED-DEFINITION-MISMATCH ./subgraphs/gadget-b.ts composition gadget-b Gadget: ${message}`,
      ]);
    }
  });
});

describe("a subgraph named like the other style's document model", () => {
  const message =
    'Subgraph "notes" has the name of a document model subgraph, so the server refuses it.';

  it("is refused when it is schema-first and the model is code-first", async () => {
    const pkg: Package = {
      NotesSubgraph: {
        style: "schema-first",
        name: "notes",
        sdl: "type Query { ping: String }",
      },
    };
    const models = { codeFirst: [notesWithOperations()] };

    expect(logged((await serve(pkg, models)).logger)).toContain(
      `${ORIGIN_REJECTION} | notes | package pkg | document models`,
    );
    expect(check(pkg, models)).toEqual([
      `PH-SG-NAME-TAKEN ./subgraphs/notes/schema.ts composition notes: ${message}`,
    ]);
  });

  it("is refused when it is code-first and the model is schema-first", async () => {
    const pkg: Package = {
      NotesSubgraph: {
        style: "code-first",
        name: "notes",
        sdl: "type Query { ping: String }",
      },
    };
    const models = { schemaFirst: [notesWithOperations()] };

    expect(logged((await serve(pkg, models)).logger)).toContain(
      `${ORIGIN_REJECTION} | notes | package pkg | document models`,
    );
    expect(check(pkg, models)).toEqual([
      `PH-SG-NAME-TAKEN ./subgraphs/notes.ts composition notes: ${message}`,
    ]);
  });
});

describe("a subgraph defining a type the other style's document model generates", () => {
  const message =
    'Subgraph "ledger" defines Notes, which document model "Notes" generates, so the server refuses it.';
  const rejection = expect.stringMatching(
    /^Rejecting subgraph @name: @error \| ledger \| .*\bNotes\b/,
  );

  it("is refused when it is schema-first and the model is code-first", async () => {
    const pkg: Package = {
      LedgerSubgraph: {
        style: "schema-first",
        name: "ledger",
        sdl: "type Query { lastNote: Notes } type Notes { id: ID }",
      },
    };
    const models = { codeFirst: [notesWithOperations()] };

    const served = await serve(pkg, models);
    expect(served.excluded).toEqual(["ledger"]);
    expect(logged(served.logger)).toContainEqual(rejection);
    expect(check(pkg, models)).toEqual([
      `PH-SG-GENERATED-TYPE-TAKEN ./subgraphs/ledger/schema.ts composition ledger: ${message}`,
    ]);
  });

  it("is refused when it is code-first and the model is schema-first", async () => {
    const pkg: Package = {
      LedgerSubgraph: {
        style: "code-first",
        name: "ledger",
        sdl: "type Query { lastNote: Notes } type Notes { id: ID }",
      },
    };
    const models = { schemaFirst: [notesWithOperations()] };

    const served = await serve(pkg, models);
    expect(served.excluded).toEqual(["ledger"]);
    expect(logged(served.logger)).toContainEqual(rejection);
    expect(check(pkg, models)).toEqual([
      `PH-SG-GENERATED-TYPE-TAKEN ./subgraphs/ledger.ts composition ledger: ${message}`,
    ]);
  });
});

describe("a code-first subgraph using a schema-first model's generated type", () => {
  const pkg: Package = {
    LatestSubgraph: {
      style: "code-first",
      name: "latest",
      sdl: "type Query { latestNotes: Notes_NotesState }",
    },
  };

  it("is served, and passes the check given the schema-first models", async () => {
    const models = { schemaFirst: [notesWithOperations()] };

    expect((await serve(pkg, models)).excluded).toEqual([]);
    expect(check(pkg, models)).toEqual([]);
  });

  it("does not build without the schema-first models", () => {
    expect(check(pkg)).toEqual([
      'PH-SG-SCHEMA-INVALID ./subgraphs/latest.ts definition: Subgraph "latest" does not build, so the server does not serve it: Unknown type "Notes_NotesState".',
    ]);
  });
});

describe("two subgraphs of both styles with one name", () => {
  it("are both reported, and the server serves only the one registered later", async () => {
    const schemaFirst: Subgraph = {
      style: "schema-first",
      name: "ledger",
      sdl: "type Query { a: String }",
    };
    const codeFirst: Subgraph = {
      style: "code-first",
      name: "ledger",
      sdl: "type Query { b: String }",
    };
    const message =
      'Subgraphs in "./subgraphs/ledger.ts" and "ledger" are both named "ledger", so the server serves only one of them.';
    for (const [pkg, served] of [
      [{ A: schemaFirst, B: codeFirst }, "b"],
      [{ A: codeFirst, B: schemaFirst }, "a"],
    ] satisfies [Package, string][]) {
      const { manager } = await serve(pkg);
      expect(
        manager
          .getSubgraphByName("ledger")
          ?.typeDefs.definitions.flatMap((definition) =>
            "fields" in definition
              ? (definition.fields ?? []).map((field) => field.name.value)
              : [],
          ),
      ).toEqual([served]);
      expect(check(pkg)).toEqual([
        `PH-SG-NAME-TAKEN ./subgraphs/ledger.ts composition ledger: ${message}`,
        `PH-SG-NAME-TAKEN ./subgraphs/ledger/schema.ts composition ledger: ${message}`,
      ]);
    }
  });
});

describe("a chain of contests across interleaved styles", () => {
  const chain = (styles: [Style, Style, Style]): Subgraph[] => [
    { style: styles[0], name: "alpha", sdl: "type Query { x: String }" },
    {
      style: styles[1],
      name: "beta",
      sdl: "type Query { x: String y: String }",
    },
    { style: styles[2], name: "gamma", sdl: "type Query { y: String }" },
  ];
  const x =
    'Subgraphs "alpha" and "beta" both define Query.x, and the supergraph can include only one of them.';
  const y =
    'Subgraphs "beta" and "gamma" both define Query.y, and the supergraph can include only one of them.';

  it("gets the same findings in every export order, and the server leaves out only subgraphs they name", async () => {
    for (const styles of [
      ["schema-first", "code-first", "schema-first"],
      ["code-first", "schema-first", "code-first"],
    ] satisfies [Style, Style, Style][]) {
      const source = (index: number, name: string) =>
        styles[index] === "code-first"
          ? `./subgraphs/${name}.ts`
          : `./subgraphs/${name}/schema.ts`;
      const expected = [
        `PH-GQL-COORDINATE-OWNED ${source(0, "alpha")} composition alpha Query.x: ${x}`,
        `PH-GQL-COORDINATE-OWNED ${source(1, "beta")} composition beta Query.x: ${x}`,
        `PH-GQL-COORDINATE-OWNED ${source(1, "beta")} composition beta Query.y: ${y}`,
        `PH-GQL-COORDINATE-OWNED ${source(2, "gamma")} composition gamma Query.y: ${y}`,
      ].sort();
      const exclusions = new Set<string>();
      for (const pkg of everyExportOrder(chain(styles))) {
        exclusions.add((await serve(pkg)).excluded.join(" "));
        expect(check(pkg)).toEqual(expected);
      }
      expect([...exclusions].sort()).toEqual(["alpha gamma", "beta"]);
    }
  });
});

describe("a subgraph whose schema does not build", () => {
  it("is reported when it is code-first, and left to `ph generate` when it is schema-first", () => {
    expect(
      check({
        A: {
          style: "schema-first",
          name: "broken",
          sdl: "type Query { broken: Missing }",
        },
        B: {
          style: "code-first",
          name: "faulty",
          sdl: "type Query { faulty: Absent }",
        },
      }),
    ).toEqual([
      'PH-SG-SCHEMA-INVALID ./subgraphs/faulty.ts definition: Subgraph "faulty" does not build, so the server does not serve it: Unknown type "Absent". Did you mean "Amount"?.',
    ]);
  });
});

describe("checkDefinitions on a code-first selection without subgraphs", () => {
  function loaderFor(
    selection: Pick<LoadedDefinitionSet, "documentModels" | "subgraphs">,
  ): DefinitionSourceLoader {
    const set: LoadedDefinitionSet = {
      status: "ready",
      packageRoot: "/package",
      sourceSet: {
        mode: "code-first",
        origin: "request",
        digest: `sha256:${"0".repeat(64)}`,
        sources: [],
      },
      diagnostics: [],
      upgradeManifests: [],
      scalars: [],
      ...selection,
    };
    return {
      normalizeDefinitionSources: () => Promise.resolve(set),
    } as unknown as DefinitionSourceLoader;
  }

  it("reports a schema-first subgraph named like the selected model", async () => {
    const pkg: Package = {
      NotesSubgraph: {
        style: "schema-first",
        name: "notes",
        sdl: "type Query { ping: String }",
      },
    };
    const report = await checkDefinitions({
      profile: "edit",
      loader: loaderFor({
        documentModels: [
          {
            source: { specifier: "./document-models/notes.ts" },
            path: [],
            value: notesWithOperations(),
          },
        ],
        subgraphs: [],
      }),
      packageRevision: `sha256:${"0".repeat(64)}`,
      hostValidation: (request) =>
        validateSubgraphsForHost({
          ...request,
          schemaFirst: hostRequest(pkg).schemaFirst,
        }),
    });

    expect(
      report.diagnostics.map(
        ({ code, source, path, message }) =>
          `${code} ${source?.specifier} ${path.join(" ")}: ${message}`,
      ),
    ).toEqual([
      'PH-SG-NAME-TAKEN ./subgraphs/notes/schema.ts composition notes: Subgraph "notes" has the name of a document model subgraph, so the server refuses it.',
    ]);
  });
});

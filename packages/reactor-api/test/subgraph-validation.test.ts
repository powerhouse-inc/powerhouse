import type {
  DefinitionSource,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { defineDocumentModel, defineScalar, ph } from "document-model";
import {
  checkDefinitions,
  type DefinitionSourceLoader,
  type LoadedDefinition,
  type LoadedDefinitionSet,
  type SubgraphClass,
} from "document-model/tooling";
import { gql } from "graphql-tag";
import { parse } from "graphql";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { defineSubgraph } from "../src/graphql/define-subgraph.js";
import { forgetReportedScalarBindings } from "../src/graphql/scalar-bindings.js";
import { validateSubgraphsForHost } from "../src/graphql/subgraph-validation.js";

/**
 * Validation builds the augmented schema the host assembles and reports a
 * subgraph only when that schema fails to build. A raw author AST that names
 * `OID` is valid because the host declares `OID`.
 */

function entry(
  value: SubgraphClass,
  source: DefinitionSource = { specifier: "./subgraphs/x.ts" },
): LoadedDefinition<SubgraphClass> {
  return { value, source, path: ["definition"] };
}

function compat(name: string, sdl: string) {
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

function notesModel(): DocumentModelModule {
  return defineDocumentModel({
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
  }).finalize({ modules: [] }) as unknown as DocumentModelModule;
}

const Widget = ph.object("Widget", {
  fields: {
    id: ph.OID({ required: true }),
    label: ph.String({ required: true }),
  },
});

function widgets(name = "widgets") {
  return defineSubgraph({
    name,
    schemaKind: "typed",
    entries: (build) => [
      build.query("widget", {
        args: { id: ph.OID({ required: true }) },
        returns: ph.ref(Widget, { required: true }),
        resolve: () => ({ id: "w", label: "One" }),
      }),
    ],
  });
}

describe("validating against the augmented schema", () => {
  it("accepts a subgraph that names a host-declared scalar", () => {
    const result = validateSubgraphsForHost({
      profile: "edit",
      documentModels: [],
      subgraphs: [entry(widgets())],
    });
    expect(result).toEqual({ completed: true, diagnostics: [] });
  });

  it("validates the same typed AST that instances serve", () => {
    const Subgraph = widgets();
    const instance = new Subgraph(
      {} as ConstructorParameters<typeof Subgraph>[0],
    );
    expect(Subgraph.typeDefs).toBe(instance.typeDefs);
    expect(
      validateSubgraphsForHost({
        profile: "edit",
        documentModels: [],
        subgraphs: [entry(Subgraph)],
      }).diagnostics,
    ).toEqual([]);
  });

  it("rejects a typed class whose published AST is invalid or missing", () => {
    const Invalid = widgets();
    Object.defineProperty(Invalid, "typeDefs", {
      value: parse("type Query { widget: Missing }"),
    });
    const invalid = validateSubgraphsForHost({
      profile: "edit",
      documentModels: [],
      subgraphs: [entry(Invalid)],
    });
    expect(invalid.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "PH-SG-SCHEMA-INVALID",
    ]);

    const Missing = widgets();
    Object.defineProperty(Missing, "typeDefs", { value: undefined });
    const missing = validateSubgraphsForHost({
      profile: "edit",
      documentModels: [],
      subgraphs: [entry(Missing)],
    });
    expect(missing.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "PH-SG-DEFINITION-INVALID",
    ]);
  });

  it("reports a subgraph whose schema cannot build", () => {
    class Broken extends BaseSubgraph {
      name = "broken";
      typeDefs = gql`
        type Query {
          thing: Missing
        }
      `;
    }
    // Given a definition so the host reads it as a code-first class.
    Object.defineProperty(Broken, "typeDefs", {
      value: parse(`type Query { thing: Missing }`),
    });
    Object.defineProperty(Broken, "definition", {
      value: {
        kind: "powerhouse.subgraph",
        formatVersion: 1,
        name: "broken",
        compositionPolicy: "host-current",
        federationProfile: "host-current",
        schemaKind: "graphql-ast-compat",
        hasSubscriptions: null,
        document: parse(`type Query { thing: Missing }`),
        resolverCoordinates: [],
        access: "manual",
      },
    });

    const result = validateSubgraphsForHost({
      profile: "edit",
      documentModels: [],
      subgraphs: [entry(Broken)],
    });
    expect(result.completed).toBe(true);
    expect(result.diagnostics.map((entry) => entry.code)).toEqual([
      "PH-SG-SCHEMA-INVALID",
    ]);
    expect(result.diagnostics[0].message).toContain("Missing");
  });

  it("calls no resolver factory", () => {
    let factoryCalls = 0;
    const Subgraph = defineSubgraph({
      name: "compat",
      schemaKind: "graphql-ast-compat",
      compatibility: {
        kind: "graphql-ast-v1",
        typeDefs: parse("type Query { thing: String }"),
        resolverCoordinates: [],
        getResolvers: () => {
          factoryCalls += 1;
          return {};
        },
        hasSubscriptions: undefined,
        preserveDefinitionOrder: true,
      },
    });
    const result = validateSubgraphsForHost({
      profile: "edit",
      documentModels: [],
      subgraphs: [entry(Subgraph)],
    });
    expect(result.diagnostics).toEqual([]);
    expect(factoryCalls).toBe(0);
  });
});

describe("composition findings", () => {
  it("reports a coordinate two subgraphs own, as a warning", () => {
    const result = validateSubgraphsForHost({
      profile: "release",
      documentModels: [],
      subgraphs: [entry(widgets("alpha")), entry(widgets("beta"))],
    });
    const owned = result.diagnostics.filter(
      (entry) => entry.code === "PH-GQL-COORDINATE-OWNED",
    );
    expect(owned).toHaveLength(1);
    expect(owned[0].severity).toBe("warning");
    expect(owned[0].message).toContain("Query.widget");
  });

  it("says nothing about a single subgraph", () => {
    expect(
      validateSubgraphsForHost({
        profile: "release",
        documentModels: [],
        subgraphs: [entry(widgets())],
      }).diagnostics,
    ).toEqual([]);
  });
});

describe("the document models a schema builds against", () => {
  it("include the core models the host always loads", () => {
    const result = validateSubgraphsForHost({
      profile: "edit",
      documentModels: [],
      subgraphs: [
        entry(compat("drives", "type Query { firstDrive: DocumentDrive }")),
      ],
    });
    expect(result).toEqual({ completed: true, diagnostics: [] });
  });

  it("include the selected models", () => {
    const Notes = compat("notes", "type Query { firstNote: Notes }");
    const codes = (documentModels: readonly DocumentModelModule[]) =>
      validateSubgraphsForHost({
        profile: "edit",
        documentModels,
        subgraphs: [entry(Notes)],
      }).diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes([notesModel()])).toEqual([]);
    expect(codes([])).toEqual(["PH-SG-SCHEMA-INVALID"]);
  });
});

describe("diagnostic sources", () => {
  it("name the file each failing subgraph came from", () => {
    const a = { specifier: "./subgraphs/a.ts", exportPath: ["A"] } as const;
    const b = { specifier: "./subgraphs/b.ts", exportPath: ["B"] } as const;
    const result = validateSubgraphsForHost({
      profile: "edit",
      documentModels: [],
      subgraphs: [
        entry(compat("dup", "type Query { a: Missing }"), a),
        entry(compat("dup", "type Query { a: Missing }"), b),
      ],
    });
    expect(
      result.diagnostics.map(({ code, source }) => ({ code, source })),
    ).toEqual([
      { code: "PH-SG-SCHEMA-INVALID", source: a },
      { code: "PH-SG-SCHEMA-INVALID", source: b },
    ]);
  });
});

describe("package scalars", () => {
  beforeEach(() => {
    forgetReportedScalarBindings();
  });

  const PhoneNumber = defineScalar({
    name: "PhoneNumber",
    description: "An E.164 phone number.",
    representation: "string",
    validator: z.string().regex(/^\+[1-9]\d{1,14}$/),
    zodSource: "z.string().regex(/^\\+[1-9]\\d{1,14}$/)",
  });

  function contacts() {
    const Contact = ph.object("Contact", {
      fields: { phone: PhoneNumber({ required: true }) },
    });
    return defineSubgraph({
      name: "contacts",
      schemaKind: "typed",
      entries: (build) => [
        build.query("contact", {
          args: { phone: PhoneNumber({ required: true }) },
          returns: ph.ref(Contact),
          resolve: ({ args }) => ({ phone: args.phone }),
        }),
      ],
    });
  }

  it("validate with the coercion instances serve, so nothing is reported unregistered", () => {
    const Subgraph = contacts();
    const logged: string[] = [];
    const spy = vi
      .spyOn(console, "warn")
      .mockImplementation((...parts: unknown[]) => {
        logged.push(parts.map(String).join(" "));
      });
    try {
      expect(
        validateSubgraphsForHost({
          profile: "edit",
          documentModels: [],
          subgraphs: [entry(Subgraph)],
        }),
      ).toEqual({ completed: true, diagnostics: [] });
    } finally {
      spy.mockRestore();
    }
    expect(logged.filter((line) => line.includes("PH-SCALAR"))).toEqual([]);
    const instance = new Subgraph(
      {} as ConstructorParameters<typeof Subgraph>[0],
    );
    expect(Object.keys(Subgraph.scalarResolvers)).toEqual(["PhoneNumber"]);
    expect(instance.resolvers.PhoneNumber).toBe(
      Subgraph.scalarResolvers.PhoneNumber,
    );
  });
});

describe("a subgraph whose schema fails", () => {
  it("takes no part in composition", () => {
    const Invalid = widgets("beta");
    Object.defineProperty(Invalid, "typeDefs", {
      value: parse("type Query { widget: Missing }"),
    });
    const result = validateSubgraphsForHost({
      profile: "release",
      documentModels: [],
      subgraphs: [entry(widgets("alpha")), entry(Invalid)],
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "PH-SG-SCHEMA-INVALID",
    ]);
  });
});

describe("checkDefinitions with the host validator", () => {
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

  function check(
    selection: Pick<LoadedDefinitionSet, "documentModels" | "subgraphs">,
  ) {
    return checkDefinitions({
      profile: "edit",
      loader: loaderFor(selection),
      packageRevision: `sha256:${"0".repeat(64)}`,
      hostValidation: validateSubgraphsForHost,
    });
  }

  it("validates a subgraph against the selected and core models", async () => {
    const report = await check({
      documentModels: [
        {
          source: { specifier: "./document-models/notes.ts" },
          path: [],
          value: notesModel(),
        },
      ],
      subgraphs: [
        entry(
          compat(
            "report",
            "type Query { firstNote: Notes, firstDrive: DocumentDrive }",
          ),
        ),
      ],
    });
    expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([]);
  });

  it("reports what compiling the declaration found, with its source", async () => {
    const Post = ph.object("Post", {
      fields: {
        id: ph.OID({ required: true }),
        wordCount: ph.field({ returns: ph.Int({ required: true }) }),
      },
    });
    const Posts = defineSubgraph({
      name: "posts",
      schemaKind: "typed",
      entries: (build) => [
        build.query("post", {
          returns: ph.ref(Post, { required: true }),
          resolve: () => ({ id: "p" }),
        }),
      ],
    });
    const source = { specifier: "./subgraphs/posts.ts" } as const;
    const report = await check({
      documentModels: [],
      subgraphs: [entry(Posts, source)],
    });
    expect(report.status).toBe("invalid");
    expect(
      report.diagnostics.map(({ code, message, source }) => ({
        code,
        message,
        source,
      })),
    ).toEqual([
      {
        code: "PH-SG-COMPUTED-FIELD-INVALID",
        message: "Computed field Post.wordCount has no binding.",
        source,
      },
    ]);
  });

  it("reports compile diagnostics it cannot read instead of passing", async () => {
    const Posts = defineSubgraph({
      name: "posts",
      schemaKind: "typed",
      entries: (build) => [
        build.query("post", { returns: ph.String(), resolve: () => "p" }),
      ],
    });
    Object.defineProperty(Posts, "diagnostics", {
      value: [
        {
          code: "PH-SG-NOT-IN-THIS-RELEASE",
          path: [],
          message: "A code a newer compiler added.",
          repair: "Upgrade.",
        },
      ],
    });
    const report = await check({
      documentModels: [],
      subgraphs: [entry(Posts)],
    });
    expect(report.status).toBe("invalid");
    expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "PH-SG-DEFINITION-INVALID",
    ]);
  });

  it("builds without a model the adapter rejected", async () => {
    const report = await check({
      documentModels: [
        {
          source: { specifier: "./document-models/broken.ts" },
          path: [],
          value: {
            reducer: () => undefined,
            documentModel: {},
          } as unknown as DocumentModelModule,
        },
      ],
      subgraphs: [
        entry(compat("report", "type Query { firstDrive: DocumentDrive }")),
      ],
    });
    expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "PH-DM-DECLARATION-INVALID",
      "PH-DM-DECLARATION-INVALID",
      "PH-DM-DECLARATION-INVALID",
    ]);
  });
});

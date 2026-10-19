import type {
  CatalogScalarReferenceDefinition,
  DefinitionDiagnostic,
  DocumentModelDefinition,
  PackageScalarReferenceDefinition,
} from "@powerhousedao/shared/document-model";
import { print } from "graphql";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  DefinitionDiagnosticCollector,
  DocumentModelDefinitionError,
} from "../../src/definition/diagnostics.js";
import { createScalarField } from "../../src/definition/field-options.js";
import { ph } from "../../src/definition/field.js";
import {
  defineDocumentModel,
  defineDocumentModelFamily,
} from "../../src/definition/model.js";
import {
  buildScalarCatalog,
  isHostScalarName,
  isReferenceableScalarName,
  scalarCatalog,
  subgraphScalars,
} from "../../src/definition/scalars/catalog.js";
import { phidScalar } from "../../src/definition/scalars/declarations/phid.js";
import { jsonObjectScalar } from "../../src/definition/scalars/declarations/json-object.js";
import {
  defineInternalScalar,
  defineScalar,
} from "../../src/definition/scalars/define-scalar.js";
import {
  orderedScalarNames,
  scalarTypeScriptTypes,
  scalarZodSources,
} from "../../src/definition/scalars/emit.js";
import { packageScalarsOf } from "../../src/definition/scalars/package-scalars.js";
import { compileSubgraphSchema } from "../../src/definition/subgraph/ast.js";
import { createEntryBuilders } from "../../src/definition/subgraph/entries.js";
import { checkSubgraphDefinitionShape } from "../../src/definition/subgraph/wire-shape.js";
import { checkDocumentModelDefinitionShape } from "../../src/definition/wire-shape.js";

/**
 * A package scalar: declared with the `defineScalar` every catalog scalar is
 * declared with, and referenced by a code-first model through the factory it
 * returns. The catalog does not hold it, so the model's definition does.
 */

const PROFILE = "document-engineering-1.40";

const phoneNumberDeclaration = {
  name: "PhoneNumber",
  description: "An E.164 phone number.",
  representation: "string",
  validator: z.string().regex(/^\+[1-9]\d{1,14}$/),
  zodSource: "z.string().regex(/^\\+[1-9]\\d{1,14}$/)",
} as const;

const PhoneNumber = defineScalar(phoneNumberDeclaration);

function diagnosticsOf(run: () => unknown): readonly DefinitionDiagnostic[] {
  try {
    run();
  } catch (error) {
    if (error instanceof DocumentModelDefinitionError) return error.diagnostics;
    throw error;
  }
  throw new Error("expected a DocumentModelDefinitionError");
}

function contacts(fields: Parameters<typeof ph.object>[1]["fields"]) {
  return defineDocumentModel({
    id: "test/contacts",
    name: "Contacts",
    description: "",
    extension: "contacts",
    version: 1,
    author: { name: "Powerhouse", website: null },
    specifications: {
      global: {
        schema: ph.object("ContactsState", { fields }),
        initialValue: Object.fromEntries(
          Object.keys(fields).map((key) => [key, null]),
        ),
      },
      local: { schema: null, initialValue: {} },
    },
  });
}

function contactsModel() {
  const context = contacts({ phone: PhoneNumber() });
  const edits = context.module("edits", {
    operations: ({ global }) => ({
      setPhone: global({
        input: ph.input({ fields: { phone: PhoneNumber({ required: true }) } }),
        reduce(state, input) {
          state.phone = input.phone;
        },
      }),
    }),
  });
  return context.finalize({ modules: [edits] });
}

describe("a package scalar", () => {
  it("is its own field factory, named without ph", () => {
    expect(PhoneNumber.kind).toBe("scalar-factory");
    expect(PhoneNumber.role).toBe(
      "field-use factory; call it, as PhoneNumber({ required: true })",
    );
    expect(PhoneNumber.definition.name).toBe("PhoneNumber");
    expect(PhoneNumber.binding.typedef).toBe("scalar PhoneNumber");
    const field = PhoneNumber({ required: true });
    expect(field.validator.safeParse("+14155550123").success).toBe(true);
    expect(field.validator.safeParse("14155550123").success).toBe(false);
    expect(field.binding).toBe(PhoneNumber.binding);
  });

  it("fills every field it omits with its default", () => {
    expect(PhoneNumber.declaration.builderName).toBe("PhoneNumber");
    expect(PhoneNumber.declaration.persistable).toBe(true);
    expect(PhoneNumber.declaration.zero).toStrictEqual({
      kind: "none",
      reason: "PhoneNumber has no meaningful empty value",
    });
    expect(PhoneNumber.binding.typescriptType).toBe("string");
    expect(PhoneNumber.definition.coercion).toStrictEqual({
      source: "derived",
    });
    expect(PhoneNumber.definition.coercionProfile).toBe(PROFILE);
    expect(
      PhoneNumber.binding.coercion.parseLiteral({
        kind: "string",
        value: "+14155550123",
      }),
    ).toBe("+14155550123");
    expect(() =>
      PhoneNumber.binding.coercion.parseLiteral({ kind: "int", value: "1" }),
    ).toThrow("PhoneNumber cannot coerce a int literal.");
  });

  it("is declared the way a catalog scalar is, and ph renames only the role", () => {
    expect(phidScalar.role).toBe(
      "field-use factory; call it, as PHID({ required: true })",
    );
    expect(ph.PHID.role).toBe(
      "field-use factory; call it, as ph.PHID({ required: true })",
    );
    expect(ph.PHID.binding).toBe(phidScalar.binding);
    expect(ph.PHID().binding).toBe(scalarCatalog.resolve("PHID", PROFILE));
  });

  it("extends the built-in catalog without changing it", () => {
    const { catalog, report } = buildScalarCatalog([phoneNumberDeclaration], {
      base: scalarCatalog,
    });
    expect(report.diagnostics).toEqual([]);
    expect(catalog?.names).toEqual([...scalarCatalog.names, "PhoneNumber"]);
    expect(catalog?.resolve("PHID", PROFILE)).toBe(
      scalarCatalog.resolve("PHID", PROFILE),
    );
    expect(catalog?.resolve("PhoneNumber", PROFILE)?.definition).toEqual(
      PhoneNumber.definition,
    );
    expect(catalog?.digest).not.toBe(scalarCatalog.digest);
    expect(scalarCatalog.names).toHaveLength(21);

    expect(scalarTypeScriptTypes(catalog!).PhoneNumber).toBe("string");
    expect(scalarZodSources(catalog!).PhoneNumber).toBe(
      "z.string().regex(/^\\+[1-9]\\d{1,14}$/)",
    );
    expect(orderedScalarNames(catalog!.authorNames, ["Unknown"]).at(-1)).toBe(
      "PhoneNumber",
    );
  });

  it("refuses a name the catalog already has", () => {
    const { catalog, report } = buildScalarCatalog(
      [{ ...phoneNumberDeclaration, name: "PHID" }],
      { base: scalarCatalog },
    );
    expect(catalog).toBeUndefined();
    expect(report.diagnostics.map((entry) => entry.code)).toEqual([
      "PH-SCALAR-DUPLICATE-NAME",
    ]);
  });
});

describe("a model referencing a package scalar", () => {
  it("declares the scalar in its own definition", () => {
    const model = contactsModel();
    const specification = model.definition.specifications.at(-1)!;
    expect(specification.scalars).toStrictEqual([
      {
        name: "PhoneNumber",
        implementation: "package#PhoneNumber",
        coercionProfile: PROFILE,
        definition: PhoneNumber.definition,
      } satisfies PackageScalarReferenceDefinition,
    ]);
    expect(specification.state.global.materialized.schema).toContain(
      "phone: PhoneNumber",
    );
    const collector = new DefinitionDiagnosticCollector();
    expect(checkDocumentModelDefinitionShape(collector, model.definition)).toBe(
      true,
    );
    expect(collector.diagnostics).toEqual([]);
  });

  it("validates values with the scalar's validator", () => {
    const model = contactsModel();
    const document = model.utils.createDocument();
    const next = model.reducer(
      document,
      model.actions.setPhone({ phone: "+14155550123" }),
    );
    expect(next.state.global.phone).toBe("+14155550123");
    expect(() => model.actions.setPhone({ phone: "not a phone" })).toThrow();
  });

  it("hands the host the binding it coerces with", () => {
    const model = contactsModel();
    expect(packageScalarsOf(model)).toStrictEqual([PhoneNumber.binding]);
    expect(packageScalarsOf({})).toStrictEqual([]);
  });

  it("hands every version of a family the bindings of its whole history", () => {
    const at = (version: number, fields: Parameters<typeof contacts>[0]) =>
      defineDocumentModel({
        id: "test/contacts-family",
        name: "Contacts",
        description: "",
        extension: "contacts",
        version,
        author: { name: "Powerhouse", website: null },
        specifications: {
          global: {
            schema: ph.object("ContactsState", { fields }),
            initialValue: Object.fromEntries(
              Object.keys(fields).map((key) => [key, null]),
            ),
          },
          local: { schema: null, initialValue: {} },
        },
      }).version({ modules: [] });
    const family = defineDocumentModelFamily({
      versions: [
        at(1, { name: ph.String() }),
        at(2, { name: ph.String(), phone: PhoneNumber() }),
      ],
      upgradeManifest: {
        documentType: "test/contacts-family",
        latestVersion: 2,
        supportedVersions: [1, 2],
        upgrades: {
          v2: { toVersion: 2, upgradeReducer: (document) => document },
        },
      },
    });
    // Each version's definition carries the version 2 specification, which
    // is the one a host projects, so each needs its binding.
    for (const version of [1, 2] as const) {
      expect(packageScalarsOf(family.at(version))).toStrictEqual([
        PhoneNumber.binding,
      ]);
    }
  });

  it("treats one declaration evaluated twice as one scalar", () => {
    const again = defineScalar(phoneNumberDeclaration);
    expect(again.binding).not.toBe(PhoneNumber.binding);
    const model = contacts({
      phone: PhoneNumber(),
      fax: again(),
    }).finalize({ modules: [] });
    expect(
      model.definition.specifications.at(-1)!.scalars.map(({ name }) => name),
    ).toEqual(["PhoneNumber"]);
  });

  it("lists catalog scalars first, then package scalars by name", () => {
    const Zip = defineScalar({
      name: "ZipCode",
      description: "A five-digit US ZIP code.",
      representation: "string",
      validator: z.string().regex(/^\d{5}$/),
      zodSource: "z.string().regex(/^\\d{5}$/)",
    });
    const model = contacts({
      zip: Zip(),
      phone: PhoneNumber(),
      id: ph.OID(),
    }).finalize({ modules: [] });
    expect(
      model.definition.specifications
        .at(-1)!
        .scalars.map(({ implementation }) => implementation),
    ).toEqual([
      "powerhouse.catalog#OID",
      "package#PhoneNumber",
      "package#ZipCode",
    ]);
  });
});

describe("a package scalar the compiler refuses", () => {
  it("reuses a catalog or built-in name", () => {
    const FakePhid = defineScalar({ ...phoneNumberDeclaration, name: "PHID" });
    const FakeString = defineScalar({
      ...phoneNumberDeclaration,
      name: "String",
    });
    const FakeJsonObject = defineScalar({
      ...phoneNumberDeclaration,
      name: "JSONObject",
    });
    for (const [factory, name] of [
      [FakePhid, "PHID"],
      [FakeString, "String"],
      [FakeJsonObject, "JSONObject"],
    ] as const) {
      const diagnostics = diagnosticsOf(() =>
        contacts({ id: factory() }).finalize({ modules: [] }),
      );
      expect(diagnostics.map((entry) => [entry.code, entry.received])).toEqual([
        ["PH-SCALAR-DUPLICATE-NAME", name],
      ]);
    }
  });

  it("shares its name with a different package scalar", () => {
    const Other = defineScalar({
      ...phoneNumberDeclaration,
      description: "A phone number in any format.",
      validator: z.string(),
      zodSource: "z.string()",
    });
    const diagnostics = diagnosticsOf(() =>
      contacts({ phone: PhoneNumber(), other: Other() }).finalize({
        modules: [],
      }),
    );
    expect(diagnostics.map((entry) => [entry.code, entry.received])).toEqual([
      ["PH-SCALAR-DUPLICATE-NAME", "PhoneNumber"],
    ]);
  });

  it("shares its name and definition with a scalar validated otherwise", () => {
    const Loose = defineScalar({
      ...phoneNumberDeclaration,
      validator: z.string(),
      zodSource: "z.string()",
    });
    expect(Loose.definition).toStrictEqual(PhoneNumber.definition);
    const diagnostics = diagnosticsOf(() =>
      contacts({ phone: PhoneNumber(), loose: Loose() }).finalize({
        modules: [],
      }),
    );
    expect(diagnostics.map((entry) => [entry.code, entry.received])).toEqual([
      ["PH-SCALAR-DUPLICATE-NAME", "PhoneNumber"],
    ]);
  });

  it("shares its name with a named type", () => {
    const Clash = ph.object("PhoneNumber", {
      fields: { digits: ph.String() },
    });
    const diagnostics = diagnosticsOf(() =>
      contacts({ phone: PhoneNumber(), clash: ph.ref(Clash) }).finalize({
        modules: [],
      }),
    );
    expect(diagnostics.map((entry) => [entry.code, entry.received])).toEqual([
      ["PH-DM-DUPLICATE-NAME", "PhoneNumber"],
    ]);
  });
});

describe("a catalog scalar from another copy of the compiler", () => {
  it("stays a catalog scalar when that copy's definition differs", () => {
    // Another release's catalog: the same scalar, with an edited description.
    // It registers its bindings where every copy looks.
    const OtherPhid = defineScalar({
      ...phidScalar.declaration,
      description: "An opaque Powerhouse identifier, as another release says.",
    });
    (globalThis as unknown as Record<symbol, WeakSet<object>>)[
      Symbol.for("powerhouse.document-model.catalog-bindings.v1")
    ].add(OtherPhid.binding);
    const model = contacts({ id: OtherPhid() }).finalize({ modules: [] });
    expect(model.definition.specifications.at(-1)!.scalars).toStrictEqual([
      {
        name: "PHID",
        implementation: "powerhouse.catalog#PHID",
        coercionProfile: PROFILE,
      },
    ]);
  });
});

describe("the wire shape of a package scalar reference", () => {
  function tampered(
    edit: (reference: Record<string, unknown>) => void,
  ): readonly string[] {
    const definition = structuredClone(
      contactsModel().definition,
    ) as DocumentModelDefinition;
    edit(
      definition.specifications.at(-1)!.scalars[0] as unknown as Record<
        string,
        unknown
      >,
    );
    const collector = new DefinitionDiagnosticCollector();
    checkDocumentModelDefinitionShape(collector, definition);
    return collector.diagnostics.map((entry) => entry.path.join("/"));
  }

  it("ties the implementation and the definition to the name", () => {
    expect(
      tampered((reference) => {
        reference.implementation = "package#Other";
      }),
    ).toEqual(["specifications/0/scalars/0/implementation"]);
    expect(
      tampered((reference) => {
        (reference.definition as Record<string, unknown>).name = "Other";
      }),
    ).toEqual(["specifications/0/scalars/0/definition/name"]);
  });

  it("reports an array definition, or an array member of one, as an array", () => {
    const received = (edit: (reference: Record<string, unknown>) => void) => {
      const definition = structuredClone(contactsModel().definition);
      edit(
        definition.specifications.at(-1)!.scalars[0] as unknown as Record<
          string,
          unknown
        >,
      );
      const collector = new DefinitionDiagnosticCollector();
      checkDocumentModelDefinitionShape(collector, definition);
      return collector.diagnostics.map((entry) => [
        entry.path.join("/"),
        entry.received,
      ]);
    };

    expect([
      ...received((reference) => {
        reference.definition = [];
      }),
      ...received((reference) => {
        (reference.definition as Record<string, unknown>).description = [];
      }),
    ]).toEqual([
      ["specifications/0/scalars/0/definition", "array"],
      ["specifications/0/scalars/0/definition/description", "array"],
    ]);
  });

  it("refuses a catalog name and an undeclared reference", () => {
    expect(
      tampered((reference) => {
        reference.name = "PHID";
      }),
    ).toContain("specifications/0/scalars/0/name");
    expect(
      tampered((reference) => {
        reference.name = "JSONObject";
      }),
    ).toContain("specifications/0/scalars/0/name");
    expect(
      tampered((reference) => {
        delete reference.definition;
        reference.name = "JSONObject";
        reference.implementation = "powerhouse.catalog#JSONObject";
      }),
    ).toContain("specifications/0/scalars/0/name");
    expect(
      tampered((reference) => {
        reference.name = "Fax";
        reference.implementation = "package#Fax";
        (reference.definition as Record<string, unknown>).name = "Fax";
      }),
    ).toEqual([
      "specifications/0/modules/0/operations/0/input/fields/0/type/name",
      "specifications/0/types/0/fields/0/type/name",
    ]);
  });
});

describe("an internal scalar", () => {
  const internalScalar = {
    code: "PH-SCALAR-INTERNAL",
    message:
      "JSONObject is internal to the reactor host. A document model cannot use it.",
    repair:
      "Use ph.Unknown() for an unconstrained value, or ph.object(...) for a structured one. A subgraph can use subgraphScalars.JSONObject().",
  };

  const catalogJsonObjectField = () =>
    createScalarField(
      "JSONObject",
      jsonObjectScalar.binding.validator,
      undefined,
      jsonObjectScalar.binding,
    );

  it("compiles to a record no field can call", () => {
    const HostOnly = defineInternalScalar({
      name: "HostOnly",
      description: "A value only the reactor host declares.",
      representation: "json-object",
      validator: z.record(z.string(), z.unknown()),
      zodSource: "z.record(z.string(), z.unknown())",
    });
    expect(HostOnly.kind).toBe("internal-scalar");
    expect(HostOnly.binding.typedef).toBe("scalar HostOnly");
    const call = (): unknown =>
      // @ts-expect-error an internal scalar has no call signature
      HostOnly();
    expect(call).toThrow(TypeError);
  });

  it("stays internal in a catalog extended with author declarations", () => {
    const { catalog, report } = buildScalarCatalog([phoneNumberDeclaration], {
      base: scalarCatalog,
    });
    expect(report.diagnostics).toEqual([]);
    expect(catalog?.internalNames).toEqual(["JSONObject"]);
    expect(catalog?.authorNames.at(-1)).toBe("PhoneNumber");
    expect(catalog?.authorNames).not.toContain("JSONObject");

    const extendedAgain = buildScalarCatalog(
      [{ ...phoneNumberDeclaration, name: "Fax" }],
      { base: catalog },
    ).catalog;
    expect(extendedAgain?.names.slice(-3)).toEqual([
      "JSONObject",
      "PhoneNumber",
      "Fax",
    ]);
    expect(extendedAgain?.internalNames).toEqual(["JSONObject"]);
  });

  it("cannot be declared through defineScalar", () => {
    const declaration = {
      ...phoneNumberDeclaration,
      visibility: "internal",
    } as typeof phoneNumberDeclaration;
    const expected = [
      {
        code: "PH-SCALAR-DECLARATION-INVALID",
        path: ["visibility"],
        message:
          "Scalar PhoneNumber sets visibility, which defineScalar does not take.",
        repair:
          "Remove visibility. Only the compiler catalog declares internal scalars, so every scalar defineScalar returns is one authors use.",
      },
    ];
    const pick = (entries: readonly DefinitionDiagnostic[]) =>
      entries.map(({ code, path, message, repair }) => ({
        code,
        path,
        message,
        repair,
      }));
    expect(pick(diagnosticsOf(() => defineScalar(declaration)))).toEqual(
      expected,
    );
    const built = buildScalarCatalog([declaration], { base: scalarCatalog });
    expect(built.catalog).toBeUndefined();
    expect(pick(built.report.diagnostics)).toEqual(expected);
  });

  it("is refused in a model field that carries its catalog binding", () => {
    const diagnostics = diagnosticsOf(() =>
      contacts({ meta: catalogJsonObjectField() }).finalize({
        modules: [],
      }),
    );
    expect(
      diagnostics.map(({ code, path, message, repair }) => ({
        code,
        path,
        message,
        repair,
      })),
    ).toEqual([
      {
        ...internalScalar,
        path: ["specifications", "global", "schema", "fields", "meta"],
      },
    ]);
  });

  it("is refused in a model field built with the subgraph factory", () => {
    const diagnostics = diagnosticsOf(() =>
      contacts({ meta: subgraphScalars.JSONObject() }).finalize({
        modules: [],
      }),
    );
    expect(
      diagnostics.map(({ code, path, message, repair }) => ({
        code,
        path,
        message,
        repair,
      })),
    ).toEqual([
      {
        ...internalScalar,
        path: ["specifications", "global", "schema", "fields", "meta"],
      },
    ]);
  });

  function compileMeta(field: () => ReturnType<typeof catalogJsonObjectField>) {
    const { builders, exposed } = createEntryBuilders();
    return compileSubgraphSchema({
      name: "meta",
      entries: [
        builders.query("meta", {
          args: { filter: field() },
          returns: field(),
          resolve: () => ({}),
        }),
      ],
      exposed,
    });
  }

  it("is declared by a subgraph that uses the subgraph factory", () => {
    const compiled = compileMeta(() => subgraphScalars.JSONObject());
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.scalars).toEqual([
      {
        name: "JSONObject",
        implementation: "powerhouse.catalog#JSONObject",
        graphQLProfile: "legacy-graphql-default-v1",
      },
    ]);
    expect(print(compiled.document as never)).toBe(
      "scalar JSONObject\n\ntype Query {\n  meta(filter: JSONObject): JSONObject\n}",
    );
    expect(
      checkSubgraphDefinitionShape({
        kind: "powerhouse.subgraph",
        formatVersion: 1,
        name: "meta",
        compositionPolicy: "host-current",
        federationProfile: "host-current",
        schemaKind: "typed",
        hasSubscriptions: false,
        types: compiled.types,
        entries: compiled.entries,
        scalars: compiled.scalars,
        definitionOrder: compiled.definitionOrder,
      }),
    ).toEqual([]);
  });

  it("is accepted in a subgraph field that carries another copy's catalog binding", async () => {
    vi.resetModules();
    const other = await import("../../src/definition/scalars/catalog.js");
    expect(other.subgraphScalars.JSONObject.binding).not.toBe(
      subgraphScalars.JSONObject.binding,
    );
    const compiled = compileMeta(() => other.subgraphScalars.JSONObject());
    expect(compiled.diagnostics).toEqual([]);
    expect(print(compiled.document as never)).toBe(
      "scalar JSONObject\n\ntype Query {\n  meta(filter: JSONObject): JSONObject\n}",
    );
  });

  it("is refused in a subgraph field that names it with no binding", () => {
    const compiled = compileMeta(() =>
      createScalarField(
        "JSONObject",
        jsonObjectScalar.binding.validator,
        undefined,
      ),
    );
    expect(
      compiled.diagnostics.map(({ code, path, message, repair }) => ({
        code,
        path,
        message,
        repair,
      })),
    ).toEqual([
      { ...internalScalar, path: ["entries", 0, "args", "filter"] },
      { ...internalScalar, path: ["entries", 0, "returns"] },
    ]);
  });

  it("is offered as a factory by subgraphScalars only", () => {
    const read = (): unknown =>
      // @ts-expect-error JSONObject is internal to the reactor host
      ph.JSONObject;
    expect(diagnosticsOf(read)).toMatchObject([
      { ...internalScalar, path: ["JSONObject"] },
    ]);
    expect(Object.keys(subgraphScalars)).toEqual(["JSONObject"]);
    expect(subgraphScalars.JSONObject.role).toBe(
      "field-use factory; call it, as subgraphScalars.JSONObject({ required: true })",
    );
  });

  it("is a host scalar a definition cannot reference", () => {
    expect(
      ["JSONObject", "Unknown", "String", "Fax"].map((name) => [
        name,
        isReferenceableScalarName(name),
        isHostScalarName(name),
      ]),
    ).toEqual([
      ["JSONObject", false, true],
      ["Unknown", true, true],
      ["String", true, true],
      ["Fax", false, false],
    ]);
  });

  it("has no wire catalog reference, in the type or in the shape check", () => {
    const reference: CatalogScalarReferenceDefinition = {
      // @ts-expect-error JSONObject is internal, so no catalog reference names it
      name: "JSONObject",
      // @ts-expect-error JSONObject is internal, so no catalog implementation names it
      implementation: "powerhouse.catalog#JSONObject",
      coercionProfile: "document-engineering-1.40",
    };
    const definition = structuredClone(
      contactsModel().definition,
    ) as DocumentModelDefinition;
    (definition.specifications.at(-1)!.scalars as unknown[]).push(reference);
    const collector = new DefinitionDiagnosticCollector();
    checkDocumentModelDefinitionShape(collector, definition);
    expect(
      collector.diagnostics.map(({ code, path, message }) => ({
        code,
        path: path.join("/"),
        message,
      })),
    ).toEqual([
      {
        code: internalScalar.code,
        path: "specifications/0/scalars/1/name",
        message: internalScalar.message,
      },
    ]);
  });

  it("is refused as a wire type reference", () => {
    const definition = structuredClone(
      contactsModel().definition,
    ) as DocumentModelDefinition;
    const [state] = definition.specifications.at(-1)!.types as unknown as {
      fields: { type: { name: string } }[];
    }[];
    state.fields[0].type.name = "JSONObject";
    const collector = new DefinitionDiagnosticCollector();
    checkDocumentModelDefinitionShape(collector, definition);
    expect(
      collector.diagnostics.map(({ code, path, message }) => ({
        code,
        path: path.join("/"),
        message,
      })),
    ).toEqual([
      {
        code: internalScalar.code,
        path: "specifications/0/types/0/fields/0/type/name",
        message: internalScalar.message,
      },
    ]);
  });
});

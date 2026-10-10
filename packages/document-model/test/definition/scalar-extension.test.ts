import type {
  DefinitionDiagnostic,
  DocumentModelDefinition,
  PackageScalarReferenceDefinition,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  DefinitionDiagnosticCollector,
  DocumentModelDefinitionError,
} from "../../src/definition/diagnostics.js";
import { ph } from "../../src/definition/field.js";
import {
  defineDocumentModel,
  defineDocumentModelFamily,
} from "../../src/definition/model.js";
import {
  buildScalarCatalog,
  scalarCatalog,
} from "../../src/definition/scalars/catalog.js";
import { phidScalar } from "../../src/definition/scalars/declarations/phid.js";
import { defineScalar } from "../../src/definition/scalars/define-scalar.js";
import {
  orderedScalarNames,
  scalarTypeScriptTypes,
  scalarZodSources,
} from "../../src/definition/scalars/emit.js";
import { packageScalarsOf } from "../../src/definition/scalars/package-scalars.js";
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
    expect(
      orderedScalarNames(catalog!.names, ["Unknown"], ["JSONObject"]).at(-1),
    ).toBe("PhoneNumber");
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
    for (const [factory, name] of [
      [FakePhid, "PHID"],
      [FakeString, "String"],
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

  it("refuses a catalog name and an undeclared reference", () => {
    expect(
      tampered((reference) => {
        reference.name = "PHID";
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

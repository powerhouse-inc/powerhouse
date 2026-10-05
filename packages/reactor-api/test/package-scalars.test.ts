import { buildSubgraphSchema } from "@apollo/subgraph";
import type { SubgraphArgs } from "@powerhousedao/reactor-api";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import {
  defineDocumentModel,
  defineDocumentModelFamily,
  defineScalar,
  ph,
} from "document-model";
import type * as GraphQL from "graphql";
import { type DocumentNode, Kind, print } from "graphql";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineSubgraph } from "../src/graphql/define-subgraph.js";
import { forgetReportedScalarBindings } from "../src/graphql/scalar-bindings.js";
import {
  buildSubgraphSchemaModule,
  getDocumentModelTypeDefs,
} from "../src/utils/create-schema.js";
import { hostFor, messages } from "./utils/graphql-host.js";
import { composedWith } from "./utils/scalar-matrix.js";

/**
 * The host serves a package scalar under the model prefix, with its
 * description and its compiled coercion. Catalog scalars keep the default
 * pass-through that stored clients depend on, and a package scalar has no such
 * clients.
 */

const { graphql } = createRequire(import.meta.url)("graphql") as typeof GraphQL;

const EMPTY: DocumentNode = { kind: Kind.DOCUMENT, definitions: [] };

const phoneNumberDeclaration = {
  name: "PhoneNumber",
  description: "An E.164 phone number.",
  representation: "string",
  validator: z.string().regex(/^\+[1-9]\d{1,14}$/),
  zodSource: "z.string().regex(/^\\+[1-9]\\d{1,14}$/)",
} as const;

const PhoneNumber = defineScalar(phoneNumberDeclaration);

type PhoneScalar = typeof PhoneNumber;

function contactsContext(
  version: number,
  fields: Parameters<typeof ph.object>[1]["fields"],
) {
  return defineDocumentModel({
    id: "test/contacts",
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
  });
}

function contactsModel(scalar: PhoneScalar = PhoneNumber): DocumentModelModule {
  const context = contactsContext(1, { phone: scalar() });
  const edits = context.module("edits", {
    operations: ({ global }) => ({
      setPhone: global({
        input: ph.input({ fields: { phone: scalar({ required: true }) } }),
        reduce(state, input) {
          state.phone = input.phone;
        },
      }),
    }),
  });
  return context.finalize({
    modules: [edits],
  }) as unknown as DocumentModelModule;
}

function lookupSubgraph() {
  const Contact = ph.object("Contact", {
    fields: { phone: PhoneNumber({ required: true }) },
  });
  return defineSubgraph({
    name: "contacts-lookup",
    schemaKind: "typed",
    entries: ({ query }) => [
      query("contact", {
        args: { phone: PhoneNumber({ required: true }) },
        returns: ph.ref(Contact),
        resolve: ({ args }) => ({ phone: args.phone }),
      }),
    ],
  });
}

function subgraphHost(
  subgraphClass: ReturnType<typeof defineSubgraph>,
  models: readonly DocumentModelModule[] = [],
) {
  const subgraph = new subgraphClass({} as SubgraphArgs);
  const schema = buildSubgraphSchema([
    buildSubgraphSchemaModule(
      [...models],
      subgraph.resolvers as never,
      subgraph.typeDefs,
    ),
  ]);
  return (source: string, variableValues?: Record<string, unknown>) =>
    graphql({ schema, source, variableValues });
}

describe("a model's package scalar on the host", () => {
  it("is declared once, under the model's prefix, in every subgraph's SDL", () => {
    const sdl = print(getDocumentModelTypeDefs([contactsModel()], EMPTY));
    expect(sdl).toContain(
      '"An E.164 phone number."\nscalar Contacts_PhoneNumber',
    );
    expect(sdl.match(/scalar Contacts_PhoneNumber/g)).toHaveLength(1);
    expect(sdl).toContain("phone: Contacts_PhoneNumber");
    expect(sdl).not.toMatch(/scalar PhoneNumber\b/);
  });

  it("is bound, so the host reports nothing about it", () => {
    const scalarLines = (logged: readonly string[]) =>
      logged.filter((line) => line.includes("PH-SCALAR"));

    forgetReportedScalarBindings();
    expect(scalarLines(composedWith([contactsModel()], {}).logged)).toEqual([]);

    forgetReportedScalarBindings();
    const shadowed = scalarLines(
      composedWith([contactsModel()], { PHID: {} }).logged,
    );
    expect(shadowed).toEqual([
      expect.stringContaining("PH-SCALAR-RESOLVER-SHADOWED"),
    ]);
    expect(shadowed[0]).not.toContain("PhoneNumber");
  });

  it("coerces a mutation input and serves the stored value", async () => {
    const host = hostFor(contactsModel());
    const mutation = `mutation ($phone: Contacts_PhoneNumber!) {
      Contacts { setPhone(docId: "doc-1", input: { phone: $phone }) { state { global { phone } } } }
    }`;

    const accepted = await host.run(mutation, { phone: "+14155550123" });
    expect(messages(accepted)).toEqual([]);
    expect(host.state().phone).toBe("+14155550123");

    const refused = await host.run(mutation, { phone: "555-0123" });
    expect(messages(refused)).toEqual([
      expect.stringContaining("PhoneNumber cannot represent this value"),
    ]);
    expect(host.state().phone).toBe("+14155550123");
  });

  it("is bound for a scalar a later version of the family adds", () => {
    const version = (number: number, withPhone: boolean) =>
      contactsContext(number, {
        name: ph.String(),
        ...(withPhone && { phone: PhoneNumber() }),
      }).version({ modules: [] });
    const family = defineDocumentModelFamily({
      versions: [version(1, false), version(2, true)],
      upgradeManifest: {
        documentType: "test/contacts",
        latestVersion: 2,
        supportedVersions: [1, 2],
        upgrades: {
          v2: { toVersion: 2, upgradeReducer: (document) => document },
        },
      },
    });
    const { resolvers } = buildSubgraphSchemaModule(
      [family.at(1), family.at(2)] as unknown as DocumentModelModule[],
      {},
      EMPTY,
    );
    const scalar = (resolvers as Record<string, GraphQL.GraphQLScalarType>)
      .Contacts_PhoneNumber;
    expect(scalar.name).toBe("Contacts_PhoneNumber");
    expect(() => scalar.parseValue("555-0123")).toThrow(
      "PhoneNumber cannot represent this value",
    );
  });

  it("cannot shadow a host type of the same name", async () => {
    const Operation = defineScalar({
      ...phoneNumberDeclaration,
      name: "Operation",
    });
    const run = subgraphHost(lookupSubgraph(), [
      contactsModel(Operation as unknown as PhoneScalar),
    ]);
    const result = await run(`{ contact(phone: "+14155550123") { phone } }`);
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({ contact: { phone: "+14155550123" } });
  });
});

describe("a subgraph's package scalar on the host", () => {
  it("keeps the declaration the subgraph compiled", () => {
    const subgraphClass = lookupSubgraph();
    const subgraph = new subgraphClass({} as SubgraphArgs);
    const sdl = print(
      getDocumentModelTypeDefs([], subgraph.typeDefs as DocumentNode),
    );
    expect(sdl).toContain('"""An E.164 phone number."""\nscalar PhoneNumber');
    expect(subgraphClass.definition).toMatchObject({
      scalars: [
        {
          name: "PhoneNumber",
          implementation: "package#PhoneNumber",
          graphQLProfile: "declared-coercion-v1",
          definition: PhoneNumber.definition,
        },
      ],
    });
  });

  it("validates an argument by variable and by literal", async () => {
    const run = subgraphHost(lookupSubgraph());
    const byVariable = `query ($phone: PhoneNumber!) { contact(phone: $phone) { phone } }`;

    const served = await run(byVariable, { phone: "+14155550123" });
    expect(served.errors).toBeUndefined();
    expect(served.data).toEqual({ contact: { phone: "+14155550123" } });

    const variable = await run(byVariable, { phone: "555-0123" });
    expect(messages(variable)).toEqual([
      expect.stringContaining("PhoneNumber cannot represent this value"),
    ]);

    const literal = await run(`{ contact(phone: 14155550123) { phone } }`);
    expect(messages(literal)).toEqual([
      'Expected value of type "PhoneNumber!", found 14155550123; PhoneNumber cannot coerce a int literal.',
    ]);
  });

  it("keeps its own coercion beside a model's scalar of the same name", async () => {
    // The model's PhoneNumber accepts any string; the subgraph's does not.
    const LoosePhone = defineScalar({
      ...phoneNumberDeclaration,
      description: "A phone number in any format.",
      validator: z.string(),
      zodSource: "z.string()",
    });
    const run = subgraphHost(lookupSubgraph(), [contactsModel(LoosePhone)]);
    const refused = await run(`{ contact(phone: "555-0123") { phone } }`);
    expect(messages(refused)).toEqual([
      expect.stringContaining("PhoneNumber cannot represent this value"),
    ]);
    const served = await run(`{ contact(phone: "+14155550123") { phone } }`);
    expect(served.data).toEqual({ contact: { phone: "+14155550123" } });
  });

  it("reads a variable nested in an object literal", async () => {
    const Filter = defineScalar({
      name: "ContactFilter",
      description: "A contact filter.",
      representation: "json-object",
      validator: z.object({ phone: z.string().min(1) }),
      zodSource: "z.object({ phone: z.string().min(1) })",
    });
    const Search = defineSubgraph({
      name: "contacts-search",
      schemaKind: "typed",
      entries: ({ query }) => [
        query("find", {
          args: { filter: Filter({ required: true }) },
          returns: ph.String(),
          resolve: ({ args }) => (args.filter as { phone: string }).phone,
        }),
      ],
    });
    const run = subgraphHost(Search);
    const query = `query ($p: String!) { find(filter: { phone: $p }) }`;

    const nested = await run(query, { p: "+14155550123" });
    expect(nested.errors).toBeUndefined();
    expect(nested.data).toEqual({ find: "+14155550123" });

    // graphql-js rejects the uncoercible literal at execution with its own
    // message.
    const empty = await run(query, { p: "" });
    expect(messages(empty)).toEqual([
      'Argument "filter" has invalid value {phone: $p}.',
    ]);
  });
});

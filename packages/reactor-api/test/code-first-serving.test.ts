/**
 * The plan's authoring example, compiled from test/fixtures/code-first and
 * served by a real host: queries, auth through BaseSubgraph's helpers,
 * subscriptions over WebSocket, and package scalars.
 */
import { defineScalar } from "document-model/scalars";
import { ph } from "document-model";
import { gql } from "graphql-tag";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import type { SchemaBuilder } from "../src/graphql/code-first/schema-builder.js";
import { Subgraph } from "../src/graphql/code-first/subgraph.js";
import type { SubgraphClass } from "../src/graphql/types.js";
import { scalarExportsOf } from "../src/packages/scalar-exports.js";
import { buildScalarRegistry } from "../src/packages/scalar-registry.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";
import { InvoicesSubgraph } from "./fixtures/code-first/invoices.js";
import {
  type CodeFirstHost,
  type CodeFirstHostOptions,
  startCodeFirstHost,
} from "./utils/code-first-host.js";

let host: CodeFirstHost | undefined;
afterEach(async () => {
  await host?.close();
  host = undefined;
});

async function serve(
  subgraphs: SubgraphClass[],
  options: CodeFirstHostOptions = {},
) {
  host = await startCodeFirstHost(options);
  await host.applyPackage("@acme/invoices", subgraphs);
  return host;
}

const adminOnly = () =>
  createAuthorizationService({
    admins: ["0xowner"],
    defaultProtection: true,
    policy: AuthorizationPolicy.ADMIN_ONLY,
  });

describe("the authoring example", () => {
  it("reaches protected helpers through the subgraph parameter", async () => {
    const current = await serve([InvoicesSubgraph]);
    expect(
      await current.post("/graphql/invoices", "{ whoami }", {}, "0xowner"),
    ).toEqual({ data: { whoami: "0xowner" } });
    expect(await current.post("/graphql/invoices", "{ whoami }")).toEqual({
      data: { whoami: "anonymous" },
    });
  });
});

describe("auth through BaseSubgraph's assertCan helpers", () => {
  const approve = `mutation { approveInvoice(id: "inv-1") { id status } }`;

  it("denies any other caller, and runs the mutation only for one the policy lets write", async () => {
    const current = await serve([InvoicesSubgraph], {
      authorizationService: adminOnly(),
    });
    const denied = await current.post(
      "/graphql/invoices",
      approve,
      {},
      "0xother",
    );
    expect(denied.data).toBe(null);
    expect(denied.errors).toEqual([
      expect.objectContaining({
        message: "Forbidden: insufficient permissions",
        extensions: expect.objectContaining({ code: "FORBIDDEN" }),
      }),
    ]);
    expect(
      await current.post(
        "/graphql/invoices",
        "{ invoices { status } }",
        {},
        "0xowner",
      ),
    ).toEqual({ data: { invoices: [{ status: "DRAFT" }] } });
    expect(
      await current.post("/graphql/invoices", approve, {}, "0xowner"),
    ).toEqual({
      data: { approveInvoice: { id: "inv-1", status: "APPROVED" } },
    });
  });
});

describe("code-first subscriptions", () => {
  const approve = (current: CodeFirstHost) =>
    vi.waitFor(async () => {
      expect(
        await current.post(
          "/graphql/invoices",
          `mutation { approveInvoice(id: "inv-1") { status } }`,
        ),
      ).toEqual({ data: { approveInvoice: { status: "APPROVED" } } });
    });

  const changed = `subscription { invoiceChanged(id: "inv-1") { id status total } }`;
  const status = `subscription { invoiceStatus(id: "inv-1") }`;
  const changedEvents = [
    { data: { invoiceChanged: { id: "inv-1", status: "DRAFT", total: 42.5 } } },
    {
      data: {
        invoiceChanged: { id: "inv-1", status: "APPROVED", total: 42.5 },
      },
    },
  ];
  const statusEvents = [
    { data: { invoiceStatus: "DRAFT" } },
    { data: { invoiceStatus: "APPROVED" } },
  ];

  it("delivers events over the WebSocket endpoint", async () => {
    const current = await serve([InvoicesSubgraph]);
    const events = current.overWebSocket(changed, 2);
    const statuses = current.overWebSocket(status, 2);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await approve(current);
    expect(await events).toEqual(changedEvents);
    expect(await statuses).toEqual(statusEvents);
  });
});

describe("package scalars", () => {
  const Iban = defineScalar({
    name: "Iban",
    description: "International bank account number",
    schema: z.string().regex(/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/),
  });

  class IbanSubgraph extends Subgraph {
    static override readonly subgraphName = "iban";
    static override getSchema(schema: SchemaBuilder<IbanSubgraph>) {
      return [
        schema.query("checkIban", {
          args: { iban: ph.scalar(Iban, { required: true }) },
          type: ph.scalar(Iban, { required: true }),
          resolve: ({ args }) => args.iban,
        }),
      ];
    }
  }

  class IbanSdlSubgraph extends BaseSubgraph {
    override name = "iban";
    override typeDefs = gql`
      scalar Iban

      type Query {
        checkIban(iban: Iban!): Iban!
      }
    `;
    override resolvers = {
      Query: { checkIban: (_: unknown, args: { iban: string }) => args.iban },
    };
  }

  const registry = buildScalarRegistry(
    new Map([["@acme/invoices", scalarExportsOf({ Iban })]]),
  ).registry;

  it("serves a registered package scalar and validates with it", async () => {
    const current = await serve([IbanSubgraph], { scalars: registry });
    expect(
      await current.post(
        "/graphql/iban",
        '{ checkIban(iban: "DE89370400440532013000") }',
      ),
    ).toEqual({ data: { checkIban: "DE89370400440532013000" } });
    const refused = await current.post(
      "/graphql/iban",
      '{ checkIban(iban: "not-an-iban") }',
    );
    expect(refused).toEqual({
      errors: [
        expect.objectContaining({
          extensions: expect.objectContaining({
            code: "GRAPHQL_VALIDATION_FAILED",
          }),
        }),
      ],
    });
  });

  it("fails without the registered scalar exactly as an SDL subgraph does", async () => {
    const outcome = async (subgraph: SubgraphClass) => {
      const current = await serve([subgraph]);
      const result = {
        registered: current.manager.getSubgraphByName("iban") !== undefined,
        status: (
          await fetch(`${current.origin}/graphql/iban`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query: "{ __typename }" }),
          })
        ).status,
        supergraph: await current.post(
          "/graphql",
          '{ checkIban(iban: "DE89370400440532013000") }',
        ),
        errors: vi
          .mocked(current.logger.error)
          .mock.calls.map((call) => call.map(String)),
      };
      await current.close();
      host = undefined;
      return result;
    };
    const codeFirst = await outcome(IbanSubgraph);
    const sdl = await outcome(IbanSdlSubgraph);
    expect(codeFirst).toEqual(sdl);
    expect(codeFirst).toEqual({
      registered: true,
      status: 404,
      supergraph: { errors: [expect.any(Object)] },
      errors: [expect.any(Array), expect.any(Array)],
    });
  });
});

describe("type names that Object.prototype also has", () => {
  const Named = ph.object("constructor", { fields: { id: ph.String() } });
  const Either = ph.union("toString", { members: [Named] });

  class PrototypeNames extends Subgraph {
    static override readonly subgraphName = "prototype-names";
    static override getSchema(schema: SchemaBuilder<PrototypeNames>) {
      return [
        schema.query("item", {
          type: ph.ref(Named),
          resolve: () => ({ id: "1" }),
        }),
        schema.query("either", {
          type: ph.ref(Either),
          resolve: () => ({ id: "2" }),
        }),
        schema.field(Named, "computed", {
          type: ph.String(),
          resolve: () => "correct",
        }),
        schema.resolveType(Either, () => "constructor"),
      ];
    }
  }

  it("binds their resolvers as own types and leaves Object.prototype alone", async () => {
    const before = Object.getOwnPropertyNames(Object.prototype);
    const current = await serve([PrototypeNames]);
    expect(
      await current.post(
        "/graphql/prototype-names",
        "{ item { id computed } either { __typename ... on constructor { id } } }",
      ),
    ).toEqual({
      data: {
        item: { id: "1", computed: "correct" },
        either: { __typename: "constructor", id: "2" },
      },
    });
    const { resolvers } = current.manager.getSubgraphByName("prototype-names")!;
    expect(Object.keys(resolvers).sort()).toEqual([
      "Query",
      "constructor",
      "toString",
    ]);
    expect(Object.getOwnPropertyNames(Object.prototype)).toEqual(before);
    expect(Object.hasOwn(Object, "computed")).toBe(false);
    expect(Object.hasOwn(Object.prototype.toString, "__resolveType")).toBe(
      false,
    );
  });
});

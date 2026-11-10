import type { LocationFreeGraphQLDocumentNode } from "@powerhousedao/shared/document-model";
import { parse, type DocumentNode } from "graphql";
import { describe, expect, it } from "vitest";
import {
  compileSubgraph,
  createSubgraphEntryBuilders,
  ph,
  projectSubgraphGraphQL,
  type SubgraphEntry,
} from "../../../src/definition/index.js";
import {
  Card,
  Filter,
  type Info,
  Invoice,
  Node,
  Payment,
  type Request,
  type ShopSubgraph,
  Status,
  stream,
} from "./fixture.js";

const schema = createSubgraphEntryBuilders<ShopSubgraph, Request, Info>();
const none = () => null;

const plain = (document: LocationFreeGraphQLDocumentNode | DocumentNode) =>
  JSON.parse(JSON.stringify(document)) as unknown;

function projected(
  entries: readonly SubgraphEntry<ShopSubgraph, Request, Info>[],
): unknown {
  const { definition, diagnostics } = compileSubgraph({
    name: "shop",
    entries,
  });
  expect(diagnostics).toStrictEqual([]);
  if (definition === undefined) throw new Error("no definition");
  return plain(projectSubgraphGraphQL(definition));
}

const sdl = (source: string) => plain(parse(source, { noLocation: true }));

describe("projectSubgraphGraphQL", () => {
  it("projects every entry kind as the SDL an author would write", () => {
    expect(
      projected([
        schema.query("invoices", {
          description: "Invoices, newest first.",
          args: {
            filter: ph.ref(Filter),
            first: ph.Int({ defaultValue: 20, description: "Page size." }),
          },
          type: ph.list(ph.ref(Invoice, { required: true }), {
            required: true,
          }),
          resolve: () => [],
        }),
        schema.query("node", {
          args: { id: ph.OID({ required: true }) },
          type: ph.ref(Node),
          resolve: none,
        }),
        schema.mutation("pay", {
          args: { id: ph.OID({ required: true }) },
          type: ph.ref(Payment, { required: true }),
          deprecated: "Use settle.",
          resolve: () => ({ last4: "4242" }),
        }),
        schema.subscription("statusChanged", {
          type: ph.ref(Status, { required: true }),
          subscribe: () => stream({ statusChanged: "PAID" as const }),
        }),
        schema.field(Invoice, "total", {
          description: "The sum of the lines.",
          deprecated: "Use lines.",
          args: { currency: ph.Currency({ required: true }) },
          type: ph.Float({ required: true }),
          resolve: () => 0,
        }),
        schema.field(Card, "masked", {
          type: ph.String({ required: true }),
          resolve: ({ parent }) => parent.last4,
        }),
        schema.resolveType(Payment, () => "CardPayment"),
        schema.resolveType(Node, () => "Invoice"),
      ]),
    ).toStrictEqual(
      sdl(`
        scalar DateTime
        scalar Currency
        scalar OID
        scalar Iban

        type Query {
          "Invoices, newest first."
          invoices(filter: InvoiceFilter, "Page size." first: Int = 20): [Invoice!]!
          node(id: OID!): Node
        }

        type Mutation {
          pay(id: OID!): Payment! @deprecated(reason: "Use settle.")
        }

        type Subscription {
          statusChanged: InvoiceStatus!
        }

        input InvoiceFilter {
          status: InvoiceStatus = DRAFT
          after: DateTime
          limit: Int = 10
        }

        "Where an invoice is in its life."
        enum InvoiceStatus {
          DRAFT
          PAID
          VOID @deprecated(reason: "Use DRAFT.")
        }

        "A bill sent to a customer."
        type Invoice implements Node {
          id: OID!
          status: InvoiceStatus!
          lines: [InvoiceLine!]!
          iban: Iban
          note: String @deprecated(reason: "Use lines.")
          "The sum of the lines."
          total(currency: Currency!): Float! @deprecated(reason: "Use lines.")
        }

        interface Node {
          id: OID!
        }

        type InvoiceLine {
          label: String!
          amount: Float!
        }

        union Payment = CardPayment | TransferPayment

        type CardPayment {
          last4: String!
          masked: String!
        }

        type TransferPayment {
          iban: Iban!
        }
      `),
    );
  });

  it("emits a root type only when it has fields", () => {
    expect(
      projected([
        schema.mutation("ping", { type: ph.Boolean(), resolve: none }),
      ]),
    ).toStrictEqual(sdl("type Mutation { ping: Boolean }"));
  });
});

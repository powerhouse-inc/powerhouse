import { print, printSchema } from "graphql";
import { describe, expect, it } from "vitest";
import type { SubgraphClass } from "../src/graphql/types.js";
import {
  SHOP_SDL,
  ShopSdlSubgraph,
  ShopSubgraph,
} from "./fixtures/code-first/shop.js";
import { recordServedSchemas } from "./graphql/served-schemas.js";
import { startCodeFirstHost } from "./utils/code-first-host.js";

const OPERATIONS: readonly [string, Record<string, unknown>?][] = [
  [
    `{ invoices { id status issuedAt note total lines { label amount share(of: 350.5) } } }`,
  ],
  [
    `query ($filter: InvoiceFilter) { invoices(filter: $filter) { id total(vatRate: 0) } }`,
    { filter: { status: "PAID" } },
  ],
  [`{ invoices(filter: { minTotal: 300 }) { id } }`],
  [`{ invoice(id: "missing") { id } }`],
  [
    `{ node(id: "inv-2") { __typename id ... on Invoice { note total(vatRate: 0.1) } } }`,
  ],
  [
    `{ payments { __typename ... on CardPayment { last4 } ... on TransferPayment { reference } } }`,
  ],
  [
    `mutation { pay(id: "inv-1", method: TRANSFER) { __typename ... on TransferPayment { reference } } }`,
  ],
  [`{ invoice(id: "inv-1") { status } }`],
  [`{ invoices(filter: { status: LOST }) { id } }`],
  [`mutation { pay(id: "inv-1") { __typename } }`],
  [`{ invoice(id: "inv-2") { ... on Priced { total } } }`],
];

async function serveShop(subgraph: SubgraphClass) {
  const recorder = recordServedSchemas();
  const host = await startCodeFirstHost();
  try {
    await host.applyPackage("@acme/shop", [subgraph]);
    const served = await recorder.read(
      (request) => fetch(request),
      host.origin,
      ["shop"],
    );
    const results = [];
    for (const path of ["/graphql/shop", "/graphql"]) {
      for (const [query, variables] of OPERATIONS) {
        results.push(await host.post(path, query, variables));
      }
    }
    return {
      typeDefs: print(host.manager.getSubgraphByName("shop")!.typeDefs),
      service: await host.post("/graphql/shop", "{ _service { sdl } }"),
      subgraph: printSchema(served.subgraphs.get("shop")!),
      supergraph: printSchema(served.supergraph),
      resolvers: served.resolvers.shop,
      results,
    };
  } finally {
    await host.close();
    recorder.restore();
  }
}

describe("a code-first subgraph and its hand-written SDL twin", () => {
  it("serve the same schema, supergraph, resolver coordinates and results", async () => {
    const codeFirst = await serveShop(ShopSubgraph);
    const twin = await serveShop(ShopSdlSubgraph);

    expect(codeFirst).toEqual(twin);

    expect(codeFirst.typeDefs).toBe(SHOP_SDL);
    const scalarCodec = /\.(serialize|parseValue|parseLiteral)$/;
    expect(
      codeFirst.resolvers.filter((coordinate) => !scalarCodec.test(coordinate)),
    ).toEqual([
      "Invoice.total",
      "InvoiceLine.share",
      "Mutation.pay",
      "Node.__resolveType",
      "Payment.__resolveType",
      "Query._service",
      "Query.invoice",
      "Query.invoices",
      "Query.node",
      "Query.payments",
    ]);
    expect(codeFirst.supergraph).toContain(
      "type Invoice implements Node & Priced {\n  id: OID!\n  status: InvoiceStatus!\n  lines: [InvoiceLine!]!\n  issuedAt: DateTime\n  note: String\n  total(vatRate: Float): Float!\n}",
    );
    expect(codeFirst.results.slice(0, OPERATIONS.length)).toEqual([
      {
        data: {
          invoices: [
            {
              id: "inv-1",
              status: "DRAFT",
              issuedAt: "2026-01-02T03:04:05.000Z",
              note: null,
              total: 420.6,
              lines: [
                { label: "Design", amount: 100, share: 0.28530670470756064 },
                { label: "Build", amount: 250.5, share: 0.7146932952924394 },
              ],
            },
            {
              id: "inv-2",
              status: "PAID",
              issuedAt: null,
              note: "Paid by card",
              total: 48,
              lines: [
                {
                  label: "Support",
                  amount: 40,
                  share: 0.11412268188302425,
                },
              ],
            },
          ],
        },
      },
      { data: { invoices: [{ id: "inv-2", total: 40 }] } },
      { data: { invoices: [{ id: "inv-1" }] } },
      { data: { invoice: null } },
      {
        data: {
          node: {
            __typename: "Invoice",
            id: "inv-2",
            note: "Paid by card",
            total: 44,
          },
        },
      },
      {
        data: {
          payments: [
            { __typename: "CardPayment", last4: "4242" },
            { __typename: "TransferPayment", reference: "SEPA-77" },
          ],
        },
      },
      {
        data: {
          pay: { __typename: "TransferPayment", reference: "SEPA-77" },
        },
      },
      { data: { invoice: { status: "PAID" } } },
      {
        errors: [
          expect.objectContaining({
            message: 'Value "LOST" does not exist in "InvoiceStatus" enum.',
          }),
        ],
      },
      {
        errors: [
          expect.objectContaining({
            message:
              'Field "pay" argument "method" of type "PaymentMethod!" is required, but it was not provided.',
          }),
        ],
      },
      { data: { invoice: { total: 48 } } },
    ]);
  });
});

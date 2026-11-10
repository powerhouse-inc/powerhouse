import { ph } from "document-model";
import { gql } from "graphql-tag";
import { BaseSubgraph } from "../../../src/graphql/base-subgraph.js";
import { Subgraph } from "../../../src/graphql/code-first/subgraph.js";
import type { SchemaBuilder } from "../../../src/graphql/code-first/schema-builder.js";
import type { Context } from "../../../src/graphql/types.js";

/**
 * One subgraph written twice: `ShopSubgraph` in code first and
 * `ShopSdlSubgraph` as a hand-written SDL subgraph. Both read the same data
 * through the same helpers, so their schemas, resolver coordinates and
 * results must be identical.
 */

type LineRecord = { label: string; amount: number };
type InvoiceRecord = {
  id: string;
  status: "DRAFT" | "PAID";
  lines: LineRecord[];
  issuedAt: string | null;
  note: string | null;
};
type PaymentRecord =
  | { kind: "card"; last4: string }
  | { kind: "transfer"; reference: string };

const INVOICES: readonly InvoiceRecord[] = [
  {
    id: "inv-1",
    status: "DRAFT",
    lines: [
      { label: "Design", amount: 100 },
      { label: "Build", amount: 250.5 },
    ],
    issuedAt: "2026-01-02T03:04:05.000Z",
    note: null,
  },
  {
    id: "inv-2",
    status: "PAID",
    lines: [{ label: "Support", amount: 40 }],
    issuedAt: null,
    note: "Paid by card",
  },
];

const PAYMENTS: readonly PaymentRecord[] = [
  { kind: "card", last4: "4242" },
  { kind: "transfer", reference: "SEPA-77" },
];

type Filter = { status?: "DRAFT" | "PAID" | null; minTotal?: number | null };

/** The data and helpers both twins resolve through. */
export class ShopData {
  readonly paid = new Set<string>();

  invoices(filter: Filter | null | undefined): InvoiceRecord[] {
    return INVOICES.map((invoice) => this.withStatus(invoice)).filter(
      (invoice) =>
        (filter?.status == null || invoice.status === filter.status) &&
        (filter?.minTotal == null || total(invoice) >= filter.minTotal),
    );
  }

  invoice(id: string): InvoiceRecord | null {
    const found = INVOICES.find((invoice) => invoice.id === id);
    return found ? this.withStatus(found) : null;
  }

  payments(): readonly PaymentRecord[] {
    return PAYMENTS;
  }

  pay(id: string, method: "CARD" | "TRANSFER"): PaymentRecord {
    this.paid.add(id);
    return method === "CARD" ? PAYMENTS[0] : PAYMENTS[1];
  }

  private withStatus(invoice: InvoiceRecord): InvoiceRecord {
    return this.paid.has(invoice.id) ? { ...invoice, status: "PAID" } : invoice;
  }
}

export const total = (invoice: { lines: readonly LineRecord[] }) =>
  invoice.lines.reduce((sum, line) => sum + line.amount, 0);

export const withVat = (amount: number, rate: number | null | undefined) =>
  Math.round(amount * (1 + (rate ?? 0.2)) * 100) / 100;

export const paymentType = (payment: object) =>
  "last4" in payment ? "CardPayment" : "TransferPayment";

export const Status = ph.enum("InvoiceStatus", {
  description: "Where an invoice is in its life.",
  values: ["DRAFT", "PAID"],
});

export const PaymentMethod = ph.enum("PaymentMethod", {
  values: ["CARD", "TRANSFER"],
});

export const Node = ph.interface("Node", {
  fields: { id: ph.OID({ required: true }) },
});

/** `Invoice` satisfies `total` only through its computed field. */
export const Priced = ph.interface("Priced", {
  fields: { total: ph.Float({ required: true }) },
});

export const Line = ph.object("InvoiceLine", {
  fields: {
    label: ph.String({ required: true }),
    amount: ph.Float({ required: true }),
  },
});

export const Invoice = ph.object("Invoice", {
  description: "A bill sent to a customer.",
  implements: [Node, Priced],
  fields: {
    id: ph.OID({ required: true }),
    status: ph.ref(Status, { required: true }),
    lines: ph.list(ph.ref(Line, { required: true }), { required: true }),
    issuedAt: ph.DateTime(),
    note: ph.String(),
  },
});

export const Card = ph.object("CardPayment", {
  fields: { last4: ph.String({ required: true }) },
});

export const Transfer = ph.object("TransferPayment", {
  fields: { reference: ph.String({ required: true }) },
});

export const Payment = ph.union("Payment", { members: [Card, Transfer] });

export const InvoiceFilter = ph.input("InvoiceFilter", {
  fields: {
    status: ph.ref(Status),
    minTotal: ph.Float(),
  },
});

export class ShopSubgraph extends Subgraph {
  static override readonly subgraphName = "shop";

  readonly data = new ShopData();

  static override getSchema(schema: SchemaBuilder<ShopSubgraph>) {
    return [
      schema.query("invoices", {
        description: "Invoices matching the filter.",
        args: { filter: ph.ref(InvoiceFilter) },
        type: ph.list(ph.ref(Invoice, { required: true }), { required: true }),
        resolve: ({ args, subgraph }) => subgraph.data.invoices(args.filter),
      }),
      schema.query("invoice", {
        args: { id: ph.OID({ required: true }) },
        type: ph.ref(Invoice),
        resolve: ({ args, subgraph }) => subgraph.data.invoice(args.id),
      }),
      schema.query("node", {
        args: { id: ph.OID({ required: true }) },
        type: ph.ref(Node),
        resolve: ({ args, subgraph }) => subgraph.data.invoice(args.id),
      }),
      schema.query("payments", {
        type: ph.list(ph.ref(Payment, { required: true }), { required: true }),
        resolve: ({ subgraph }) => [...subgraph.data.payments()],
      }),
      schema.mutation("pay", {
        args: {
          id: ph.OID({ required: true }),
          method: ph.ref(PaymentMethod, { required: true }),
        },
        type: ph.ref(Payment, { required: true }),
        resolve: ({ args, subgraph }) =>
          subgraph.data.pay(args.id, args.method),
      }),
      schema.field(Invoice, "total", {
        args: { vatRate: ph.Float() },
        type: ph.Float({ required: true }),
        resolve: ({ parent, args }) => withVat(total(parent), args.vatRate),
      }),
      schema.field(Line, "share", {
        description: "This line's part of its invoice, from 0 to 1.",
        args: { of: ph.Float({ required: true }) },
        type: ph.Float({ required: true }),
        resolve: ({ parent, args }) => parent.amount / args.of,
      }),
      schema.resolveType(Payment, ({ value }) => paymentType(value)),
      schema.resolveType(Node, () => "Invoice"),
    ];
  }
}

/** `ShopSubgraph`'s schema exactly as graphql's printer prints it. */
export const SHOP_SDL = `scalar DateTime

scalar OID

type Query {
  "Invoices matching the filter."
  invoices(filter: InvoiceFilter): [Invoice!]!
  invoice(id: OID!): Invoice
  node(id: OID!): Node
  payments: [Payment!]!
}

type Mutation {
  pay(id: OID!, method: PaymentMethod!): Payment!
}

input InvoiceFilter {
  status: InvoiceStatus
  minTotal: Float
}

"Where an invoice is in its life."
enum InvoiceStatus {
  DRAFT
  PAID
}

"A bill sent to a customer."
type Invoice implements Node & Priced {
  id: OID!
  status: InvoiceStatus!
  lines: [InvoiceLine!]!
  issuedAt: DateTime
  note: String
  total(vatRate: Float): Float!
}

interface Node {
  id: OID!
}

interface Priced {
  total: Float!
}

type InvoiceLine {
  label: String!
  amount: Float!
  "This line's part of its invoice, from 0 to 1."
  share(of: Float!): Float!
}

union Payment = CardPayment | TransferPayment

type CardPayment {
  last4: String!
}

type TransferPayment {
  reference: String!
}

enum PaymentMethod {
  CARD
  TRANSFER
}`;

/** The same subgraph, hand-written in SDL. */
export class ShopSdlSubgraph extends BaseSubgraph {
  override name = "shop";
  readonly data = new ShopData();
  override typeDefs = gql(SHOP_SDL);
  override resolvers = {
    Query: {
      invoices: (_: unknown, args: { filter?: Filter | null }) =>
        this.data.invoices(args.filter),
      invoice: (_: unknown, args: { id: string }) => this.data.invoice(args.id),
      node: (_: unknown, args: { id: string }) => this.data.invoice(args.id),
      payments: () => [...this.data.payments()],
    },
    Mutation: {
      pay: (_: unknown, args: { id: string; method: "CARD" | "TRANSFER" }) =>
        this.data.pay(args.id, args.method),
    },
    Invoice: {
      total: (parent: InvoiceRecord, args: { vatRate?: number | null }) =>
        withVat(total(parent), args.vatRate),
    },
    InvoiceLine: {
      share: (parent: LineRecord, args: { of: number }) =>
        parent.amount / args.of,
    },
    Payment: {
      __resolveType: (value: PaymentRecord) => paymentType(value),
    },
    Node: {
      __resolveType: () => "Invoice",
    },
  };
}

/** A request whose caller is `address`, as the host builds it. */
export const callerContext = (address?: string) =>
  ({
    headers: {},
    db: null,
    user: address
      ? { address, chainId: 1, networkId: "eip155", appKey: "" }
      : undefined,
  }) as unknown as Context;

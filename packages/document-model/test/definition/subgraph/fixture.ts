import { z } from "zod";
import { ph } from "../../../src/definition/index.js";
import { defineScalar } from "../../../src/scalars/define-scalar.js";

export type Request = { readonly user: string | null };
export type Info = { readonly path: string };

export class ShopSubgraph {}

export const Iban = defineScalar({ name: "Iban", schema: z.string() });

export const Status = ph.enum("InvoiceStatus", {
  description: "Where an invoice is in its life.",
  values: ["DRAFT", "PAID", { name: "VOID", deprecated: "Use DRAFT." }],
});

export const Node = ph.interface("Node", {
  fields: { id: ph.OID({ required: true }) },
});

export const Line = ph.object("InvoiceLine", {
  fields: {
    label: ph.String({ required: true }),
    amount: ph.Float({ required: true }),
  },
});

export const Invoice = ph.object("Invoice", {
  description: "A bill sent to a customer.",
  implements: [Node],
  fields: {
    id: ph.OID({ required: true }),
    status: ph.ref(Status, { required: true }),
    lines: ph.list(ph.ref(Line, { required: true }), { required: true }),
    iban: ph.scalar(Iban),
    note: ph.String({ deprecated: "Use lines." }),
  },
});

export const Card = ph.object("CardPayment", {
  fields: { last4: ph.String({ required: true }) },
});

const Transfer = ph.object("TransferPayment", {
  fields: { iban: ph.scalar(Iban, { required: true }) },
});

export const Payment = ph.union("Payment", { members: [Card, Transfer] });

export const Filter = ph.input("InvoiceFilter", {
  fields: {
    status: ph.ref(Status, { defaultValue: "DRAFT" }),
    after: ph.DateTime(),
    limit: ph.Int({ defaultValue: 10 }),
  },
});

export async function* stream<T>(...values: readonly T[]): AsyncGenerator<T> {
  for (const value of values) yield await Promise.resolve(value);
}

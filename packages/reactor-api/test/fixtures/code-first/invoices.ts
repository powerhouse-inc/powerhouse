// The authoring example of the code-first subgraphs plan (section 5.2),
// written as a package author would, against the package entry.
import { ph } from "document-model";
import { type SchemaBuilder, Subgraph } from "../../../index.mjs";
import type { Context } from "../../../index.mjs";
import {
  Invoice,
  InvoiceFilter,
  InvoiceStatus,
  Payment,
} from "./invoices-schema.js";

type InvoiceRecord = {
  id: string;
  owner: string;
  status: "DRAFT" | "APPROVED";
  amounts: number[];
  payments: ({ last4: string } | { reference: string })[];
};

export class InvoicesSubgraph extends Subgraph {
  static override readonly subgraphName = "invoices";

  readonly #invoices = new Map<string, InvoiceRecord>();
  readonly #changes = new Set<() => void>();
  setUp = false;

  static override getSchema(schema: SchemaBuilder<InvoicesSubgraph>) {
    return [
      schema.query("invoices", {
        args: { filter: ph.ref(InvoiceFilter) },
        type: ph.list(ph.ref(Invoice, { required: true }), { required: true }),
        resolve: ({ args, request, subgraph }) =>
          subgraph.listInvoices(args.filter, request),
      }),
      schema.query("whoami", {
        type: ph.String({ required: true }),
        resolve: ({ request, subgraph }) =>
          subgraph.viewSubject(request).address ?? "anonymous",
      }),
      schema.mutation("approveInvoice", {
        args: { id: ph.OID({ required: true }) },
        type: ph.ref(Invoice, { required: true }),
        resolve: async ({ args, request, subgraph }) => {
          await subgraph.assertCanWrite(args.id, request);
          return subgraph.#approve(args.id);
        },
      }),
      schema.subscription("invoiceChanged", {
        args: { id: ph.OID({ required: true }) },
        type: ph.ref(Invoice, { required: true }),
        subscribe: ({ args, subgraph }) => subgraph.#watch(args.id),
      }),
      schema.subscription("invoiceStatus", {
        args: { id: ph.OID({ required: true }) },
        type: ph.ref(InvoiceStatus, { required: true }),
        subscribe: ({ args, subgraph }) => subgraph.#watchRecords(args.id),
        resolve: ({ parent }) => parent.status,
      }),
      schema.field(Invoice, "total", {
        type: ph.Float({ required: true }),
        resolve: ({ parent }) =>
          parent.amounts.reduce((sum, amount) => sum + amount, 0),
      }),
      schema.resolveType(Payment, ({ value }) =>
        "last4" in value ? "Card" : "Transfer",
      ),
    ];
  }

  override async onSetup() {
    await Promise.resolve();
    this.#invoices.set("inv-1", {
      id: "inv-1",
      owner: "0xowner",
      status: "DRAFT",
      amounts: [10, 32.5],
      payments: [{ last4: "4242" }, { reference: "SEPA-1" }],
    });
    this.setUp = true;
  }

  listInvoices(
    filter: { status?: "DRAFT" | "APPROVED" | null } | null | undefined,
    request: Context,
  ): InvoiceRecord[] {
    const caller = this.viewSubject(request).address;
    return [...this.#invoices.values()].filter(
      (invoice) =>
        invoice.owner === caller &&
        (filter?.status == null || invoice.status === filter.status),
    );
  }

  #approve(id: string): InvoiceRecord {
    const invoice = this.#invoices.get(id);
    if (!invoice) throw new Error(`No invoice ${id}`);
    invoice.status = "APPROVED";
    for (const notify of this.#changes) notify();
    return invoice;
  }

  async *#watchRecords(id: string): AsyncGenerator<InvoiceRecord> {
    let changed = Promise.resolve();
    let notify = () => {};
    const listener = () => notify();
    this.#changes.add(listener);
    try {
      for (;;) {
        await changed;
        changed = new Promise<void>((resolve) => (notify = resolve));
        const invoice = this.#invoices.get(id);
        if (invoice) yield { ...invoice };
      }
    } finally {
      this.#changes.delete(listener);
    }
  }

  async *#watch(id: string) {
    for await (const invoice of this.#watchRecords(id)) {
      yield { invoiceChanged: invoice };
    }
  }
}

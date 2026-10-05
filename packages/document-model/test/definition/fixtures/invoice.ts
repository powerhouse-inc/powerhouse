import { ph } from "../../../src/definition/field.js";
import { defineDocumentModel } from "../../../src/definition/model.js";
import type { AnyTypeDescriptor } from "../../../src/definition/types.js";

/**
 * One authored model reused by the wave C tests: a diamond reference
 * (`Contact` from both the state root and a line item), a cycle (a line item
 * parent), an auxiliary type no root reaches, both scopes, and two modules.
 */

export const InvoiceStatus = ph.enum("InvoiceStatus", {
  description: "Where an invoice is in its lifecycle.",
  values: [
    "DRAFT",
    { name: "ISSUED", description: "Sent to the counterparty." },
    "PAID",
    { name: "VOID", deprecated: "Use CANCELLED." },
  ],
});

export const Contact = ph.object("Contact", {
  fields: {
    name: ph.String({ required: true }),
    email: ph.EmailAddress(),
  },
});

export const InvoiceLineItem = ph.object("InvoiceLineItem", {
  fields: {
    id: ph.OID({ required: true }),
    description: ph.String({ required: true }),
    quantity: ph.Int({ required: true }),
    unitPrice: ph.Money({ required: true }),
    seller: ph.ref(Contact),
    // A self-referential descriptor needs an explicit return type on its
    // thunk, exactly as a recursive Zod schema needs one: without it
    // TypeScript cannot infer the object it is being declared inside.
    parent: ph.ref((): AnyTypeDescriptor => InvoiceLineItem),
  },
});

export const ArchivedInvoice = ph.object("ArchivedInvoice", {
  fields: { number: ph.String({ required: true }) },
});

export const InvoiceState = ph.object("InvoiceState", {
  fields: {
    issuer: ph.PHID({ required: true }),
    number: ph.String({ required: true }),
    status: ph.ref(InvoiceStatus, { required: true }),
    currency: ph.Currency({ required: true }),
    counterparty: ph.ref(Contact),
    lineItems: ph.list(ph.ref(InvoiceLineItem, { required: true }), {
      required: true,
    }),
    issuedAt: ph.DateTime(),
    total: ph.Money({ required: true }),
  },
});

export const InvoiceLocalState = ph.object("InvoiceLocalState", {
  fields: { draftNote: ph.String() },
});

/**
 * A reusable named input. It is reached first from an operation — traversal
 * stage 4 — and it references the enum the global state root already emitted,
 * so the overlap between the two stages is observable.
 */
export const InvoicePatch = ph.input("InvoicePatch", {
  fields: {
    number: ph.String(),
    status: ph.ref(InvoiceStatus),
  },
});

export const invoice = defineDocumentModel({
  id: "powerhouse/invoice",
  name: "Invoice",
  description: "An invoice issued to a counterparty.",
  extension: ".phinv",
  version: 1,
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
  changeLog: [],
  specifications: {
    auxiliaryTypes: [ArchivedInvoice],
    global: {
      schema: InvoiceState,
      initialValue: {
        issuer: "",
        number: "",
        status: "DRAFT",
        currency: "USD",
        counterparty: null,
        lineItems: [],
        issuedAt: null,
        total: 0,
      },
      examples: [
        {
          key: "empty",
          value:
            '{"issuer":"","number":"","status":"DRAFT","currency":"USD","counterparty":null,"lineItems":[],"issuedAt":null,"total":0}',
        },
      ],
    },
    local: {
      schema: InvoiceLocalState,
      initialValue: { draftNote: null },
      examples: [{ key: "note", value: '{"draftNote":"check the total"}' }],
    },
  },
});

export const lineItems = invoice.module("lineItems", {
  description: "Add and remove invoice line items.",
  operations: ({ global }) => ({
    addLineItem: global({
      input: ph.input({
        fields: {
          id: ph.OID({ required: true }),
          description: ph.String({ required: true }),
          quantity: ph.Int({ required: true }),
          unitPrice: ph.Money({ required: true }),
        },
      }),
      errors: {
        InvoiceAlreadyIssued: {
          code: "INVOICE_ALREADY_ISSUED",
          description: "The invoice has left DRAFT and cannot be edited.",
          template: "",
        },
      },
      examples: [
        {
          key: "item",
          value:
            '{"id":"item-1","description":"Consulting","quantity":1,"unitPrice":100}',
        },
      ],
      reduce(state, input, ctx) {
        if (state.status !== "DRAFT") {
          throw new ctx.errors.InvoiceAlreadyIssued(
            `Invoice ${state.number} has already been issued`,
          );
        }
        state.lineItems.push({
          id: input.id,
          description: input.description,
          quantity: input.quantity,
          unitPrice: input.unitPrice,
          seller: null,
          parent: null,
        });
        state.total = state.lineItems.reduce(
          (sum, item) => sum + item.quantity * item.unitPrice,
          0,
        );
      },
    }),
    removeLineItem: global({
      input: ph.input({ fields: { id: ph.OID({ required: true }) } }),
      errors: {
        InvoiceAlreadyIssued: {
          description: "A different occurrence of the same reducer key.",
        },
      },
      reduce(state, input) {
        state.lineItems = state.lineItems.filter(
          (item) => item.id !== input.id,
        );
      },
    }),
  }),
});

export const lifecycle = invoice.module("lifecycle", {
  operations: ({ global, local }) => ({
    issue: global({
      input: ph.input({
        fields: { issuedAt: ph.DateTime({ required: true }) },
      }),
      template: "",
      reduce(state, input) {
        state.status = "ISSUED";
        state.issuedAt = input.issuedAt;
      },
    }),
    clear: global({
      input: ph.input({ fields: {} }),
      reduce(state) {
        state.lineItems = [];
        state.total = 0;
      },
    }),
    patch: global({
      input: ph.input({
        fields: { patch: ph.ref(InvoicePatch, { required: true }) },
      }),
      reduce(state, input) {
        state.number = input.patch.number ?? state.number;
        if (input.patch.status != null) state.status = input.patch.status;
      },
    }),
    setDraftNote: local({
      input: ph.input({ fields: { note: ph.String() } }),
      reduce(state, input) {
        state.draftNote = input.note ?? null;
      },
    }),
  }),
});

export const Invoice = invoice.finalize({ modules: [lineItems, lifecycle] });

import { ph } from "document-model";

export const InvoiceStatus = ph.enum("InvoiceStatus", {
  values: ["DRAFT", "APPROVED"],
});

export const Card = ph.object("Card", {
  fields: { last4: ph.String({ required: true }) },
});

export const Transfer = ph.object("Transfer", {
  fields: { reference: ph.String({ required: true }) },
});

export const Payment = ph.union("Payment", { members: [Card, Transfer] });

export const Invoice = ph.object("Invoice", {
  fields: {
    id: ph.OID({ required: true }),
    owner: ph.String({ required: true }),
    status: ph.ref(InvoiceStatus, { required: true }),
    amounts: ph.list(ph.Float({ required: true }), { required: true }),
    payments: ph.list(ph.ref(Payment, { required: true }), { required: true }),
  },
});

export const InvoiceFilter = ph.input("InvoiceFilter", {
  fields: { status: ph.ref(InvoiceStatus) },
});

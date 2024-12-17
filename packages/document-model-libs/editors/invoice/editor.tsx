/* eslint-disable react/jsx-max-depth */
/* eslint-disable react/jsx-no-bind */
import { useMemo } from "react";
import { EditorProps } from "document-model/document";
import {
  InvoiceState,
  InvoiceAction,
  InvoiceLineItem,
  InvoiceLocalState,
  actions,
  EditIssuerInput,
  EditIssuerBankInput,
  EditPayerInput,
  DeleteLineItemInput,
  Status,
  EditStatusInput,
} from "../../document-models/invoice";

import { DateTimeLocalInput } from "./dateTimeLocalInput";
import { LegalEntityForm } from "./legalEntity";
import { LineItemsTable } from "./lineItems";

export default function Editor(
  props: EditorProps<InvoiceState, InvoiceAction, InvoiceLocalState>,
) {
  const { document, dispatch } = props;
  const state = document.state.global;

  const itemsTotalTaxExcl = useMemo(() => {
    return state.lineItems.reduce((total, lineItem) => {
      return total + lineItem.quantity * lineItem.unitPriceTaxExcl;
    }, 0.0);
  }, [state.lineItems]);

  const itemsTotalTaxIncl = useMemo(() => {
    return state.lineItems.reduce((total, lineItem) => {
      return total + lineItem.quantity * lineItem.unitPriceTaxIncl;
    }, 0.0);
  }, [state.lineItems]);

  function handleAddItem(newItem: InvoiceLineItem) {
    dispatch(actions.addLineItem(newItem));
  }

  function handleUpdateItem(updatedItem: InvoiceLineItem) {
    dispatch(actions.editLineItem(updatedItem));
  }

  function handleDeleteItem(input: DeleteLineItemInput) {
    dispatch(actions.deleteLineItem(input));
  }

  function handleUpdateDateIssued(e: React.ChangeEvent<HTMLInputElement>) {
    dispatch(
      actions.editInvoice({
        dateIssued: e.target.value,
      }),
    );
  }

  function handleUpdateDateDue(e: React.ChangeEvent<HTMLInputElement>) {
    dispatch(
      actions.editInvoice({
        dateDue: e.target.value,
      }),
    );
  }

  function handleUpdateInvoiceNo(e: React.ChangeEvent<HTMLInputElement>) {
    dispatch(
      actions.editInvoice({
        invoiceNo: e.target.value,
      }),
    );
  }

  function handleUpdateIssuerInfo(input: EditIssuerInput) {
    dispatch(actions.editIssuer(input));
  }

  function handleUpdateIssuerBank(input: EditIssuerBankInput) {
    dispatch(actions.editIssuerBank(input));
  }

  function handleUpdatePayerInfo(input: EditPayerInput) {
    dispatch(actions.editPayer(input));
  }

  function handleUpdateStatus(event: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = event.target.value;
    if (isValidStatus(newStatus)) {
      const input: EditStatusInput = {
        status: newStatus,
      };
      dispatch(actions.editStatus(input));
    }
  }

  function isValidStatus(status: string): status is Status {
    return ["DRAFT", "ISSUED", "ACCEPTED", "REJECTED", "PAID"].includes(status);
  }

  const getStatusStyle = (status: Status) => {
    const baseStyle = "px-4 py-2 rounded-full font-semibold text-sm";
    switch (status) {
      case "DRAFT":
        return `${baseStyle} bg-gray-200 text-gray-800`;
      case "ISSUED":
        return `${baseStyle} bg-blue-100 text-blue-800`;
      case "ACCEPTED":
        return `${baseStyle} bg-green-100 text-green-800`;
      case "REJECTED":
        return `${baseStyle} bg-red-100 text-red-800`;
      case "PAID":
        return `${baseStyle} bg-purple-100 text-purple-800`;
      default:
        return baseStyle;
    }
  };

  const STATUS_OPTIONS: Status[] = [
    "DRAFT",
    "ISSUED",
    "ACCEPTED",
    "REJECTED",
    "PAID",
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Invoice</h1>
          <div className="flex items-center">
            <label className="mr-2">Invoice No:</label>
            <input
              className="border rounded-md px-3 py-2"
              onChange={handleUpdateInvoiceNo}
              placeholder={new Date()
                .toISOString()
                .substring(0, 10)
                .replaceAll("-", "")}
              type="text"
              value={state.invoiceNo || ""}
            />
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <span className={getStatusStyle(state.status)}>{state.status}</span>
          <select
            className="border rounded-md px-3 py-2 bg-white"
            onChange={handleUpdateStatus}
            value={state.status}
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-between mb-8">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Issuer</h3>
          <label className="mr-2">Issue Date:</label>
          <DateTimeLocalInput
            className="w-64 ml-2"
            defaultValue={state.dateIssued}
            inputType="date"
            onChange={handleUpdateDateIssued}
          />
          <LegalEntityForm
            legalEntity={state.issuer}
            onChangeBank={handleUpdateIssuerBank}
            onChangeInfo={handleUpdateIssuerInfo}
          />
        </div>

        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Payer</h3>
          <label className="mr-2">Due Date:</label>
          <DateTimeLocalInput
            className="w-64 ml-2"
            defaultValue={state.dateDue}
            inputType="date"
            onChange={handleUpdateDateDue}
          />
          <LegalEntityForm
            bankDisabled
            legalEntity={state.payer}
            onChangeInfo={handleUpdatePayerInfo}
          />
        </div>
      </div>

      <LineItemsTable
        currency="USD"
        lineItems={state.lineItems}
        onAddItem={handleAddItem}
        onDeleteItem={handleDeleteItem}
        onUpdateItem={handleUpdateItem}
      />

      {/* Totals */}
      <div className="text-right font-bold space-y-1">
        <p>Total (excl. tax): {itemsTotalTaxExcl.toFixed(2)}</p>
        <p>Total (incl. tax): {itemsTotalTaxIncl.toFixed(2)}</p>
      </div>
    </div>
  );
}

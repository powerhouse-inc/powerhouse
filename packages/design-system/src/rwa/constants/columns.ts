import { type TableColumn, type TableName } from "#rwa";

export type ColumnsByTableName = {
  [K in TableName]: TableColumn[];
};

export const columnsByTableName: ColumnsByTableName = {
  ASSET: [
    { key: "name" as const, label: "Name", allowSorting: true },
    {
      key: "purchaseDate" as const,
      label: "Purchase Date",
      allowSorting: true,
    },
    {
      key: "maturity" as const,
      label: "Maturity",
      allowSorting: true,
      displayTime: false,
    },
    {
      key: "notional" as const,
      label: "Notional",
      allowSorting: true,
      isNumberColumn: true,
    },
    {
      key: "currentValue" as const,
      label: "Current Value",
      allowSorting: true,
      isNumberColumn: true,
    },
    {
      key: "purchasePrice" as const,
      label: "Purchase Price",
      allowSorting: true,
      isNumberColumn: true,
      decimalScale: 6,
    },
    {
      key: "purchaseProceeds" as const,
      label: "Purchase Proceeds",
      allowSorting: true,
      isNumberColumn: true,
    },
    {
      key: "salesProceeds" as const,
      label: "Sales Proceeds",
      allowSorting: true,
      isNumberColumn: true,
    },
    {
      key: "totalDiscount" as const,
      label: "Total Discount",
      allowSorting: true,
      isNumberColumn: true,
    },
    {
      key: "realizedSurplus" as const,
      label: "Realized Surplus",
      allowSorting: true,
      isNumberColumn: true,
    },
  ],
  TRANSACTION: [
    {
      key: "typeLabel" as const,
      label: "Type",
      allowSorting: true,
    },
    {
      key: "entryTime" as const,
      label: "Entry Time",
      allowSorting: true,
    },
    {
      key: "asset" as const,
      label: "Asset",
      allowSorting: true,
    },
    {
      key: "quantity" as const,
      label: "Quantity",
      allowSorting: true,
      isNumberColumn: true,
    },
    {
      key: "cashAmount" as const,
      label: "Cash Amount ($)",
      allowSorting: true,
      isNumberColumn: true,
    },
    {
      key: "totalFees" as const,
      label: "Total Fees ($)",
      allowSorting: true,
      isNumberColumn: true,
    },
    {
      key: "cashBalanceChange" as const,
      label: "Cash Balance Change ($)",
      allowSorting: true,
      isNumberColumn: true,
    },
  ],
  FIXED_INCOME_TYPE: [
    { key: "name" as const, label: "Name", allowSorting: true },
  ],
  SPV: [{ key: "name" as const, label: "Name", allowSorting: true }],
  SERVICE_PROVIDER_FEE_TYPE: [
    { key: "name" as const, label: "Name", allowSorting: true },
    { key: "feeType" as const, label: "Fee Type", allowSorting: true },
    {
      key: "accountName" as const,
      label: "Account Name",
      allowSorting: true,
    },
    {
      key: "accountReference" as const,
      label: "Account Reference",
      allowSorting: true,
    },
  ],
  ACCOUNT: [
    { key: "label" as const, label: "Label", allowSorting: true },
    { key: "reference" as const, label: "Reference", allowSorting: true },
  ],
} as const;

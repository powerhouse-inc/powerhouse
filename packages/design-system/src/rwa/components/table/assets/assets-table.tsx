import {
  RWATableCell,
  RWATableRow,
  type TableColumn,
  TableWithForm,
  handleTableDatum,
  sumTotalForProperty,
  tableNames,
  useEditorContext,
} from "#rwa";
import { Fragment, useCallback, useMemo } from "react";

export function AssetsTable() {
  const tableName = tableNames.ASSET;
  const { selectedTableItem, fixedIncomes, cashAsset } = useEditorContext();

  const cashAssetFormattedAsTableItem = useMemo(
    () => ({
      id: "special-first-row",
      name: "Cash $USD",
      fixedIncomeTypeId: "--",
      spvId: "--",
      maturity: "--",
      ISIN: "--",
      CUSIP: "--",
      coupon: null,
      notional: cashAsset.balance ?? 0,
      purchaseDate: "--",
      purchasePrice: "--",
      purchaseProceeds: "--",
      salesProceeds: "--",
      totalDiscount: "--",
      realizedSurplus: "--",
      currentValue: "--",
    }),
    [cashAsset.balance],
  );

  const totalPurchaseProceeds = sumTotalForProperty(
    fixedIncomes,
    "purchaseProceeds",
  );
  const totalSalesProceeds = sumTotalForProperty(fixedIncomes, "salesProceeds");
  const totalTotalDiscount = sumTotalForProperty(fixedIncomes, "totalDiscount");
  const totalRealizedSurplus = sumTotalForProperty(
    fixedIncomes,
    "realizedSurplus",
  );

  const specialFirstRow = useCallback(
    (c: TableColumn[]) => (
      <RWATableRow>
        {c.map((column) => (
          <Fragment key={column.key}>
            {column.key === "name" && <RWATableCell>Cash $USD</RWATableCell>}
            {column.key === "notional" && (
              <RWATableCell className="text-right" key={column.key}>
                {handleTableDatum(cashAssetFormattedAsTableItem[column.key])}
              </RWATableCell>
            )}
            {column.key !== "name" && column.key !== "notional" && (
              <RWATableCell />
            )}
          </Fragment>
        ))}
      </RWATableRow>
    ),
    [cashAssetFormattedAsTableItem],
  );

  const specialLastRow = useCallback(
    (c: TableColumn[]) => (
      <RWATableRow className="sticky bottom-0">
        {c.map((column) => (
          <Fragment key={column.key}>
            {column.key === "name" && <RWATableCell>Totals</RWATableCell>}
            {column.key === "purchaseProceeds" && (
              <RWATableCell className="text-right" key={column.key}>
                {handleTableDatum(totalPurchaseProceeds)}
              </RWATableCell>
            )}
            {column.key === "salesProceeds" && (
              <RWATableCell className="text-right" key={column.key}>
                {handleTableDatum(totalSalesProceeds)}
              </RWATableCell>
            )}
            {column.key === "totalDiscount" && (
              <RWATableCell className="text-right" key={column.key}>
                {handleTableDatum(totalTotalDiscount)}
              </RWATableCell>
            )}
            {column.key === "realizedSurplus" && (
              <RWATableCell className="text-right" key={column.key}>
                {handleTableDatum(totalRealizedSurplus)}
              </RWATableCell>
            )}
            {column.key !== "name" &&
              column.key !== "purchaseProceeds" &&
              column.key !== "salesProceeds" &&
              column.key !== "totalDiscount" &&
              column.key !== "realizedSurplus" && <RWATableCell />}
          </Fragment>
        ))}
      </RWATableRow>
    ),
    [
      selectedTableItem,
      totalPurchaseProceeds,
      totalRealizedSurplus,
      totalSalesProceeds,
      totalTotalDiscount,
    ],
  );

  return (
    <TableWithForm
      specialFirstRow={specialFirstRow}
      specialLastRow={specialLastRow}
      tableName={tableName}
    />
  );
}

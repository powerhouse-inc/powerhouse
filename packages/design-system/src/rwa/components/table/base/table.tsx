import { useCallback, useRef } from "react";
import { Fragment } from "react/jsx-runtime";
import { Icon } from "../../../../powerhouse/components/icon/icon.js";
import { columnsByTableName } from "../../../constants/columns.js";
import { tableLabels } from "../../../constants/names.js";
import { defaultColumnCountByTableWidth } from "../../../constants/table.js";
import { useEditorContext } from "../../../context/editor-context.js";
import { useColumnPriority } from "../../../hooks/useColumnPriority.js";
import { useTableHeight } from "../../../hooks/useTableHeight.js";
import type {
  SortDirection,
  TableColumn,
  TableItemType,
  TableName,
  TableProps,
} from "../../../types.js";
import { handleTableDatum } from "../../../utils/table.js";
import { TableBase } from "./table-base.js";
import { ItemNumberCell, MoreDetailsCell, RWATableCell } from "./table-cell.js";
import { RWATableRow } from "./table-row.js";

export function Table(props: TableProps) {
  const {
    tableName,
    tableData,
    columnCountByTableWidth = defaultColumnCountByTableWidth,
    sortHandler,
    specialFirstRow,
    specialLastRow,
  } = props;

  const columns = columnsByTableName[tableName];

  const {
    operation,
    selectedTableItem,
    isAllowedToCreateDocuments,
    createItem,
  } = useEditorContext();

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const headerRef = useRef<HTMLTableSectionElement>(null);

  const columnsToShow = useColumnPriority({
    columns,
    columnCountByTableWidth,
    tableContainerRef,
  });

  const maxHeight = useTableHeight({
    tableContainerRef,
    rowRefs,
    headerRef,
    selectedItemNumber: selectedTableItem?.itemNumber,
    hasSpecialLastRow: !!specialLastRow,
  });

  const tableLabel = tableLabels[tableName];

  const onCreateItemClick = useCallback(() => {
    createItem(tableName);
  }, [createItem, tableName]);

  const renderRow = useCallback(
    (
      tableItem: TableItemType<TableName>,
      columns: TableColumn[],
      index: number,
    ) => {
      const isSelected = selectedTableItem?.id === tableItem.id;

      return (
        <RWATableRow
          key={tableItem.id}
          /* @ts-expect-error - Ref is not typed */
          ref={(el) => (rowRefs.current[index] = el)}
        >
          {columns.map((column) => (
            <Fragment key={column.key}>
              {column.key === "itemNumber" && (
                <ItemNumberCell itemNumber={tableItem.itemNumber} />
              )}
              {column.key !== "itemNumber" && column.key !== "moreDetails" && (
                <RWATableCell
                  className={column.isNumberColumn ? "text-right" : ""}
                  key={column.key}
                >
                  {handleTableDatum(
                    tableItem[column.key as keyof TableItemType<TableName>],
                    column.decimalScale,
                    column.displayTime,
                  )}
                </RWATableCell>
              )}
              {column.key === "moreDetails" && (
                <MoreDetailsCell
                  isSelected={isSelected}
                  tableItem={tableItem}
                  tableName={tableName}
                />
              )}
            </Fragment>
          ))}
        </RWATableRow>
      );
    },
    [selectedTableItem?.id, tableName],
  );

  return (
    <>
      <TableBase
        columns={columnsToShow}
        hasSelectedItem={!!selectedTableItem}
        headerRef={headerRef}
        maxHeight={maxHeight}
        onClickSort={
          sortHandler as (key: string, direction: SortDirection) => void
        }
        ref={tableContainerRef}
        renderRow={renderRow}
        specialFirstRow={specialFirstRow}
        specialLastRow={specialLastRow}
        tableData={tableData}
      />
      {isAllowedToCreateDocuments && !operation ? (
        <button
          className="mt-4 flex h-11 w-full items-center justify-center gap-x-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-900"
          onClick={onCreateItemClick}
        >
          <span>Create {tableLabel}</span>
          <Icon name="Plus" size={14} />
        </button>
      ) : null}
    </>
  );
}

import { Combobox } from "@/connect";
import { Pagination, usePagination } from "#powerhouse";
import {
  allGroupTransactionTypes,
  groupTransactionTypeLabels,
  ItemDetails,
  makeFixedIncomeOptionLabel,
  Table,
  tableNames,
  useEditorContext,
  useTableData,
} from "@/rwa";
import { useCallback, useEffect, useMemo, useState } from "react";

export function GroupTransactionsTable() {
  const tableName = tableNames.TRANSACTION;
  const { getIsFormOpen, fixedIncomes } = useEditorContext();

  const showForm = getIsFormOpen(tableName);
  const { tableData, sortHandler } = useTableData(tableName);
  const [filteredTableData, setFilteredTableData] = useState(tableData);
  const [filterAssetId, setFilterAssetId] = useState<string>();
  const [filterTypes, setFilterTypes] = useState<
    (keyof typeof allGroupTransactionTypes)[]
  >([]);
  const shouldPaginate = filteredTableData.length > 20;

  useEffect(() => {
    if (!filterAssetId && !filterTypes.length) {
      setFilteredTableData(tableData);
      return;
    }

    setFilteredTableData(
      tableData.filter((transaction) => {
        if (filterAssetId && filterTypes.length) {
          return (
            transaction.fixedIncomeTransaction?.assetId === filterAssetId &&
            filterTypes.includes(
              transaction.type as keyof typeof allGroupTransactionTypes,
            )
          );
        }

        if (filterAssetId) {
          return transaction.fixedIncomeTransaction?.assetId === filterAssetId;
        }

        if (filterTypes.length) {
          return filterTypes.includes(
            transaction.type as keyof typeof allGroupTransactionTypes,
          );
        }
      }),
    );
  }, [filterAssetId, filterTypes, tableData]);

  const filterByAssetOptions = useMemo(
    () =>
      fixedIncomes.map((asset) => ({
        label: makeFixedIncomeOptionLabel(asset),
        value: asset.id,
      })),
    [fixedIncomes],
  );

  const filterByTypeOptions = useMemo(
    () =>
      allGroupTransactionTypes.map((type) => ({
        label: groupTransactionTypeLabels[type],
        value: type,
      })),
    [],
  );

  const {
    pageItems,
    pages,
    goToPage,
    goToNextPage,
    goToPreviousPage,
    goToFirstPage,
    goToLastPage,
    hiddenNextPages,
    isNextPageAvailable,
    isPreviousPageAvailable,
  } = usePagination(filteredTableData);

  const handleFilterByAssetChange = useCallback((update: unknown) => {
    if (!update || !(typeof update === "object") || !("value" in update)) {
      setFilterAssetId(undefined);
      return;
    }

    const { value: assetId } = update;

    setFilterAssetId(assetId as string);
  }, []);

  const handleFilterByTypeChange = useCallback((update: unknown) => {
    if (!update || !Array.isArray(update)) {
      setFilterTypes([]);
      return;
    }

    const _update = update as {
      value: keyof typeof allGroupTransactionTypes;
    }[];

    setFilterTypes(_update.map(({ value }) => value));
  }, []);

  return (
    <>
      <div className="mb-2 flex gap-2">
        <div className="min-w-72 max-w-96">
          <Combobox
            isClearable
            onChange={handleFilterByAssetChange}
            options={filterByAssetOptions}
            placeholder="Filter by Asset"
          />
        </div>
        <div className="min-w-72 max-w-96">
          <Combobox
            isClearable
            isMulti
            onChange={handleFilterByTypeChange}
            options={filterByTypeOptions}
            placeholder="Filter by Type"
          />
        </div>
        <div className="flex w-full justify-end">
          {shouldPaginate ? (
            <Pagination
              goToFirstPage={goToFirstPage}
              goToLastPage={goToLastPage}
              goToNextPage={goToNextPage}
              goToPage={goToPage}
              goToPreviousPage={goToPreviousPage}
              hiddenNextPages={hiddenNextPages}
              isNextPageAvailable={isNextPageAvailable}
              isPreviousPageAvailable={isPreviousPageAvailable}
              nextPageLabel="Next"
              pages={pages}
              previousPageLabel="Previous"
            />
          ) : null}
        </div>
      </div>
      <Table
        sortHandler={sortHandler}
        tableData={pageItems}
        tableName={tableName}
      />
      {showForm ? (
        <div className="mt-4 rounded-md bg-white">
          <ItemDetails tableName={tableName} />
        </div>
      ) : null}
    </>
  );
}

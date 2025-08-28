import {
  ItemDetails,
  Pagination,
  Table,
  type TableColumn,
  type TableName,
  useEditorContext,
  usePagination,
  useTableData,
} from "@powerhousedao/design-system";

type Props = {
  readonly tableName: TableName;
  readonly specialFirstRow?: (columns: TableColumn[]) => React.JSX.Element;
  readonly specialLastRow?: (columns: TableColumn[]) => React.JSX.Element;
};
export function TableWithForm(props: Props) {
  const { tableName, specialFirstRow, specialLastRow } = props;
  const { getIsFormOpen } = useEditorContext();
  const showForm = getIsFormOpen(tableName);
  const { tableData, sortHandler } = useTableData(tableName);
  const shouldPaginate = tableData.length > 20;

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
  } = usePagination(tableData);
  return (
    <>
      <div className="mb-2 flex w-full justify-end">
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
      <Table
        sortHandler={sortHandler}
        specialFirstRow={specialFirstRow}
        specialLastRow={specialLastRow}
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

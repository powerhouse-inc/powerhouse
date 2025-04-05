import { cn } from "../../../../../scalars/lib/utils.js";
import { useInternalTableState } from "../table-provider/table-provider.js";

interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  index: number;
}

const TableRow: React.FC<TableRowProps> = ({
  children,
  className,
  index,
  ...props
}) => {
  const {
    state: { selectedRowIndexes },
  } = useInternalTableState();

  const isSelected = selectedRowIndexes.includes(index);
  const isNextRowSelected = selectedRowIndexes.includes(index + 1);
  const isPrevRowSelected = selectedRowIndexes.includes(index - 1);

  return (
    <tr
      className={cn(
        isSelected
          ? "border-b border-t bg-blue-50 hover:bg-blue-100"
          : "hover:bg-gray-100",
        !isSelected &&
          !isNextRowSelected &&
          "not-last:border-b border-gray-100",
        isSelected &&
          (isPrevRowSelected ? "border-t-transparent" : "border-t-blue-900"),
        isSelected &&
          (isNextRowSelected ? "border-b-transparent" : "border-b-blue-900"),
        className,
      )}
      data-selected={isSelected}
      {...props}
    >
      {children}
    </tr>
  );
};

export { TableRow };

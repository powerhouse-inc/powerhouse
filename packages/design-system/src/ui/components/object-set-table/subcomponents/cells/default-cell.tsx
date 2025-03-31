import { cn } from "#scalars";
import { TableCellBasic } from "./basic-cell.js";

interface DefaultTableCellProps
  extends React.HTMLAttributes<HTMLTableCellElement> {
  isSelected: boolean;
}

const DefaultTableCell: React.FC<DefaultTableCellProps> = ({
  children,
  className,
  isSelected,
  ...props
}) => {
  return (
    <TableCellBasic tabIndex={0} {...props} className={cn(className, "py-0")}>
      <div
        className={cn(
          "flex h-full items-center border border-transparent py-2",
          isSelected && "border-blue-900",
        )}
      >
        <div className="w-full px-[12px] py-2">{children}</div>
      </div>
    </TableCellBasic>
  );
};

export { DefaultTableCell };

import { TableCellBasic } from "./basic-cell.js";

const DefaultTableCell: React.FC<
  React.HTMLAttributes<HTMLTableCellElement>
> = ({ children, ...props }) => {
  return (
    <TableCellBasic {...props}>
      <div className="px-[12px] py-2">{children}</div>
    </TableCellBasic>
  );
};

export { DefaultTableCell };

import { cn } from "../../../../../scalars/lib/utils.js";

const TableRow: React.FC<
  React.HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }
> = ({ children, className, selected = false, ...props }) => {
  return (
    <tr
      className={cn(
        "not-last:border-b border-gray-100 hover:bg-gray-100",
        // selected && "border-b border-t border-blue-900 bg-blue-50",
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  );
};

export { TableRow };

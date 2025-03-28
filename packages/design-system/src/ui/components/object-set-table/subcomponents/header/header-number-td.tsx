import { cn } from "#scalars";
import { useInternalTableState } from "../table-provider/table-provider.js";
import { HeaderCell } from "./header-cell.js";

const HeaderNumberTd: React.FC<React.HTMLAttributes<HTMLTableCellElement>> = ({
  className,
  ...props
}) => {
  const {
    config: { showRowNumbers, allowRowSelection },
  } = useInternalTableState();

  if (!showRowNumbers && !allowRowSelection) {
    return null;
  }

  return (
    <HeaderCell
      className={cn("min-w-9 border-r border-gray-300 text-center", className)}
      {...props}
    >
      {showRowNumbers ? "#" : ""}
    </HeaderCell>
  );
};

export { HeaderNumberTd };

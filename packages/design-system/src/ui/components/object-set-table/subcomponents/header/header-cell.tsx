import { cn } from "#scalars";

const HeaderCell: React.FC<React.HTMLAttributes<HTMLTableCellElement>> = ({
  children,
  className,
  ...props
}) => {
  return (
    <th
      className={cn(
        "px-[12px] py-[15px] text-left text-[14px] font-medium leading-[14px] text-gray-500",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
};

export { HeaderCell };

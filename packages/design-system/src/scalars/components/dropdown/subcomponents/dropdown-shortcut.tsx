import { cn } from "@/scalars/lib/utils";

const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn("ml-auto text-xs tracking-widest opacity-60", className)}
      {...props}
    />
  );
};

DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

export default DropdownMenuShortcut;

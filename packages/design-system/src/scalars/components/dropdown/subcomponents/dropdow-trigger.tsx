import { cn } from "@/scalars/lib/utils";
import { DropdownTrigger } from "..";

export const CustomTrigger: React.FC<
  React.ComponentProps<typeof DropdownTrigger>
> = ({ children, className, ...props }) => (
  <DropdownTrigger
    {...props}
    className={cn(
      "flex w-full items-center  rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer",
      className,
    )}
    asChild
  >
    <div className="flex gap-2">{children}</div>
  </DropdownTrigger>
);

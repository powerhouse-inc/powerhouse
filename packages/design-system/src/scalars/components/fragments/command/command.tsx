import React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Icon } from "@/powerhouse/components/icon";
import { cn } from "@/scalars/lib/utils";

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn("flex size-full flex-col rounded", className)}
    {...props}
  />
));
Command.displayName = CommandPrimitive.displayName;

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input> & {
    wrapperClassName?: string;
  }
>(({ wrapperClassName, className, ...props }, ref) => (
  <div
    className={cn(
      "group relative flex items-center border-b",
      "border-b-gray-300 dark:border-b-gray-900",
      "hover:border-b-gray-300 dark:hover:border-b-gray-800",
      "hover:bg-gray-100 dark:hover:bg-gray-900",
      "focus-within:border-b-gray-300 dark:focus-within:border-b-gray-800",
      "focus-within:bg-gray-100 dark:focus-within:bg-gray-900",
      wrapperClassName,
    )}
    cmdk-input-wrapper=""
  >
    <Icon
      name="Search"
      size={16}
      className={cn(
        "pointer-events-none absolute left-2 top-3.5 text-gray-500 dark:text-gray-700",
        "group-hover:text-gray-700 dark:group-hover:text-gray-500",
        "group-focus-within:!text-gray-900 dark:group-focus-within:!text-gray-50",
      )}
    />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        "flex w-full bg-transparent pb-2 pl-8 pr-3 pt-3 text-[14px] font-normal leading-5 outline-none",
        "placeholder:text-gray-500 dark:placeholder:text-gray-700",
        "group-hover:placeholder:text-gray-700 dark:group-hover:placeholder:text-gray-500",
        "group-focus-within:placeholder:!text-gray-700 dark:group-focus-within:placeholder:!text-gray-300",
        "disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  </div>
));
CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn(
      "max-h-[300px] overflow-y-auto overflow-x-hidden",
      "focus:outline-none",
      className,
    )}
    {...props}
  />
));
CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => <CommandPrimitive.Empty ref={ref} {...props} />);

CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      "overflow-hidden px-0.5 py-1",
      "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium",
      className,
    )}
    {...props}
  />
));
CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex select-none items-center justify-between",
      "h-8 gap-2 rounded-md py-1.5 pl-1.5 pr-2.5",
      "text-[14px] leading-4 outline-none",
      "border-y-2 border-white dark:border-slate-700",
      "data-[disabled=true]:pointer-events-none",
      "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      className,
    )}
    {...props}
  />
));
CommandItem.displayName = CommandPrimitive.Item.displayName;

export {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
};

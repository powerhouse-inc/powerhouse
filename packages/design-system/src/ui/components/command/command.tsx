import { cn, Icon } from "#design-system";
import { Command as CommandPrimitive } from "cmdk";
import React from "react";

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      "flex size-full flex-col rounded-md **:[[cmdk-label]]:hidden",
      className,
    )}
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
        "pointer-events-none absolute top-3.5 left-2 text-gray-500 dark:text-gray-700",
        "group-hover:text-gray-700 dark:group-hover:text-gray-500",
        "group-focus-within:text-gray-900! dark:group-focus-within:text-gray-50!",
      )}
    />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        "flex w-full bg-transparent pt-3 pr-3 pb-2 pl-8 text-sm/5 font-normal outline-none",
        "placeholder:text-gray-500 dark:placeholder:text-gray-700",
        "group-hover:placeholder:text-gray-700 dark:group-hover:placeholder:text-gray-500",
        "group-focus-within:placeholder:text-gray-700! dark:group-focus-within:placeholder:text-gray-300!",
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
      "max-h-75 overflow-x-hidden overflow-y-auto",
      "focus:outline-none",
      "scrollbar-thin",
      "scrollbar-track-transparent",
      "scrollbar-thumb-gray-300 hover:scrollbar-thumb-gray-300",
      "dark:scrollbar-thumb-slate-700 dark:hover:scrollbar-thumb-slate-700",
      "scrollbar-thumb-rounded-md",
      className,
    )}
    {...props}
  />
));
CommandList.displayName = CommandPrimitive.List.displayName;

const CommandLoading = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Loading>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Loading>
>((props, ref) => <CommandPrimitive.Loading ref={ref} {...props} />);
CommandLoading.displayName = CommandPrimitive.Loading.displayName;

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
      "**:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium",
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
      "relative flex items-center justify-between select-none",
      "h-8 gap-2 rounded-md py-1.5 pr-2.5 pl-1.5",
      "text-sm/4 text-gray-900 outline-none dark:text-slate-50",
      "border-y-2 border-white dark:border-slate-600",
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
  CommandLoading,
};

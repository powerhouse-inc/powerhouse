import { Icon } from "#design-system";
import { Command as CommandPrimitive } from "cmdk";
import React from "react";
import { twMerge } from "tailwind-merge";

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={twMerge(
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
    className={twMerge(
      "group relative flex items-center border-b",
      "border-b-border",
      "hover:hover-effect",
      "focus-within:border-b-border",
      "focus-within:bg-accent",
      wrapperClassName,
    )}
    cmdk-input-wrapper=""
  >
    <Icon
      name="Search"
      size={16}
      className={twMerge(
        "pointer-events-none absolute top-3.5 left-2 text-muted-foreground",
        "group-hover:hover-effect",
        "group-focus-within:text-foreground!",
      )}
    />
    <CommandPrimitive.Input
      ref={ref}
      className={twMerge(
        "flex w-full bg-transparent pt-3 pr-3 pb-2 pl-8 text-sm/5 font-normal outline-none",
        "text-foreground placeholder:text-muted-foreground disabled:disabled-effect",
        "group-hover:hover-effect",
        "disabled:disabled-effect",
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
    className={twMerge(
      "max-h-75 overflow-x-hidden overflow-y-auto",
      "focus:outline-none",
      "scrollbar-thin",
      "scrollbar-track-transparent",
      "scrollbar-thumb-border hover:scrollbar-thumb-border",
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
    className={twMerge(
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
    className={twMerge(
      "relative flex items-center justify-between select-none",
      "h-8 gap-2 rounded-md py-1.5 pr-2.5 pl-1.5",
      "text-sm/4 text-foreground outline-none",
      "border-y-2 border-border",
      "data-[disabled=true]:disabled-effect",
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

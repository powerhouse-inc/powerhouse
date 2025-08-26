"use client";

import { cn } from "#powerhouse";
import {
  Content,
  Portal,
  Provider,
  Root,
  type TooltipContentProps,
  type TooltipProps as TooltipPrimitiveProps,
  Trigger,
} from "@radix-ui/react-tooltip";
import { forwardRef } from "react";

interface TooltipProps
  extends TooltipPrimitiveProps,
    Omit<TooltipContentProps, "content"> {
  content: React.ReactNode;
  className?: string;
  triggerAsChild?: boolean;
}

const TooltipContent = forwardRef<
  React.ElementRef<typeof Content>,
  TooltipContentProps
>(({ children, className, ...props }, ref) => {
  return (
    <Content
      ref={ref}
      {...props}
      className={cn(
        // Base styles
        "z-50 overflow-hidden rounded-md text-sm",
        // Colors & Border
        "border border-gray-200 bg-white text-gray-900 dark:border-gray-900 dark:bg-slate-900 dark:text-gray-200",
        // Padding & Shadow
        "px-3 py-1.5 shadow-md",
        // Animations
        "data-[state=open]:animate-fade-in data-[state=open]:animate-zoom-in",
        "data-[state=closed]:animate-fade-out data-[state=closed]:animate-zoom-out",
        // Slide animations based on position
        "data-[side=bottom]:animate-slide-in-from-top",
        "data-[side=left]:animate-slide-in-from-right",
        "data-[side=right]:animate-slide-in-from-left",
        "data-[side=top]:animate-slide-in-from-bottom",
        className,
      )}
    >
      {children}
    </Content>
  );
});

const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  triggerAsChild = false,
  delayDuration = 0,
  ...props
}) => {
  const { open, defaultOpen, onOpenChange, ...rest } = props;

  return (
    <Root
      defaultOpen={defaultOpen}
      delayDuration={delayDuration}
      onOpenChange={onOpenChange}
      open={open}
    >
      <Trigger
        asChild={triggerAsChild}
        type={triggerAsChild ? undefined : "button"} // Prevent form submission when default trigger is clicked
      >
        {children}
      </Trigger>
      <Portal>
        <TooltipContent sideOffset={3} {...rest}>
          {content}
        </TooltipContent>
      </Portal>
    </Root>
  );
};

export {
  Tooltip,
  TooltipContent,
  Provider as TooltipProvider,
  Root as TooltipRoot,
  Trigger as TooltipTrigger,
  type TooltipProps,
};

"use client";

import * as React from "react";
import {
  Content,
  Portal,
  Provider,
  Root,
  Trigger,
  TooltipProps as TooltipPrimitiveProps,
  TooltipContentProps,
} from "@radix-ui/react-tooltip";
import { cn } from "@/scalars/lib/utils";

interface TooltipProps
  extends TooltipPrimitiveProps,
    Omit<TooltipContentProps, "content"> {
  content: React.ReactNode;
  className?: string;
  triggerAsChild?: boolean;
}

const TooltipContent = ({
  children,
  className,
  ...props
}: TooltipContentProps) => {
  return (
    <Content
      {...props}
      className={cn(
        // Base styles
        "z-50 overflow-hidden rounded-md text-sm",
        // Colors & Border
        "border border-gray-200 bg-white text-gray-900 dark:border-gray-900 dark:bg-slate-900 dark:text-gray-200",
        // Padding & Shadow
        "px-3 py-1.5 shadow-md",
        // Animations
        "animate-in fade-in-0 zoom-in-95",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
        // Slide animations based on position
        "data-[side=bottom]:slide-in-from-top-2",
        "data-[side=left]:slide-in-from-right-2",
        "data-[side=right]:slide-in-from-left-2",
        "data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
    >
      {children}
    </Content>
  );
};

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
      <Trigger asChild={triggerAsChild}>{children}</Trigger>
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
  TooltipProps,
  Root as TooltipRoot,
  Trigger as TooltipTrigger,
  TooltipContent,
  Provider as TooltipProvider,
};

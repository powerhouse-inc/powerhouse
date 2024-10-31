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
        // Layout
        "z-50 overflow-hidden rounded-md px-3 py-1.5",
        // Colors & Typography
        "bg-primary text-xs text-primary-foreground shadow-lg",
        // Animations
        "animate-in fade-in-0 zoom-in-95",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2",
        "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
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
  ...props
}) => {
  const { open, defaultOpen, onOpenChange, ...rest } = props;

  return (
    <Root
      defaultOpen={defaultOpen}
      delayDuration={0}
      onOpenChange={onOpenChange}
      open={open}
    >
      <Trigger asChild={triggerAsChild}>{children}</Trigger>
      <Portal>
        <TooltipContent {...rest}>{content}</TooltipContent>
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

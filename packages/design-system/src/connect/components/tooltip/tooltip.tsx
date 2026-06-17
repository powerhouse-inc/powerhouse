import type { TooltipProps } from "@radix-ui/react-tooltip";
import {
  Content,
  Portal,
  Provider,
  Root,
  Trigger,
} from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

type Props = TooltipProps & {
  readonly className?: string;
  readonly content: ReactNode;
  readonly side?: "top" | "right" | "bottom" | "left";
  readonly sideOffset?: number;
};

export function ConnectTooltip(props: Props) {
  const {
    children,
    content,
    open,
    defaultOpen,
    onOpenChange,
    className,
    side = "top",
    sideOffset = 5,
    delayDuration,
    ...rest
  } = props;

  return (
    <Root
      defaultOpen={defaultOpen}
      delayDuration={delayDuration}
      onOpenChange={onOpenChange}
      open={open}
    >
      <Trigger asChild>{children}</Trigger>
      <Portal>
        <Content
          {...rest}
          side={side}
          sideOffset={sideOffset}
          className={twMerge(
            "z-50 rounded-lg border border-border bg-popover p-2 text-xs text-popover-foreground shadow-tooltip",
            className,
          )}
        >
          {content}
        </Content>
      </Portal>
    </Root>
  );
}

export const ConnectTooltipProvider = Provider;

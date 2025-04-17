import {
  Content,
  Portal,
  Provider,
  Root,
  type TooltipProps,
  Trigger,
} from "@radix-ui/react-tooltip";
import { type ReactNode } from "react";
import { twMerge } from "tailwind-merge";

type Props = TooltipProps & {
  readonly className?: string;
  readonly content: ReactNode;
  readonly side?: "top" | "right" | "bottom" | "left";
  readonly sideOffset?: number;
};

export function Tooltip(props: Props) {
  const {
    children,
    content,
    open,
    defaultOpen,
    onOpenChange,
    className,
    side = "top",
    sideOffset = 5,
    ...rest
  } = props;

  return (
    <Root
      defaultOpen={defaultOpen}
      delayDuration={0}
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
            "shadow-tooltip rounded-lg border border-gray-200 bg-white p-2 text-xs",
            className,
          )}
        >
          {content}
        </Content>
      </Portal>
    </Root>
  );
}

export const TooltipProvider = Provider;

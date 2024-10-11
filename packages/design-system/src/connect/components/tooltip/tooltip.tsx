import {
  Content,
  Portal,
  Provider,
  Root,
  TooltipProps,
  Trigger,
} from "@radix-ui/react-tooltip";
import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

type Props = TooltipProps & {
  readonly className?: string;
  readonly content: ReactNode;
};

export function Tooltip(props: Props) {
  const {
    children,
    content,
    open,
    defaultOpen,
    onOpenChange,
    className,
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
          className={twMerge(
            "rounded-lg border border-gray-200 bg-white p-2 text-xs shadow-tooltip",
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

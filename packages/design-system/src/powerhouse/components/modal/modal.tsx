import {
  Content,
  Description,
  Overlay,
  Portal,
  Root,
  Title,
} from "@radix-ui/react-dialog";
import { Root as VisuallyHidden } from "@radix-ui/react-visually-hidden";
import type { ComponentPropsWithoutRef } from "react";
import { twMerge } from "tailwind-merge";

type Props = {
  readonly title?: string;
  readonly children?: React.ReactNode;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly overlayProps?: ComponentPropsWithoutRef<typeof Overlay>;
  readonly contentProps?: ComponentPropsWithoutRef<typeof Content>;
};
export function Modal(props: Props) {
  const {
    title,
    open,
    onOpenChange,
    contentProps,
    overlayProps,
    children,
    ...delegated
  } = props;
  return (
    <Root defaultOpen={open} onOpenChange={onOpenChange} open={open}>
      <Portal>
        <Overlay
          {...overlayProps}
          className={twMerge(
            "data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in fixed inset-0 grid place-items-center overflow-y-auto bg-slate-900/50",
            overlayProps?.className,
          )}
        >
          <Content
            {...delegated}
            {...contentProps}
            className={twMerge(
              "data-[state=closed]:animate-zoom-out data-[state=open]:animate-zoom-in bg-white",
              contentProps?.className,
            )}
          >
            <VisuallyHidden>
              <Title>{title || "Modal"}</Title>
              <Description>{title || "Modal"}</Description>
            </VisuallyHidden>
            {children}
          </Content>
        </Overlay>
      </Portal>
    </Root>
  );
}

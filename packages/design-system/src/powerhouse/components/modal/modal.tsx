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
  // When false the dialog doesn't trap focus or block pointer events outside
  // its content, so a sibling portal (e.g. a wallet picker) stays interactive.
  readonly modal?: boolean;
};
export function Modal(props: Props) {
  const {
    title,
    open,
    onOpenChange,
    contentProps,
    overlayProps,
    children,
    modal,
    ...delegated
  } = props;

  const content = (
    <Content
      {...delegated}
      {...contentProps}
      className={twMerge(
        "overflow-hidden rounded-3xl bg-background shadow-modal data-[state=closed]:animate-zoom-out data-[state=open]:animate-zoom-in",
        modal === false && "pointer-events-auto",
        contentProps?.className,
      )}
    >
      <VisuallyHidden>
        <Title>{title || "Modal"}</Title>
        <Description>{title || "Modal"}</Description>
      </VisuallyHidden>
      {children}
    </Content>
  );

  return (
    <Root
      defaultOpen={open}
      onOpenChange={onOpenChange}
      open={open}
      modal={modal}
    >
      <Portal>
        {modal === false ? (
          // Radix's <Overlay> renders null when modal={false}; supply our own
          // backdrop + centering wrapper so the content still shows centered.
          <>
            <div
              {...overlayProps}
              className={twMerge(
                "fixed inset-0 bg-background/50 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in",
                overlayProps?.className,
              )}
            />
            <div className="pointer-events-none fixed inset-0 grid place-items-center overflow-y-auto">
              {content}
            </div>
          </>
        ) : (
          <Overlay
            {...overlayProps}
            className={twMerge(
              "fixed inset-0 grid place-items-center overflow-y-auto bg-background/50 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in",
              overlayProps?.className,
            )}
          >
            {content}
          </Overlay>
        )}
      </Portal>
    </Root>
  );
}

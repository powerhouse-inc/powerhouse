import {
  Anchor,
  Content,
  Portal,
  Root,
  Trigger,
} from "@radix-ui/react-popover";
import { useState, type ReactNode } from "react";
import { funnel } from "remeda";

export function CodePopover(props: {
  content: ReactNode;
  trigger: ReactNode;
  anchor?: ReactNode;
}) {
  const { content, trigger, anchor } = props;
  const [isOpen, setIsOpen] = useState(false);

  const opener = funnel(
    () => {
      setIsOpen(true);
    },
    {
      triggerAt: "start",
      minQuietPeriodMs: 300,
    },
  );

  const closer = funnel(
    () => {
      setIsOpen(false);
    },
    {
      triggerAt: "start",
      minQuietPeriodMs: 100,
    },
  );

  function open() {
    closer.cancel();
    opener.call();
  }

  function close() {
    opener.cancel();
    closer.call();
  }

  return (
    <Root
      open={isOpen}
      onOpenChange={(changedIsOpen) => (changedIsOpen ? open() : close())}
    >
      <Trigger onMouseEnter={open}>{trigger}</Trigger>
      {!!anchor && <Anchor asChild>{anchor}</Anchor>}
      <Portal>
        <Content
          forceMount
          className="shadow-tooltip z-50 rounded-lg border border-gray-200 bg-white p-2 text-xs outline-none"
          sideOffset={-28}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onMouseLeave={close}
          collisionPadding={{
            top: 24,
            right: 24,
            bottom: -10_000,
            left: 24,
          }}
        >
          {content}
        </Content>
      </Portal>
    </Root>
  );
}

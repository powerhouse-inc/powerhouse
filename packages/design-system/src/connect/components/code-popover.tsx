import {
  Anchor,
  Content,
  Portal,
  Root,
  Trigger,
} from "@radix-ui/react-popover";
import { useState, type ReactNode } from "react";
import { funnel } from "remeda";

/* A hybrid popover / tooltip component intended for showing data that needs
  to show / hide on hover, while also being able to stay open so that the user can
  interact with its contents.

  Uses these rules:

  When the user hover's the trigger, show the tooltip / popover.
  Immediately place the content under the user's cursor.
  Then let the responsibility of closing the tooltip / popover be transferred _to the content_.
  When the user leaves _the contents_ or interacts elsewhere, only then close.
*/
export function CodePopover(props: {
  content: ReactNode;
  trigger: ReactNode;
  anchor?: ReactNode;
}) {
  const { content, trigger, anchor } = props;
  const [isOpen, setIsOpen] = useState(false);

  /* debounce calls to open by 300ms */
  const opener = funnel(() => setIsOpen(true), {
    triggerAt: "start",
    minQuietPeriodMs: 300,
  });

  /* debounce calls to close by 100ms */
  const closer = funnel(() => setIsOpen(false), {
    triggerAt: "start",
    minQuietPeriodMs: 100,
  });

  /* If we are in the process of closing, cancel that operation.
    Then call the opener.
  */
  function open() {
    closer.cancel();
    opener.call();
  }

  /* If we are in the process of opening, cancel that operation.
    Then call the closer.
  */
  function close() {
    opener.cancel();
    closer.call();
  }

  return (
    <Root
      /* This component combines internal state with the existing accessibility behaviors from the radix popover */
      open={isOpen}
      onOpenChange={(changedIsOpen) => (changedIsOpen ? open() : close())}
    >
      {/* Trigger only manages opening */}
      <Trigger onMouseEnter={open}>{trigger}</Trigger>
      {!!anchor && <Anchor asChild>{anchor}</Anchor>}
      <Portal>
        <Content
          /* We need to force mount so that the events are fired as expected */
          forceMount
          /* content only manages closing */
          onMouseLeave={close}
          /* Offset the position to ensure that we open under the user's cursor */
          sideOffset={-28}
          /* Do not focus the trigger after closing since that item is not interactive */
          onCloseAutoFocus={(e) => e.preventDefault()}
          /* Set an arbitrarily large bottom collision detection padding so that very long content flows below the fold */
          collisionPadding={{
            top: 24,
            right: 24,
            bottom: -10_000,
            left: 24,
          }}
          className="z-50 rounded-lg border border-gray-200 bg-white p-2 text-xs shadow-tooltip outline-none dark:border-slate-500 dark:bg-slate-600"
        >
          {content}
        </Content>
      </Portal>
    </Root>
  );
}

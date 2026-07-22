import { AccountPopoverLogin } from "@powerhousedao/design-system/connect";
import { Modal } from "@powerhousedao/design-system";
import {
  closePHModal,
  usePHModal,
  useUser,
} from "@powerhousedao/reactor-browser";
import React, { useLayoutEffect, useState } from "react";
import { useRenownLoginProps } from "../../../hooks/use-renown-login.js";

// Fixed-position style anchoring the card to the right of a rect (the sidebar
// login button), with its bottom aligned to the button's bottom.
type AnchorStyle = Pick<React.CSSProperties, "position" | "left" | "bottom">;

function measureAnchor(): AnchorStyle | undefined {
  if (typeof document === "undefined") return undefined;
  const btn = document.querySelector('#sidebar [aria-label="Log in"]');
  if (!btn) return undefined;
  const rect = btn.getBoundingClientRect();
  return {
    position: "fixed",
    left: rect.right + 12,
    bottom: window.innerHeight - rect.bottom,
  };
}

// Login popover opened via showPHModal({ type: "login" }); renders the shared
// branded card + feedback and closes once the user is authenticated.
export const LoginModal: React.FC = () => {
  const phModal = usePHModal();
  const user = useUser();
  const loginProps = useRenownLoginProps();
  const open = phModal?.type === "login";
  const [anchor, setAnchor] = useState<AnchorStyle | undefined>(undefined);

  // Anchor next to the sidebar login button (recomputed on resize); falls back
  // to centered if the button isn't found.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => setAnchor(measureAnchor());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);

  useLayoutEffect(() => {
    if (open && user) closePHModal();
  }, [open, user]);

  // modal={false} + non-dismiss-on-outside so the wallet adapter's own modal (a
  // sibling portal, e.g. RainbowKit) stays interactive on top of this one.
  return (
    <Modal
      modal={false}
      open={open}
      onOpenChange={(next) => {
        if (!next) closePHModal();
      }}
      title="Log in"
      overlayProps={{ className: "pointer-events-none bg-transparent" }}
      contentProps={{
        className: "w-64 max-w-[calc(100vw-2rem)]",
        style: anchor,
        onInteractOutside: (e) => e.preventDefault(),
        onPointerDownOutside: (e) => e.preventDefault(),
      }}
    >
      <AccountPopoverLogin {...loginProps} />
    </Modal>
  );
};

import { DriveAuthGate } from "@powerhousedao/design-system/connect";
import {
  closePHModal,
  logout,
  usePHModal,
  useUser,
} from "@powerhousedao/reactor-browser";
import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { useOpenRenownLogin } from "../../../hooks/use-renown-login.js";

// Non-blocking overlay when a protected drive can't be added while signed out
// (pointer-events-none backdrop keeps the cookie banner clickable). Opens login.
// Closing is the close control or Escape only: an outside-click handler would
// fire on the cookie banner, which is a root sibling of this portal.
export const DriveAuthRequiredModal: React.FC = () => {
  const phModal = usePHModal();
  const user = useUser();
  const openLogin = useOpenRenownLogin();
  const mode = user ? "unauthorized" : "login";
  const isOpen = phModal?.type === "driveAuthRequired";

  // Escape is the keyboard half of the close control. It lives here rather than
  // in DriveAuthGate because content.tsx renders the same card full-page, where
  // a window-level Escape handler would be wrong.
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closePHModal();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Portal to body so `fixed inset-0` centers on the viewport, not inside a
  // transformed/contained ancestor (a wallet provider wrapper or layout column).
  return createPortal(
    <div
      role="dialog"
      aria-modal="false"
      aria-label={
        mode === "unauthorized"
          ? "You don't have access to this drive"
          : "Log in to access this drive"
      }
      className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-primary/30"
    >
      <DriveAuthGate
        mode={mode}
        onLogin={() => {
          closePHModal();
          openLogin();
        }}
        onLogout={() => void logout()}
        onClose={() => closePHModal()}
        className="pointer-events-auto"
      />
    </div>,
    document.body,
  );
};

import { DriveAuthGate } from "@powerhousedao/design-system/connect";
import {
  closePHModal,
  logout,
  usePHModal,
  useUser,
} from "@powerhousedao/reactor-browser";
import React from "react";
import { createPortal } from "react-dom";
import { useOpenRenownLogin } from "../../../hooks/use-renown-login.js";

// Non-blocking overlay when a protected drive can't be added while signed out
// (pointer-events-none backdrop keeps the cookie banner clickable). Opens login.
export const DriveAuthRequiredModal: React.FC = () => {
  const phModal = usePHModal();
  const user = useUser();
  const openLogin = useOpenRenownLogin();
  const mode = user ? "unauthorized" : "login";
  if (phModal?.type !== "driveAuthRequired") return null;

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
        className="pointer-events-auto"
      />
    </div>,
    document.body,
  );
};

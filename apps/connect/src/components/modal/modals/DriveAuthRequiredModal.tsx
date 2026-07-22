import { DriveAuthGate } from "@powerhousedao/design-system/connect";
import { logout, usePHModal, useUser } from "@powerhousedao/reactor-browser";
import React from "react";
import { createPortal } from "react-dom";
import { useRenownLoginProps } from "../../../hooks/use-renown-login.js";

/**
 * Shown when a protected drive can't be added because the user isn't logged in.
 *
 * Deliberately NOT a Radix modal dialog: a modal dialog blocks all outside
 * interaction, which would trap the cookie banner (rendered above at z-10000)
 * and prevent accepting/rejecting it. Instead this is a non-blocking overlay —
 * `pointer-events-none` on the backdrop (so the banner and page stay clickable)
 * with `pointer-events-auto` on the card — sitting below the cookie banner. The
 * card itself is the shared {@link DriveAuthGate}, identical to the full-page
 * gate. It stays up until login (in-page when configured, else redirect).
 */
export const DriveAuthRequiredModal: React.FC = () => {
  const phModal = usePHModal();
  const user = useUser();
  const loginProps = useRenownLoginProps();
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
        {...loginProps}
        onLogout={() => void logout()}
        className="pointer-events-auto"
      />
    </div>,
    document.body,
  );
};

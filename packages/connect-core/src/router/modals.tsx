import type { PHModal } from "@powerhousedao/reactor-browser";
import { usePHModal } from "@powerhousedao/reactor-browser";
import { useMatches } from "@tanstack/react-router";
import type { ComponentType, ErrorInfo, ReactNode } from "react";
import { Component, createElement, Suspense } from "react";
import type * as ModalViews from "../views/modals.js";
import type { ModalFrameProps } from "./modal-frame.js";
import { ModalFrameContext } from "./modal-frame.js";

/** Modal views by modal type. Each reads the open modal with `usePHModal()`. */
export type ConnectModals = Partial<Record<PHModal["type"], ComponentType>>;

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** Replaces the host's view of these modals while the route matches. */
    modals?: ConnectModals;
  }
}

/** Core's modals: the ones editors, drive apps and the reactor open, so every
 * host has them. Each names its view in `@powerhousedao/connect-core/views`. */
export const CORE_MODAL_VIEWS = {
  createDocument: "CreateDocumentModal",
  login: "LoginModal",
  deleteItem: "DeleteItemModal",
  confirmDocumentUpgrade: "ConfirmDocumentUpgradeModal",
  downloadDocumentWithErrors: "DownloadDocumentWithErrorsModal",
  documentVersionUnsupported: "DocumentVersionUnsupportedModal",
  driveAuthRequired: "DriveAuthRequiredModal",
} as const satisfies Partial<Record<PHModal["type"], keyof typeof ModalViews>>;

type BoundaryProps = { modal: string; children: ReactNode };

// A broken modal closes quietly instead of taking the page down; keyed by
// modal, so the next one gets a fresh try.
class ModalErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(
      `[connect] the ${this.props.modal} modal failed:`,
      error,
      info,
    );
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** The open modal's view: the deepest matched route's `staticData.modals`
 * entry for it, else `modals`', in the deepest `staticData.modalFrame`. */
export function ModalOutlet({ modals }: { modals: ConnectModals }) {
  const type = usePHModal()?.type;
  const routed = useMatches({
    select: (matches) =>
      type &&
      matches.reduce<ComponentType | undefined>(
        (found, match) => match.staticData.modals?.[type] ?? found,
        undefined,
      ),
  });
  const frame = useMatches({
    select: (matches) =>
      matches.reduce<ComponentType<ModalFrameProps> | undefined>(
        (found, match) => match.staticData.modalFrame ?? found,
        undefined,
      ),
  });
  const View = routed || (type && modals[type]);
  if (!type || !View) return null;
  return (
    <ModalErrorBoundary key={type} modal={type}>
      <ModalFrameContext.Provider value={frame}>
        <Suspense name="Modal" fallback={null}>
          {/* A registered view, not one made here. */}
          {createElement(View)}
        </Suspense>
      </ModalFrameContext.Provider>
    </ModalErrorBoundary>
  );
}

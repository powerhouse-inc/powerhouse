import { useConnectModal as rainbowUseConnectModal } from "@rainbow-me/rainbowkit";
import { useEffect, useRef } from "react";

// RainbowKit ships types via an exports map with no "types" condition, so
// type-aware lint sees it as error-typed; assert the shape we rely on.
const useConnectModal = rainbowUseConnectModal as () => {
  openConnectModal: (() => void) | undefined;
  connectModalOpen: boolean;
};

// Imperative handle the controller reads across the React boundary: the bridge
// component feeds it RainbowKit's modal opener and pending-login cancellation.
export interface RainbowBridge {
  getOpenConnectModal: () => (() => void) | null;
  setOpenConnectModal: (open: (() => void) | null) => void;
  /** Resolve once the modal opener is published, or reject after `timeoutMs`. */
  whenOpenConnectModalReady: (timeoutMs?: number) => Promise<() => void>;
  setPendingReject: (reject: ((error: Error) => void) | null) => void;
  handleModalClosed: () => void;
}

// Plain-JS bridge (created outside React) so effects only call its methods
// rather than mutating a prop, satisfying the react-hooks immutability rule.
export function createRainbowBridge(): RainbowBridge {
  let openConnectModal: (() => void) | null = null;
  let pendingReject: ((error: Error) => void) | null = null;
  // connect() may fire before the RainbowKit Provider's effect publishes the
  // opener (wagmi reconnect / StrictMode double-invoke); these waiters bridge it.
  let readyWaiters: Array<(open: () => void) => void> = [];
  return {
    getOpenConnectModal: () => openConnectModal,
    setOpenConnectModal: (open) => {
      openConnectModal = open;
      if (open && readyWaiters.length) {
        const waiters = readyWaiters;
        readyWaiters = [];
        for (const resolve of waiters) resolve(open);
      }
    },
    whenOpenConnectModalReady: (timeoutMs = 8000) => {
      if (openConnectModal) return Promise.resolve(openConnectModal);
      return new Promise<() => void>((resolve, reject) => {
        const waiter = (open: () => void) => {
          clearTimeout(timer);
          resolve(open);
        };
        const timer = setTimeout(() => {
          readyWaiters = readyWaiters.filter((w) => w !== waiter);
          reject(
            new Error(
              "rainbow adapter: connect modal unavailable. Ensure the adapter Provider is mounted.",
            ),
          );
        }, timeoutMs);
        readyWaiters.push(waiter);
      });
    },
    setPendingReject: (reject) => {
      pendingReject = reject;
    },
    handleModalClosed: () => {
      const reject = pendingReject;
      pendingReject = null;
      if (reject) reject(new Error("Login cancelled by user"));
    },
  };
}

// Wires RainbowKit's useConnectModal into the bridge so the controller's
// connect() can open the React-only modal, and cancels on modal dismissal.
export function RainbowAdapterBridge({ bridge }: { bridge: RainbowBridge }) {
  const { openConnectModal, connectModalOpen } = useConnectModal();
  const wasOpen = useRef(false);

  useEffect(() => {
    bridge.setOpenConnectModal(openConnectModal ?? null);
    return () => bridge.setOpenConnectModal(null);
  }, [bridge, openConnectModal]);

  useEffect(() => {
    if (connectModalOpen) {
      wasOpen.current = true;
      return;
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      bridge.handleModalClosed();
    }
  }, [bridge, connectModalOpen]);

  return null;
}

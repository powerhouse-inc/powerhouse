"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { openRenown } from "../lib/renown/utils.js";
import {
  CopyIcon,
  DisconnectIcon,
  ExternalLinkIcon,
  UserIcon,
} from "./icons.js";

const POPOVER_GAP = 8;
const POPOVER_HEIGHT = 150; // approximate height of popover

export interface RenownUserButtonProps {
  /**
   * The user's wallet address
   */
  address: string;
  /**
   * Optional ENS name or username to display
   */
  username?: string;
  /**
   * Optional avatar URL
   */
  avatarUrl?: string;
  /**
   * User ID to view the profile on Renown
   */
  userId?: string;
  /**
   * Callback when disconnect is requested
   */
  onDisconnect: (() => void) | undefined;
  /**
   * Custom styles for the button
   */
  style?: CSSProperties;
  /**
   * Custom class name
   */
  className?: string;
  /**
   * Custom render function for the trigger button
   */
  renderTrigger?: (props: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    address: string;
    username?: string;
    avatarUrl?: string;
  }) => ReactNode;
}

const styles: Record<string, CSSProperties> = {
  wrapper: {
    position: "relative",
    display: "inline-block",
  },
  trigger: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    borderRadius: "50%",
    overflow: "hidden",
  },
  avatar: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    objectFit: "cover",
  },
  avatarPlaceholder: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    backgroundColor: "#e5e7eb",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  popoverBase: {
    position: "absolute",
    left: 0,
    backgroundColor: "white",
    borderRadius: "8px",
    boxShadow:
      "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
    width: "208px", // w-52
    zIndex: 1000,
    color: "#111827", // text-gray-900
  },
  section: {
    padding: "8px 12px", // py-2 px-3
    borderBottom: "1px solid #e5e7eb", // divide-gray-200
  },
  sectionLast: {
    padding: "8px 12px",
    borderBottom: "none",
  },
  username: {
    fontSize: "14px",
    fontWeight: 500, // font-medium
    color: "#111827",
  },
  addressRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginTop: "4px",
  },
  addressButton: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: 0,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: "12px",
    color: "#111827",
    position: "relative",
    width: "100%",
  },
  copiedText: {
    fontSize: "12px",
    color: "#111827",
    position: "absolute",
    left: 0,
    transition: "opacity 150ms",
  },
  addressText: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    transition: "opacity 150ms",
  },
  menuItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    width: "100%",
    padding: 0,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: "14px",
    color: "#111827", // text-gray-900
    textDecoration: "none",
  },
  menuItemHover: {
    color: "#4b5563", // hover:text-gray-600
  },
  disconnectItem: {
    color: "#7f1d1d", // text-red-900
  },
  disconnectItemHover: {
    color: "#b91c1c", // hover:text-red-700
  },
};

/**
 * Truncates an Ethereum address for display
 */
function truncateAddress(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 7)}...${address.slice(-5)}`;
}

/**
 * A user button that shows account info in a popover with options to copy address,
 * view profile, and disconnect.
 *
 * @example
 * ```tsx
 * import { RenownUserButton } from '@renown/sdk'
 *
 * function UserArea() {
 *   const handleDisconnect = () => {
 *     // Your disconnect logic
 *   }
 *   return (
 *     <RenownUserButton
 *       address="0x1234...5678"
 *       username="vitalik.eth"
 *       userId="abc123"
 *       onDisconnect={handleDisconnect}
 *     />
 *   )
 * }
 * ```
 */
export function RenownUserButton({
  address,
  username,
  avatarUrl,
  userId,
  onDisconnect,
  style,
  className,
  renderTrigger,
}: RenownUserButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [showAbove, setShowAbove] = useState(true);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const calculatePosition = useCallback(() => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const spaceAbove = rect.top;
    const hasSpaceAbove = spaceAbove >= POPOVER_HEIGHT + POPOVER_GAP;
    setShowAbove(hasSpaceAbove);
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    calculatePosition();
    setIsOpen(true);
  }, [calculatePosition]);

  const handleMouseLeave = useCallback(() => {
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const copyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy address:", err);
    }
  }, [address]);

  return (
    <div
      ref={wrapperRef}
      style={styles.wrapper}
      className={className}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {renderTrigger ? (
        renderTrigger({
          onMouseEnter: handleMouseEnter,
          onMouseLeave: handleMouseLeave,
          address,
          username,
          avatarUrl,
        })
      ) : (
        <button
          type="button"
          style={{ ...styles.trigger, ...style }}
          aria-label="Open account menu"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" style={styles.avatar} />
          ) : (
            <div style={styles.avatarPlaceholder}>
              <UserIcon size={24} color="#9ca3af" />
            </div>
          )}
        </button>
      )}
      {isOpen && (
        <div
          style={{
            ...styles.popoverBase,
            ...(showAbove
              ? { bottom: `calc(100% + ${POPOVER_GAP}px)` }
              : { top: `calc(100% + ${POPOVER_GAP}px)` }),
          }}
        >
          <div style={styles.section}>
            {username && <div style={styles.username}>{username}</div>}
            <div style={styles.addressRow}>
              <button
                type="button"
                onClick={copyToClipboard}
                style={styles.addressButton}
              >
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    width: "100%",
                  }}
                >
                  <div
                    style={{ ...styles.addressText, opacity: isCopied ? 0 : 1 }}
                  >
                    <span>{truncateAddress(address)}</span>
                    <CopyIcon size={14} color="#9EA0A1" />
                  </div>
                  <div
                    style={{ ...styles.copiedText, opacity: isCopied ? 1 : 0 }}
                  >
                    Copied to clipboard!
                  </div>
                </div>
              </button>
            </div>
          </div>
          {userId && (
            <div style={styles.section}>
              <button
                type="button"
                onClick={() => openRenown(userId)}
                style={styles.menuItem}
              >
                <ExternalLinkIcon size={14} />
                View on Renown
              </button>
            </div>
          )}
          <div style={styles.sectionLast}>
            <button
              type="button"
              onClick={onDisconnect}
              style={{
                ...styles.menuItem,
                ...styles.disconnectItem,
                cursor: onDisconnect ? "pointer" : "wait",
                pointerEvents: onDisconnect ? "auto" : "none",
              }}
            >
              <DisconnectIcon size={14} color="#EA4335" />
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

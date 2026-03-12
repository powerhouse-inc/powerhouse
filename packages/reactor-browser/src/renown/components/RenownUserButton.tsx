import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "../../hooks/renown.js";
import { logout as defaultLogout, openRenown } from "../utils.js";
import {
  ChevronDownIcon,
  CopyIcon,
  DisconnectIcon,
  UserIcon,
} from "./icons.js";
import { Slot } from "./slot.js";

const POPOVER_GAP = 4;
const POPOVER_HEIGHT = 150;

export interface RenownUserButtonMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  style?: CSSProperties;
}

export interface RenownUserButtonProps {
  address?: string;
  username?: string;
  avatarUrl?: string;
  userId?: string;
  onDisconnect?: () => void;
  style?: CSSProperties;
  className?: string;
  asChild?: boolean;
  children?: ReactNode;
  menuItems?: RenownUserButtonMenuItem[];
}

const styles: Record<string, CSSProperties> = {
  wrapper: {
    position: "relative",
    display: "inline-block",
  },
  trigger: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 12px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    cursor: "pointer",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: 500,
    fontFamily: "inherit",
    color: "#111827",
    transition: "background-color 150ms, border-color 150ms",
  },
  triggerHover: {
    backgroundColor: "#f9fafb",
    borderColor: "#9ca3af",
  },
  avatar: {
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    objectFit: "cover",
    flexShrink: 0,
  },
  avatarPlaceholder: {
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #8b5cf6, #3b82f6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarInitial: {
    fontSize: "12px",
    fontWeight: 700,
    color: "#ffffff",
    lineHeight: 1,
  },
  displayName: {
    maxWidth: "120px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  chevron: {
    flexShrink: 0,
    transition: "transform 150ms",
    color: "#6b7280",
  },
  chevronOpen: {
    transform: "rotate(180deg)",
  },
  popoverBase: {
    position: "absolute",
    right: 0,
    backgroundColor: "#ffffff",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08)",
    width: "100%",
    zIndex: 1000,
    color: "#111827",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  header: {
    padding: "12px 16px",
    borderBottom: "1px solid #e5e7eb",
  },
  headerUsername: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#111827",
    margin: 0,
  },
  addressRow: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    marginTop: "4px",
  },
  addressButton: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: 0,
    border: "none",
    backgroundColor: "transparent",
    cursor: "pointer",
    fontSize: "12px",
    color: "#6b7280",
    fontFamily: "inherit",
    position: "relative",
    width: "100%",
  },
  copiedText: {
    fontSize: "12px",
    color: "#059669",
    position: "absolute",
    left: 0,
    transition: "opacity 150ms",
    fontWeight: 500,
  },
  addressText: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    transition: "opacity 150ms",
  },
  menuSection: {
    padding: "4px 0",
  },
  menuItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    width: "100%",
    padding: "8px 16px",
    border: "none",
    backgroundColor: "transparent",
    cursor: "pointer",
    fontSize: "14px",
    color: "#374151",
    textDecoration: "none",
    fontFamily: "inherit",
    transition: "background-color 150ms",
  },
  menuItemHover: {
    backgroundColor: "#f3f4f6",
  },
  disconnectItem: {
    color: "#dc2626",
  },
  separator: {
    height: "1px",
    backgroundColor: "#e5e7eb",
    margin: 0,
    border: "none",
  },
};

function truncateAddress(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 7)}...${address.slice(-5)}`;
}

export function RenownUserButton({
  address: addressProp,
  username: usernameProp,
  avatarUrl: avatarUrlProp,
  userId: userIdProp,
  onDisconnect: onDisconnectProp,
  style,
  className,
  asChild = false,
  children,
  menuItems,
}: RenownUserButtonProps) {
  const user = useUser();

  const address = addressProp ?? user?.address ?? "";
  const username = usernameProp ?? user?.profile?.username ?? user?.ens?.name;
  const avatarUrl =
    avatarUrlProp ?? user?.profile?.userImage ?? user?.ens?.avatarUrl;
  const userId = userIdProp ?? user?.profile?.documentId;
  const onDisconnect = onDisconnectProp ?? (() => void defaultLogout());
  const displayName =
    username ?? (address ? truncateAddress(address) : "Account");
  const profileId = userId ?? address;

  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [showAbove, setShowAbove] = useState(true);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const calculatePosition = useCallback(() => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const spaceAbove = rect.top;
    setShowAbove(spaceAbove >= POPOVER_HEIGHT + POPOVER_GAP);
  }, []);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
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
      setIsHovered(false);
      setHoveredItem(null);
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

  const triggerElement = asChild ? (
    <Slot data-renown-state="authenticated">{children}</Slot>
  ) : (
    <button
      type="button"
      style={{
        ...styles.trigger,
        ...(isHovered ? styles.triggerHover : {}),
        ...style,
      }}
      aria-label="Open account menu"
      data-renown-state="authenticated"
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="Avatar" style={styles.avatar} />
      ) : (
        <div style={styles.avatarPlaceholder}>
          <span style={styles.avatarInitial}>
            {(displayName || "U")[0].toUpperCase()}
          </span>
        </div>
      )}
      <span style={styles.displayName}>{displayName}</span>
      <ChevronDownIcon
        size={14}
        style={{
          ...styles.chevron,
          ...(isOpen ? styles.chevronOpen : {}),
        }}
      />
    </button>
  );

  return (
    <div
      ref={wrapperRef}
      style={styles.wrapper}
      className={className}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {triggerElement}
      {isOpen && (
        <div
          style={{
            ...styles.popoverBase,
            ...(showAbove
              ? { bottom: `calc(100% + ${POPOVER_GAP}px)` }
              : { top: `calc(100% + ${POPOVER_GAP}px)` }),
          }}
        >
          <div style={styles.header}>
            {username && <div style={styles.headerUsername}>{username}</div>}
            {address && (
              <div style={styles.addressRow}>
                <button
                  type="button"
                  onClick={() => void copyToClipboard()}
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
                      style={{
                        ...styles.addressText,
                        opacity: isCopied ? 0 : 1,
                      }}
                    >
                      <span>{truncateAddress(address)}</span>
                      <CopyIcon size={12} color="#9ca3af" />
                    </div>
                    <div
                      style={{
                        ...styles.copiedText,
                        opacity: isCopied ? 1 : 0,
                      }}
                    >
                      Copied!
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>
          <div style={styles.menuSection}>
            {profileId && (
              <button
                type="button"
                onClick={() => openRenown(profileId)}
                onMouseEnter={() => setHoveredItem("profile")}
                onMouseLeave={() => setHoveredItem(null)}
                style={{
                  ...styles.menuItem,
                  ...(hoveredItem === "profile" ? styles.menuItemHover : {}),
                }}
              >
                <UserIcon size={14} color="#6b7280" />
                View Profile
              </button>
            )}
            {menuItems?.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                onMouseEnter={() => setHoveredItem(item.label)}
                onMouseLeave={() => setHoveredItem(null)}
                style={{
                  ...styles.menuItem,
                  ...(hoveredItem === item.label ? styles.menuItemHover : {}),
                  ...item.style,
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
          <hr style={styles.separator} />
          <div style={styles.menuSection}>
            <button
              type="button"
              onClick={onDisconnect}
              onMouseEnter={() => setHoveredItem("disconnect")}
              onMouseLeave={() => setHoveredItem(null)}
              style={{
                ...styles.menuItem,
                ...styles.disconnectItem,
                ...(hoveredItem === "disconnect" ? styles.menuItemHover : {}),
              }}
            >
              <DisconnectIcon size={14} color="#dc2626" />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

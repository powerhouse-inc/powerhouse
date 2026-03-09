"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { openRenown } from "../utils.js";
import { RenownLogo, SpinnerIcon } from "./icons.js";
import { renownShortDataUrl, renownShortHoverDataUrl } from "./image-data.js";

export interface RenownLoginButtonProps {
  onLogin?: () => void;
  darkMode?: boolean;
  style?: CSSProperties;
  className?: string;
  renderTrigger?: (props: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    isLoading: boolean;
  }) => ReactNode;
  showPopover?: boolean;
}

const POPOVER_GAP = 8;
const POPOVER_HEIGHT = 120;

const styles: Record<string, CSSProperties> = {
  trigger: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    border: "none",
    background: "transparent",
    cursor: "pointer",
  },
  popoverBase: {
    position: "absolute",
    left: 0,
    borderRadius: "8px",
    width: "208px",
    zIndex: 1000,
  },
  popoverLight: {
    backgroundColor: "white",
    boxShadow:
      "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
  },
  popoverDark: {
    backgroundColor: "#1f2937",
    boxShadow:
      "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)",
  },
  popoverContent: {
    padding: "16px",
  },
  logoContainer: {
    display: "flex",
    justifyContent: "center",
    height: "22px",
    width: "83px",
    margin: "0 auto 16px",
    overflow: "hidden",
  },
  connectButtonBase: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "28px",
    borderRadius: "8px",
    backgroundColor: "transparent",
    fontSize: "14px",
    cursor: "pointer",
    marginTop: "16px",
  },
  connectButtonLight: {
    border: "1px solid #d1d5db",
    color: "#111827",
  },
  connectButtonDark: {
    border: "1px solid #4b5563",
    color: "#f9fafb",
  },
  wrapper: {
    position: "relative",
    display: "inline-block",
  },
  triggerImageLight: {
    display: "block",
  },
  triggerImageDark: {
    display: "block",
    filter: "invert(1)",
  },
};

export function RenownLoginButton({
  onLogin: onLoginProp,
  darkMode = false,
  style,
  className,
  renderTrigger,
  showPopover = false,
}: RenownLoginButtonProps) {
  const onLogin = onLoginProp ?? (() => openRenown());
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showAbove, setShowAbove] = useState(true);
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
    if (!showPopover) return;
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    calculatePosition();
    setIsOpen(true);
  }, [calculatePosition, showPopover]);

  const handleMouseLeave = useCallback(() => {
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
      setIsHovered(false);
    }, 150);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const handleConnect = () => {
    setIsLoading(true);
    onLogin();
  };

  const handleDirectClick = () => {
    if (!showPopover && !isLoading) {
      setIsLoading(true);
      onLogin();
    }
  };

  const triggerStyle: CSSProperties = {
    ...styles.trigger,
    cursor: !isLoading ? "pointer" : "wait",
    ...style,
  };

  const allowLogin = !isLoading && !!onLogin;

  const connectButtonStyle: CSSProperties = {
    ...styles.connectButtonBase,
    ...(darkMode ? styles.connectButtonDark : styles.connectButtonLight),
    cursor: allowLogin ? "pointer" : "wait",
  };

  const popoverStyle: CSSProperties = {
    ...styles.popoverBase,
    ...(darkMode ? styles.popoverDark : styles.popoverLight),
    ...(showAbove
      ? { bottom: `calc(100% + ${POPOVER_GAP}px)` }
      : { top: `calc(100% + ${POPOVER_GAP}px)` }),
  };

  const triggerImageStyle = darkMode
    ? styles.triggerImageDark
    : styles.triggerImageLight;

  const logoColor = darkMode ? "#f9fafb" : "#374151";

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
          isLoading,
        })
      ) : (
        <button
          type="button"
          style={triggerStyle}
          aria-label={showPopover ? "Open Renown Login" : "Login with Renown"}
          onClick={showPopover ? undefined : handleDirectClick}
        >
          {isLoading ? (
            <SpinnerIcon size={42} />
          ) : (
            <img
              width={42}
              height={42}
              src={isHovered ? renownShortHoverDataUrl : renownShortDataUrl}
              alt="Renown Login"
              style={triggerImageStyle}
            />
          )}
        </button>
      )}
      {isOpen && showPopover && (
        <div style={popoverStyle}>
          <div style={styles.popoverContent}>
            <div style={styles.logoContainer}>
              <RenownLogo width={83} height={22} color={logoColor} />
            </div>
            <button
              type="button"
              onClick={allowLogin ? handleConnect : undefined}
              style={connectButtonStyle}
            >
              {isLoading ? <SpinnerIcon size={14} /> : "Connect"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import type { CSSProperties, ReactNode } from "react";
import { useState, useRef, useEffect } from "react";
import { renownShortDataUrl, renownShortHoverDataUrl } from "./image-data.js";
import { RenownLogo, SpinnerIcon } from "./icons.js";

export interface RenownLoginButtonProps {
  /**
   * Callback when login is requested
   */
  onLogin: (() => void) | undefined;
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
    onClick: () => void;
    isLoading: boolean;
  }) => ReactNode;
}

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
  popover: {
    position: "absolute",
    bottom: "calc(100% + 8px)",
    left: 0,
    backgroundColor: "white",
    borderRadius: "8px",
    boxShadow:
      "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
    width: "208px", // w-52
    zIndex: 1000,
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
  connectButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "28px", // h-7
    border: "1px solid #d1d5db", // border-gray-300
    borderRadius: "8px",
    backgroundColor: "transparent",
    fontSize: "14px",
    color: "#111827",
    cursor: "pointer",
    marginTop: "16px",
  },
  connectButtonActive: {
    opacity: 0.7,
  },
  wrapper: {
    position: "relative",
    display: "inline-block",
  },
};

/**
 * A login button with Renown branding that shows a popover with connect option.
 *
 * @example
 * ```tsx
 * import { RenownLoginButton } from '@renown/sdk'
 *
 * function LoginArea() {
 *   const handleLogin = () => {
 *     // Your login logic
 *   }
 *   return <RenownLoginButton onLogin={handleLogin} />
 * }
 * ```
 */
export function RenownLoginButton({
  onLogin,
  style,
  className,
  renderTrigger,
}: RenownLoginButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleConnect = () => {
    if (onLogin) {
      setIsLoading(true);
      onLogin();
    }
  };

  const triggerStyle: CSSProperties = {
    ...styles.trigger,
    cursor: onLogin ? "pointer" : "wait",
    ...style,
  };

  const allowLogin = !isLoading && !!onLogin;

  const connectButtonStyle: CSSProperties = {
    ...styles.connectButton,
    cursor: allowLogin ? "pointer" : "wait",
  };

  return (
    <div style={styles.wrapper} className={className}>
      {renderTrigger ? (
        renderTrigger({ onClick: () => setIsOpen(!isOpen), isLoading })
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={triggerStyle}
          aria-label="Open Renown Login"
        >
          <img
            width={42}
            height={42}
            src={isHovered ? renownShortHoverDataUrl : renownShortDataUrl}
            alt="Renown Login"
            style={{ display: "block" }}
          />
        </button>
      )}
      {isOpen && (
        <div ref={popoverRef} style={styles.popover}>
          <div style={styles.popoverContent}>
            <div style={styles.logoContainer}>
              <RenownLogo width={83} height={22} color="#374151" />
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

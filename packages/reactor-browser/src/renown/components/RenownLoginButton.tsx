import type { CSSProperties, ReactNode } from "react";
import { useCallback, useState } from "react";
import { openRenown } from "../utils.js";
import { SpinnerIcon } from "./icons.js";
import { Slot } from "./slot.js";

export interface RenownLoginButtonProps {
  onLogin?: () => void;
  darkMode?: boolean;
  style?: CSSProperties;
  className?: string;
  asChild?: boolean;
  children?: ReactNode;
}

const lightStyles = {
  trigger: {
    backgroundColor: "#ffffff",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#d1d5db",
    color: "#111827",
  },
  triggerHover: {
    backgroundColor: "#ecf3f8",
    borderColor: "#9ca3af",
  },
} as const;

const darkStyles = {
  trigger: {
    backgroundColor: "#1f2937",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#4b5563",
    color: "#ecf3f8",
  },
  triggerHover: {
    backgroundColor: "#374151",
    borderColor: "#6b7280",
  },
} as const;

const styles: Record<string, CSSProperties> = {
  wrapper: {
    position: "relative",
    display: "inline-block",
  },
  trigger: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "8px 32px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: 500,
    fontFamily: "inherit",
    lineHeight: "20px",
    transition: "background-color 150ms, border-color 150ms",
  },
};

export function RenownLoginButton({
  onLogin: onLoginProp,
  darkMode = false,
  style,
  className,
  asChild = false,
  children,
}: RenownLoginButtonProps) {
  const onLogin = onLoginProp ?? (() => openRenown());
  const [isLoading, setIsLoading] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

  const handleClick = () => {
    if (!isLoading) {
      setIsLoading(true);
      onLogin();
    }
  };

  const themeStyles = darkMode ? darkStyles : lightStyles;

  const triggerStyle: CSSProperties = {
    ...styles.trigger,
    ...themeStyles.trigger,
    ...(isHovered && !isLoading ? themeStyles.triggerHover : {}),
    cursor: isLoading ? "wait" : "pointer",
    ...style,
  };

  const triggerElement = asChild ? (
    <Slot
      onClick={handleClick}
      data-renown-state="login"
      {...(isLoading ? { "data-loading": "" } : {})}
    >
      {children}
    </Slot>
  ) : (
    <button
      type="button"
      style={triggerStyle}
      aria-label="Log in with Renown"
      onClick={handleClick}
      data-renown-state="login"
      {...(isLoading ? { "data-loading": "" } : {})}
    >
      {isLoading ? <SpinnerIcon size={16} /> : <span>Log in</span>}
    </button>
  );

  return (
    <div
      style={styles.wrapper}
      className={className}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {triggerElement}
    </div>
  );
}

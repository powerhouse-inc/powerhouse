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

const colorStyles = {
  trigger: {
    backgroundColor: "var(--card, #ffffff)",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--border, #d1d5db)",
    color: "var(--card-foreground, #111827)",
  },
  triggerHover: {
    backgroundColor: "var(--accent, #ecf3f8)",
    borderColor: "var(--border, #d1d5db)",
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

  const themeStyles = colorStyles;

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

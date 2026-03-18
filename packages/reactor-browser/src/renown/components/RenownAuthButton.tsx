import type { ReactNode } from "react";
import { type RenownAuth, useRenownAuth } from "../use-renown-auth.js";
import { RenownLoginButton } from "./RenownLoginButton.js";
import { RenownUserButton } from "./RenownUserButton.js";

export interface RenownAuthButtonProps {
  className?: string;
  darkMode?: boolean;
  loginContent?: ReactNode;
  userContent?: ReactNode;
  loadingContent?: ReactNode;
  children?: (auth: RenownAuth) => ReactNode;
}

export function RenownAuthButton({
  className = "",
  darkMode,
  loginContent,
  userContent,
  loadingContent,
  children,
}: RenownAuthButtonProps) {
  const auth = useRenownAuth();

  if (children) {
    return <>{children(auth)}</>;
  }

  if (auth.status === "loading" || auth.status === "checking") {
    if (loadingContent) {
      return <div className={className}>{loadingContent}</div>;
    }

    return (
      <div className={className}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 12px",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
          }}
        >
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              backgroundColor: "#e5e7eb",
            }}
          />
          <div
            style={{
              width: "80px",
              height: "14px",
              borderRadius: "4px",
              backgroundColor: "#e5e7eb",
            }}
          />
        </div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  if (auth.status === "authorized") {
    if (userContent) {
      return <div className={className}>{userContent}</div>;
    }

    return (
      <div className={className}>
        <RenownUserButton />
      </div>
    );
  }

  if (loginContent) {
    return <div className={className}>{loginContent}</div>;
  }

  return (
    <div className={className}>
      <RenownLoginButton darkMode={darkMode} />
    </div>
  );
}

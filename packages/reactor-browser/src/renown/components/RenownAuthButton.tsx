"use client";

import type { User } from "@renown/sdk";
import type React from "react";
import { useLoginStatus, useUser } from "../../hooks/renown.js";
import { logout, openRenown } from "../utils.js";
import { RenownLoginButton } from "./RenownLoginButton.js";
import { RenownUserButton } from "./RenownUserButton.js";

export interface RenownAuthButtonRenderProps {
  user: User;
  logout: () => Promise<void>;
  openProfile: () => void;
}

export interface RenownAuthButtonProps {
  className?: string;
  renderAuthenticated?: (props: RenownAuthButtonRenderProps) => React.ReactNode;
  renderUnauthenticated?: (props: {
    openRenown: () => void;
    isLoading: boolean;
  }) => React.ReactNode;
  renderLoading?: () => React.ReactNode;
}

export function RenownAuthButton({
  className = "",
  renderAuthenticated,
  renderUnauthenticated,
  renderLoading,
}: RenownAuthButtonProps) {
  const user = useUser();
  const loginStatus = useLoginStatus();
  const isLoading = loginStatus === "checking";

  const openProfile = () => {
    if (!user) return;
    openRenown(user.profile?.documentId);
  };

  if (isLoading) {
    if (renderLoading) {
      return <div className={className}>{renderLoading()}</div>;
    }

    return (
      <div className={className}>
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            backgroundColor: "#e5e7eb",
            animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
          }}
        />
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  if (loginStatus === "authorized" && user) {
    if (renderAuthenticated) {
      return (
        <div className={className}>
          {renderAuthenticated({ user, logout, openProfile })}
        </div>
      );
    }

    return (
      <div className={className}>
        <RenownUserButton />
      </div>
    );
  }

  if (renderUnauthenticated) {
    return (
      <div className={className}>
        {renderUnauthenticated({ openRenown: () => openRenown(), isLoading })}
      </div>
    );
  }

  return (
    <div className={className}>
      <RenownLoginButton />
    </div>
  );
}

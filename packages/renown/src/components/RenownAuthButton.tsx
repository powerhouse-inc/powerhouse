"use client";

import React from "react";
import { useUser } from "../hooks/use-user.js";
import type { User } from "../lib/renown/index.js";
import { RenownLoginButton } from "./RenownLoginButton.js";
import { RenownUserButton } from "./RenownUserButton.js";

export interface RenownAuthButtonRenderProps {
  user: User;
  logout: () => Promise<void>;
  openProfile: () => void;
}

export interface RenownAuthButtonProps {
  /**
   * Custom class name for the container
   */
  className?: string;
  /**
   * Base URL for the profile page
   * @default "https://www.renown.id/profile"
   */
  profileBaseUrl?: string;
  /**
   * Custom render function when user is authenticated
   * Receives user data, logout function, and openProfile function
   */
  renderAuthenticated?: (props: RenownAuthButtonRenderProps) => React.ReactNode;
  /**
   * Custom render function when user is not authenticated
   * Receives openRenown function
   */
  renderUnauthenticated?: (props: {
    openRenown: () => void;
    isLoading: boolean;
  }) => React.ReactNode;
  /**
   * Custom render function for loading state
   */
  renderLoading?: () => React.ReactNode;
}

/**
 * Smart authentication button that adapts based on auth state.
 * Shows RenownLoginButton when not authenticated, and RenownUserButton when authenticated.
 *
 * @example
 * Basic usage:
 * ```tsx
 * import { RenownAuthButton } from '@renown/sdk'
 *
 * function Header() {
 *   return <RenownAuthButton />
 * }
 * ```
 *
 * @example
 * Custom rendering:
 * ```tsx
 * <RenownAuthButton
 *   renderAuthenticated={({ user, logout }) => (
 *     <div>
 *       <span>{user.name}</span>
 *       <button onClick={logout}>Sign out</button>
 *     </div>
 *   )}
 *   renderUnauthenticated={({ openRenown }) => (
 *     <button onClick={openRenown}>Sign In</button>
 *   )}
 * />
 * ```
 */
export function RenownAuthButton({
  className = "",
  profileBaseUrl = "https://www.renown.id/profile",
  renderAuthenticated,
  renderUnauthenticated,
  renderLoading,
}: RenownAuthButtonProps) {
  const { user, loginStatus, isLoading, openRenown, logout } = useUser();

  const openProfile = () => {
    if (!user) return;
    const identifier = user.ethAddress || user.address || user.name;
    if (identifier) {
      window.open(`${profileBaseUrl}/${identifier}`, "_blank");
    }
  };

  // Loading state
  if (isLoading && loginStatus === "initial") {
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

  // Authenticated state
  if (loginStatus === "authorized" && user) {
    if (renderAuthenticated) {
      return (
        <div className={className}>
          {renderAuthenticated({ user, logout, openProfile })}
        </div>
      );
    }

    const address = (user.ethAddress || user.address) as string | undefined;

    if (!address) {
      // Fallback if no address available
      return (
        <div className={className}>
          <button
            onClick={logout}
            style={{
              fontSize: "14px",
              color: "#4b5563",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            {user.name || "Connected"} (Logout)
          </button>
        </div>
      );
    }

    const profileUrl = `${profileBaseUrl}/${address}`;

    return (
      <div className={className}>
        <RenownUserButton
          address={address}
          username={user.name}
          profileUrl={profileUrl}
          avatarUrl={user.avatar}
          onDisconnect={logout}
        />
      </div>
    );
  }

  // Unauthenticated state
  if (renderUnauthenticated) {
    return (
      <div className={className}>
        {renderUnauthenticated({ openRenown, isLoading })}
      </div>
    );
  }

  return (
    <div className={className}>
      <RenownLoginButton onLogin={openRenown} />
    </div>
  );
}

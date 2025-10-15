import React from 'react'
import type { LoginAvatarProps } from './types.js'

/**
 * Headless Renown Login Avatar component
 * Provides login button when not authenticated, and user avatar when authenticated
 *
 * @example
 * ```tsx
 * <RenownLoginAvatar
 *   isLoggedIn={true}
 *   user={{ username: 'alice', avatar: 'https://...', ethAddress: '0x...' }}
 *   onLoginClick={() => console.log('Login')}
 *   profileBaseUrl="https://renown.io"
 *   renderAvatar={({ user, onClick }) => (
 *     <img src={user.avatar} alt={user.username} onClick={onClick} />
 *   )}
 *   renderButton={({ onClick }) => (
 *     <button onClick={onClick}>Log in</button>
 *   )}
 * />
 * ```
 */
export interface RenownLoginAvatarProps extends LoginAvatarProps {
  /**
   * Custom render function for the avatar when logged in
   */
  renderAvatar?: (props: {
    user: NonNullable<LoginAvatarProps['user']>
    onClick: () => void
  }) => React.ReactNode

  /**
   * Custom render function for the login button when not logged in
   */
  renderButton?: (props: { onClick: () => void }) => React.ReactNode

  /**
   * Base URL for the profile page (e.g., "https://renown.io/profile")
   * Defaults to "https://renown.io/profile"
   */
  profileBaseUrl?: string
}

export function RenownLoginAvatar({
  isLoggedIn,
  user,
  onLoginClick,
  profileBaseUrl = 'https://renown.io/profile',
  renderAvatar,
  renderButton,
}: RenownLoginAvatarProps) {
  if (isLoggedIn && user) {
    const handleProfileClick = () => {
      const identifier = user.ethAddress || user.username
      window.open(`${profileBaseUrl}/${identifier}`, '_blank')
    }

    if (renderAvatar) {
      return <>{renderAvatar({ user, onClick: handleProfileClick })}</>
    }

    // Default avatar rendering
    return (
      <div
        onClick={handleProfileClick}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          cursor: 'pointer',
        }}
      >
        {user.avatar ? (
          <img
            src={user.avatar}
            alt={user.username}
            style={{
              width: '2.5rem',
              height: '2.5rem',
              borderRadius: '50%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div
            style={{
              width: '2.5rem',
              height: '2.5rem',
              borderRadius: '50%',
              backgroundColor: '#9333ea',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '0.875rem',
            }}
          >
            {user.username.substring(0, 2).toUpperCase()}
          </div>
        )}
        <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>{user.username}</span>
      </div>
    )
  }

  if (renderButton) {
    return <>{renderButton({ onClick: onLoginClick || (() => {}) })}</>
  }

  // Default button rendering
  return (
    <button
      onClick={onLoginClick}
      style={{
        padding: '0.5rem 1rem',
        border: '1px solid #d1d5db',
        borderRadius: '0.375rem',
        backgroundColor: 'white',
        cursor: 'pointer',
        fontSize: '0.875rem',
        fontWeight: '500',
      }}
    >
      Log in
    </button>
  )
}

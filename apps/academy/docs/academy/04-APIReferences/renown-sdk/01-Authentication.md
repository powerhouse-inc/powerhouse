# Authentication Guide

Comprehensive guide to implementing authentication with the Renown SDK.

## Table of Contents

- [Overview](#overview)
- [Authentication Flow](#authentication-flow)
- [Setup](#setup)
- [Implementation](#implementation)
- [Advanced Patterns](#advanced-patterns)
- [Security Considerations](#security-considerations)

## Overview

The Renown SDK provides a complete authentication system that:

1. **Auto-initializes** the Renown SDK and ConnectCrypto (zero configuration!)
2. **Manages** user sessions across page reloads
3. **Handles** authentication redirects from Renown portal
4. **Fetches** user profile data automatically
5. **Provides** React hooks, components, and context for easy integration

## Authentication Flow

### 1. Initial Load

```
User visits app
    ↓
RenownUserProvider initializes
    ↓
Check sessionStorage for existing session
    ↓
├─ Session found → Restore user → Authorized
└─ No session → Check URL params → Initialize SDK → Not Authorized
```

### 2. Login Flow

```
User clicks "Login"
    ↓
openRenown() called
    ↓
Redirect to Renown Portal
    ↓
User authenticates
    ↓
Redirect back to app with DID
    ↓
handleRenownReturn() processes
    ↓
login() called
    ↓
Fetch user profile
    ↓
Store in sessionStorage
    ↓
Update auth state → Authorized
```

### 3. Session Restoration

```
User refreshes page
    ↓
RenownUserProvider checks sessionStorage
    ↓
Valid session found
    ↓
Fetch latest profile data
    ↓
Restore auth state → Authorized
```

## Setup

### Step 1: Wrap Your App with RenownUserProvider

The RenownUserProvider automatically initializes the Renown SDK - no manual setup required!

```typescript
// app/layout.tsx (Next.js App Router)
import { RenownUserProvider } from '@renown/sdk'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <RenownUserProvider>
          {children}
        </RenownUserProvider>
      </body>
    </html>
  )
}
```

That's it! The SDK is now initialized and ready to use.

### Optional: Customize Configuration

You can customize the Renown URL, network, and chain:

```typescript
<RenownUserProvider
  renownUrl={process.env.NEXT_PUBLIC_RENOWN_URL || 'https://www.renown.id'}
  networkId="eip155"
  chainId="1"
>
  {children}
</RenownUserProvider>
```

### Optional: Add Loading/Error Screens

Provide custom UI for initialization states:

```typescript
<RenownUserProvider
  loadingComponent={
    <div className="loading-screen">
      <Spinner />
      <p>Initializing authentication...</p>
    </div>
  }
  errorComponent={(error, retry) => (
    <div className="error-screen">
      <h2>Authentication Failed</h2>
      <p>{error.message}</p>
      <button onClick={retry}>Try Again</button>
    </div>
  )}
>
  {children}
</RenownUserProvider>
```

## Implementation

### Using the RenownAuthButton Component

The simplest way to add authentication is to use the built-in `RenownAuthButton` component:

```typescript
'use client'

import { RenownAuthButton } from '@renown/sdk'

export function Header() {
  return (
    <header>
      <h1>My App</h1>
      <RenownAuthButton showLogoutButton showUsername />
    </header>
  )
}
```

### Custom Login Component with useUser Hook

For full control, build your own component using the `useUser` hook:

```typescript
'use client'

import { useUser } from '@renown/sdk'

export function CustomRenownAuthButton() {
  const { user, loginStatus, isLoading, openRenown, logout } = useUser()

  if (isLoading) {
    return (
      <button disabled>
        <Spinner />
        Loading...
      </button>
    )
  }

  if (loginStatus === 'authorized' && user) {
    return (
      <div className="flex items-center gap-2">
        {user.avatar && (
          <img
            src={user.avatar}
            alt={user.name || 'User'}
            className="w-8 h-8 rounded-full"
          />
        )}
        <span>{user.name || user.did.slice(0, 15)}...</span>
        <button onClick={logout}>Logout</button>
      </div>
    )
  }

  return (
    <button onClick={openRenown}>
      Login with Renown
    </button>
  )
}
```

### Protected Route Component

```typescript
'use client'

import { useUser } from '@renown/sdk'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loginStatus, isLoading, openRenown } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && loginStatus !== 'authorized') {
      // Redirect to login or show login prompt
      router.push('/login')
    }
  }, [isLoading, loginStatus, router])

  if (isLoading) {
    return <div>Loading...</div>
  }

  if (loginStatus !== 'authorized' || !user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h1>Authentication Required</h1>
        <p>Please log in to access this page</p>
        <button onClick={openRenown}>Login</button>
      </div>
    )
  }

  return <>{children}</>
}
```

### User Profile Display

```typescript
'use client'

import { useUser } from '@renown/sdk'

export function UserProfile() {
  const { user, logout } = useUser()

  if (!user) return null

  return (
    <div className="profile-card">
      <header>
        {user.avatar && (
          <img
            src={user.avatar}
            alt={user.name || 'User avatar'}
            className="avatar"
          />
        )}
        <h2>{user.name || 'Anonymous User'}</h2>
      </header>

      <dl className="profile-details">
        <dt>DID</dt>
        <dd>{user.did}</dd>

        {user.ethAddress && (
          <>
            <dt>Ethereum Address</dt>
            <dd>{user.ethAddress}</dd>
          </>
        )}

        {user.email && (
          <>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </>
        )}
      </dl>

      <button onClick={logout}>Logout</button>
    </div>
  )
}
```

## Advanced Patterns

### Conditional Navigation Based on Auth

```typescript
'use client'

import { useUser } from '@renown/sdk'
import Link from 'next/link'

export function Navigation() {
  const { user, loginStatus } = useUser()

  const isAuthorized = loginStatus === 'authorized'

  return (
    <nav>
      <Link href="/">Home</Link>

      {isAuthorized ? (
        <>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/profile">Profile</Link>
          <Link href="/settings">Settings</Link>
        </>
      ) : (
        <>
          <Link href="/about">About</Link>
          <Link href="/pricing">Pricing</Link>
        </>
      )}
    </nav>
  )
}
```

### Auth State Listener

```typescript
'use client'

import { useUser } from '@renown/sdk'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'

export function AuthStateListener() {
  const { user, loginStatus } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (loginStatus === 'authorized' && user) {
      // User just logged in
      toast.success(`Welcome back, ${user.name || 'User'}!`)

      // Track analytics
      analytics.identify(user.did, {
        name: user.name,
        ethAddress: user.ethAddress,
      })

      // Redirect to dashboard
      router.push('/dashboard')
    }
  }, [loginStatus, user, router])

  useEffect(() => {
    if (loginStatus === 'not-authorized') {
      // User logged out
      toast.info('You have been logged out')

      // Clear analytics
      analytics.reset()

      // Redirect to home
      router.push('/')
    }
  }, [loginStatus, router])

  return null // This is a listener component
}
```

### Custom Auth Hook with Additional Logic

```typescript
'use client'

import { useUser as useRenownAuth } from '@renown/sdk'
import { useEffect, useState } from 'react'

interface ExtendedAuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  hasCompletedProfile: boolean
  login: () => void
  logout: () => Promise<void>
}

export function useUser(): ExtendedAuthState {
  const auth = useRenownAuth()
  const [hasCompletedProfile, setHasCompletedProfile] = useState(false)

  useEffect(() => {
    if (auth.user) {
      // Check if user has completed their profile
      const isComplete = !!(
        auth.user.name &&
        auth.user.avatar &&
        auth.user.email
      )
      setHasCompletedProfile(isComplete)
    } else {
      setHasCompletedProfile(false)
    }
  }, [auth.user])

  return {
    user: auth.user,
    isAuthenticated: auth.loginStatus === 'authorized',
    isLoading: auth.isLoading,
    hasCompletedProfile,
    login: auth.openRenown,
    logout: auth.logout,
  }
}
```

### Role-Based Access Control

```typescript
'use client'

import { useUser } from '@renown/sdk'
import { ReactNode } from 'react'

interface RBACProps {
  children: ReactNode
  allowedRoles?: string[]
  fallback?: ReactNode
}

export function RoleBasedAccess({
  children,
  allowedRoles = [],
  fallback = <div>Access Denied</div>
}: RBACProps) {
  const { user, loginStatus } = useUser()

  if (loginStatus !== 'authorized' || !user) {
    return fallback
  }

  // Check user roles (you'd fetch this from your backend)
  const userRoles = getUserRoles(user.did) // Implement this

  const hasAccess = allowedRoles.length === 0 ||
    allowedRoles.some(role => userRoles.includes(role))

  return hasAccess ? <>{children}</> : fallback
}

// Usage
function AdminPanel() {
  return (
    <RoleBasedAccess allowedRoles={['admin', 'moderator']}>
      <h1>Admin Panel</h1>
      {/* Admin content */}
    </RoleBasedAccess>
  )
}
```

## Security Considerations

### 1. Token Storage

The SDK stores session data in `sessionStorage` (not `localStorage`) for security:

- ✅ Session data clears when tab closes
- ✅ Not accessible across tabs
- ✅ Not persisted across browser sessions
- ✅ Protected from XSS via httpOnly (for API tokens)

### 2. DID Validation

Always validate DIDs before processing:

```typescript
function isValidDID(did: string): boolean {
  // Must start with did:pkh:
  if (!did.startsWith('did:pkh:')) return false

  // Must have correct number of parts
  const parts = did.split(':')
  if (parts.length !== 5) return false

  // Validate ethereum address format
  const address = parts[4]
  if (!address.match(/^0x[a-fA-F0-9]{40}$/)) return false

  return true
}
```

### 3. Secure Communication

Always use HTTPS for Renown URLs:

```typescript
const RENOWN_URL = process.env.NEXT_PUBLIC_RENOWN_URL

if (RENOWN_URL && !RENOWN_URL.startsWith('https://')) {
  console.warn('WARNING: Renown URL should use HTTPS')
}
```

### 4. Session Timeout

Implement session timeout for security:

```typescript
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000 // 24 hours

function isSessionValid(timestamp: number): boolean {
  const now = Date.now()
  const age = now - timestamp
  return age < SESSION_TIMEOUT
}
```

### 5. Server-Side Verification

**Never trust client-side auth alone**. Always verify on the server:

```typescript
// Server-side API route
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')

  if (!authHeader) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Verify the JWT/credential with Renown
  const isValid = await verifyRenownCredential(authHeader)

  if (!isValid) {
    return new Response('Invalid credentials', { status: 403 })
  }

  // Proceed with authorized request
  return Response.json({ data: 'Protected data' })
}
```

## Best Practices

### 1. Handle Loading States

Always handle loading states to provide good UX:

```typescript
function MyComponent() {
  const { user, isLoading, loginStatus } = useUser()

  if (isLoading) {
    return <Skeleton /> // Show skeleton/spinner
  }

  // Now safe to use user/loginStatus
}
```

### 2. Graceful Degradation

Provide fallbacks for unauthenticated users:

```typescript
function FeatureSection() {
  const { user } = useUser()

  return (
    <section>
      {user ? (
        <PersonalizedContent user={user} />
      ) : (
        <GenericContent />
      )}
    </section>
  )
}
```

### 3. Cleanup on Unmount

Clean up subscriptions and listeners:

```typescript
useEffect(() => {
  const handleAuthChange = () => {
    // Handle auth changes
  }

  // Subscribe to auth events
  const unsubscribe = subscribeToAuthEvents(handleAuthChange)

  return () => {
    unsubscribe() // Cleanup
  }
}, [])
```

### 4. Error Boundaries

Wrap auth components in error boundaries:

```typescript
<ErrorBoundary fallback={<AuthError />}>
  <RenownUserProvider>
    <App />
  </RenownUserProvider>
</ErrorBoundary>
```

## Troubleshooting

### Issue: Auth state not updating

**Cause:** Component not re-rendering when auth changes

**Solution:** Ensure you're using `useUser()` hook, not accessing `window.renown` directly

```typescript
// ❌ Wrong
const user = window.renown?.user

// ✅ Correct
const { user } = useUser()
```

### Issue: Session not persisting

**Cause:** SessionStorage might be disabled or cleared

**Solution:** Check browser settings and handle gracefully

```typescript
try {
  SessionStorageManager.setUserData(data)
} catch (error) {
  console.warn('SessionStorage not available:', error)
  // Fallback to in-memory storage
}
```

### Issue: Multiple login popups

**Cause:** `openRenown()` called multiple times

**Solution:** Debounce the login button

```typescript
const handleLogin = useCallback(
  debounce(() => {
    openRenown()
  }, 1000),
  [openRenown]
)
```

## Next Steps

- Read the [API Reference](./02-APIReference.md) for detailed documentation

# Renown SDK

A comprehensive SDK for integrating Renown authentication and user profile management into your React applications.

## Features

- 🔐 **Authentication** - Complete authentication flow with session management
- 👤 **User Profiles** - Fetch and manage user profile data
- ⚛️ **React Integration** - Provider and hooks for seamless React integration
- 🎨 **UI Component** - Ready-to-use RenownAuthButton component
- 🔄 **Session Persistence** - Automatic session restoration across page reloads
- 🌐 **Renown Portal** - Easy integration with Renown authentication portal
- 📦 **Type-Safe** - Full TypeScript support
- 🎯 **Headless** - Customizable UI with optional render props

## Installation

```bash
npm install @renown/sdk
# or
yarn add @renown/sdk
# or
pnpm add @renown/sdk
```

## Quick Start

### 1. Wrap Your App with UserProvider

The UserProvider automatically initializes the SDK - no manual setup needed!

```typescript
// app/layout.tsx or app.tsx
import { UserProvider } from '@renown/sdk'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <UserProvider>
          {children}
        </UserProvider>
      </body>
    </html>
  )
}
```

Optional: Customize with loading/error components:

```typescript
<UserProvider
  loadingComponent={
    <div className="loading-screen">
      <Spinner />
      <p>Initializing...</p>
    </div>
  }
  errorComponent={(error, retry) => (
    <div className="error-screen">
      <h2>Failed to initialize</h2>
      <p>{error.message}</p>
      <button onClick={retry}>Try Again</button>
    </div>
  )}
>
  {children}
</UserProvider>
```

### 2. Use Authentication in Components

```typescript
// components/Header.tsx
import { RenownAuthButton } from '@renown/sdk'

export function Header() {
  return (
    <header>
      <h1>My App</h1>
      <RenownAuthButton showLogoutButton />
    </header>
  )
}
```

Or use the `useUser` hook for custom implementations:

```typescript
// components/CustomAuth.tsx
import { useUser } from '@renown/sdk'

export function CustomAuth() {
  const { user, loginStatus, openRenown, logout } = useUser()

  if (user) {
    return (
      <div>
        <p>Welcome, {user.name || user.did}</p>
        <button onClick={logout}>Logout</button>
      </div>
    )
  }

  return <button onClick={openRenown}>Login with Renown</button>
}
```

## Documentation Structure

- **[Authentication Guide](./01-Authentication.md)** - Comprehensive guide to implementing authentication
- **[API Reference](./02-APIReference.md)** - Complete API documentation

## Key Concepts

### UserProvider

The `<UserProvider>` component is the central authentication provider that manages auth state across your application. It must wrap your application to provide authentication context.

### useUser Hook

The `useUser()` hook provides access to authentication state and methods throughout your application. It can only be used within an `<UserProvider>`.

### Session Management

The SDK automatically manages user sessions using sessionStorage, allowing users to stay logged in across page reloads within the same browser session.

### Profile Data

User profile data is automatically fetched from the Renown API after successful authentication, enriching the user object with display name, avatar, and other profile information.

### UI Component

The SDK provides a ready-to-use component:
- **RenownAuthButton** - Smart component that adapts to auth state (shows login button or user info)

This component is optional - you can build your own UI using the `useUser` hook.

## Examples

### Next.js App Router

```typescript
// app/layout.tsx - Minimal setup
import { UserProvider } from '@renown/sdk'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <UserProvider>
          {children}
        </UserProvider>
      </body>
    </html>
  )
}

// components/Navbar.tsx - Using RenownAuthButton component
'use client'

import { RenownAuthButton } from '@renown/sdk'

export function Navbar() {
  return (
    <nav>
      <h1>My App</h1>
      <RenownAuthButton showLogoutButton showUsername />
    </nav>
  )
}

// app/profile/page.tsx - Using useUser hook
'use client'

import { useUser } from '@renown/sdk'

export default function ProfilePage() {
  const { user, openRenown, logout } = useUser()

  if (!user) {
    return (
      <div>
        <h1>Login Required</h1>
        <button onClick={openRenown}>Login with Renown</button>
      </div>
    )
  }

  return (
    <div>
      <h1>Profile</h1>
      <p>DID: {user.did}</p>
      <p>Name: {user.name}</p>
      {user.avatar && <img src={user.avatar} alt="Avatar" />}
      <button onClick={logout}>Logout</button>
    </div>
  )
}
```

### React SPA

```typescript
// main.tsx
import { UserProvider } from '@renown/sdk'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <UserProvider>
      <App />
    </UserProvider>
  </React.StrictMode>
)

// App.tsx - Using RenownAuthButton
import { RenownAuthButton } from '@renown/sdk'

function App() {
  return (
    <div>
      <h1>My App</h1>
      <RenownAuthButton showLogoutButton />
    </div>
  )
}

// Or custom with useUser hook
import { useUser } from '@renown/sdk'

function CustomApp() {
  const { user, openRenown } = useUser()

  return (
    <div>
      {user ? (
        <p>Welcome {user.name}</p>
      ) : (
        <button onClick={openRenown}>Login</button>
      )}
    </div>
  )
}
```

## Configuration

### UserProvider Props

Customize the Renown SDK initialization:

```typescript
<UserProvider
  renownUrl="https://www.renown.id"  // Custom Renown service URL
  networkId="eip155"                            // Network ID (default: 'eip155')
  chainId="1"                                   // Chain ID (default: '1')
  loadingComponent={<YourLoader />}             // Custom loading screen
  errorComponent={(error, retry) => <YourError />}  // Custom error screen
>
  <App />
</UserProvider>
```

All props are optional - UserProvider uses sensible defaults.

### Environment Variables

You can use environment variables for configuration:

```typescript
<UserProvider
  renownUrl={process.env.NEXT_PUBLIC_RENOWN_URL}
>
  <App />
</UserProvider>
```

```bash
# .env
NEXT_PUBLIC_RENOWN_URL=https://www.renown.id
```

## Troubleshooting

### Context Error

**Error:** `useUser must be used within an UserProvider`

**Solution:** Ensure your component is wrapped by `<UserProvider>`:

```typescript
<UserProvider>
  <YourComponent /> {/* ✅ Can use useUser */}
</UserProvider>
```

### Custom Renown URL

If you need to use a different Renown instance:

```typescript
<UserProvider renownUrl="https://your-renown-instance.com">
  <App />
</UserProvider>
```

## Resources

- [GitHub Repository](https://github.com/powerhouse-inc/powerhouse)
- [NPM Package](https://www.npmjs.com/package/@renown/sdk)
- [Renown Portal](https://www.renown.id)

## License

AGPL-3.0-only

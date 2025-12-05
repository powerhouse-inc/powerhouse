# Renown SDK

A comprehensive SDK for integrating Renown authentication and user profile management into your React applications.

## Features

- 🔐 **Authentication** - Complete authentication flow with session management
- 👤 **User Profiles** - Fetch and manage user profile data
- ⚛️ **React Integration** - Provider and hooks for seamless React integration
- 🎨 **UI Components** - Ready-to-use login and auth components
- 🔄 **Session Persistence** - Automatic session restoration across page reloads
- 🌐 **Renown Portal** - Easy integration with Renown authentication portal
- 📦 **Type-Safe** - Full TypeScript support

## Installation

```bash
npm install @renown/sdk
# or
yarn add @renown/sdk
# or
pnpm add @renown/sdk
```

## Quick Start

### 1. Wrap Your App with RenownUserProvider

The SDK automatically initializes - just wrap your app!

```typescript
// app/layout.tsx or app.tsx
import { RenownUserProvider } from '@renown/sdk'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <RenownUserProvider>
          {children}
        </RenownUserProvider>
      </body>
    </html>
  )
}
```

### 2. Use Authentication in Components

**Option A: Use the RenownAuthButton component**

```typescript
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

**Option B: Build custom UI with useUser hook**

```typescript
import { useUser } from '@renown/sdk'

export function CustomAuth() {
  const { user, openRenown, logout } = useUser()

  if (!user) return <button onClick={openRenown}>Login</button>
  return <button onClick={logout}>Logout</button>
}
```

## UI Components

The SDK includes a ready-to-use React component for authentication:

### RenownAuthButton

Smart button that adapts to auth state - shows login button when not authenticated, and user info when authenticated:

```typescript
import { RenownAuthButton } from '@renown/sdk'

<RenownAuthButton showLogoutButton />
```

For detailed component documentation and examples, see [COMPONENTS.md](./COMPONENTS.md).

## API Reference

### Components

#### `<RenownUserProvider>`

Central authentication provider that automatically initializes the SDK.

**Props:**
- `children`: React.ReactNode - **Required.** Your application components
- `renownUrl?`: string - Renown service URL (default: 'https://www.renown.id')
- `networkId?`: string - Network ID (default: 'eip155')
- `chainId?`: string - Chain ID (default: '1')
- `loadingComponent?`: React.ReactNode - Custom loading UI
- `errorComponent?`: (error, retry) => React.ReactNode - Custom error UI

**Example:**
```typescript
<RenownUserProvider>
  <App />
</RenownUserProvider>
```

**Custom Configuration:**
```typescript
<RenownUserProvider
  renownUrl={process.env.NEXT_PUBLIC_RENOWN_URL}
  loadingComponent={<Spinner />}
  errorComponent={(error, retry) => <ErrorScreen error={error} onRetry={retry} />}
>
  <App />
</RenownUserProvider>
```

### Hooks

#### `useUser()`

Access authentication state and methods throughout your application.

**Returns:**
```typescript
{
  user: User | null                      // Current authenticated user
  loginStatus: LoginStatus               // 'initial' | 'checking' | 'authorized' | 'not-authorized'
  isLoading: boolean                     // Loading state for auth operations
  isInitialized: boolean                 // Whether auth system is initialized
  login: (userDid?: string) => Promise<void>   // Login with optional DID
  logout: () => Promise<void>            // Logout current user
  openRenown: () => void                 // Open Renown portal
}
```

**Example:**
```typescript
function UserProfile() {
  const { user, loginStatus, openRenown, logout } = useUser()

  switch (loginStatus) {
    case 'authorized':
      return (
        <div>
          <h1>{user?.name || 'User'}</h1>
          <p>{user?.did}</p>
          {user?.avatar && <img src={user.avatar} alt="Avatar" />}
          <button onClick={logout}>Logout</button>
        </div>
      )
    case 'not-authorized':
      return <button onClick={openRenown}>Login</button>
    default:
      return <div>Checking auth...</div>
  }
}
```

### Types

#### `User`

```typescript
interface User {
  did: string              // Decentralized identifier
  address: string          // Ethereum address
  name?: string            // Display name from profile
  email?: string           // Email address
  avatar?: string          // Avatar image URL
  ethAddress?: string      // Ethereum address
}
```

#### `LoginStatus`

```typescript
type LoginStatus =
  | 'initial'           // Not yet checked
  | 'checking'          // Currently checking auth
  | 'authorized'        // User is authenticated
  | 'not-authorized'    // User is not authenticated
```

### Utility Functions

#### `fetchProfileDataForUser(user: User): Promise<User>`

Fetches additional profile data from the Renown API for a given user.

```typescript
import { fetchProfileDataForUser } from '@renown/sdk'

const userWithProfile = await fetchProfileDataForUser(user)
```

#### `login(userDid: string, renown: IRenown, connectCrypto: IConnectCrypto)`

Performs login and stores session data.

#### `logout()`

Logs out the current user and clears session data.

#### `openRenown()`

Opens the Renown authentication portal.

#### `handleRenownReturn()`

Handles return from Renown authentication flow.

### Session Management

#### `SessionStorageManager`

Manages user session persistence in sessionStorage.

**Methods:**
- `setUserData(data)` - Store user data
- `getUserData()` - Retrieve stored user data
- `clearUserData()` - Clear session data
- `isUserDataValid(data)` - Check if session data is valid

```typescript
import { SessionStorageManager } from '@renown/sdk'

// Store user session
SessionStorageManager.setUserData({
  user: currentUser,
  userDid: currentUser.did,
  loginStatus: 'authorized',
  timestamp: Date.now()
})

// Check session
const storedData = SessionStorageManager.getUserData()
if (storedData && SessionStorageManager.isUserDataValid(storedData)) {
  // Session is valid
}
```

## Advanced Usage

### Custom Authentication Flow

You can implement custom authentication flows by directly using the SDK functions:

```typescript
import { login, logout, initRenown, ConnectCrypto, BrowserKeyStorage } from '@renown/sdk'

async function customLogin() {
  // Initialize
  const connectCrypto = new ConnectCrypto(new BrowserKeyStorage())
  const renown = await initRenown(
    await connectCrypto.did(),
    'eip155',
    'https://www.renown.id'
  )

  // Login
  const userDid = await connectCrypto.did()
  const user = await login(userDid, renown, connectCrypto)

  return user
}
```

### Conditional Rendering Based on Auth

```typescript
function ProtectedContent() {
  const { user, loginStatus, openRenown } = useUser()

  if (loginStatus !== 'authorized') {
    return (
      <div>
        <h1>Please login to continue</h1>
        <button onClick={openRenown}>Login</button>
      </div>
    )
  }

  return <div>Protected content for {user?.name}</div>
}
```

### Handling Authentication Events

```typescript
function AuthListener() {
  const { user, loginStatus } = useUser()

  useEffect(() => {
    if (loginStatus === 'authorized' && user) {
      console.log('User logged in:', user)
      // Analytics, notifications, etc.
    }
  }, [loginStatus, user])

  return null
}
```

## Configuration

### RenownUserProvider Configuration

The RenownUserProvider accepts optional configuration props:

```typescript
<RenownUserProvider
  renownUrl="https://www.renown.id"  // Custom Renown URL
  networkId="eip155"                            // Network ID (default)
  chainId="1"                                   // Chain ID (default)
>
  <App />
</RenownUserProvider>
```

### Environment Variables

Use environment variables for dynamic configuration:

```typescript
<RenownUserProvider
  renownUrl={process.env.NEXT_PUBLIC_RENOWN_URL || 'https://www.renown.id'}
>
  <App />
</RenownUserProvider>
```

```bash
# .env
NEXT_PUBLIC_RENOWN_URL=https://www.renown.id
```

## Examples

### Next.js App Router

```typescript
// app/layout.tsx
import { RenownUserProvider } from '@renown/sdk'

export default function RootLayout({ children }) {
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

// components/Navbar.tsx - Using RenownAuthButton
'use client'

import { RenownAuthButton } from '@renown/sdk'

export function Navbar() {
  return (
    <nav>
      <h1>My App</h1>
      <RenownAuthButton showLogoutButton />
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
      <button onClick={logout}>Logout</button>
    </div>
  )
}
```

### React SPA

```typescript
// main.tsx
import { RenownUserProvider } from '@renown/sdk'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RenownUserProvider>
      <App />
    </RenownUserProvider>
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
```

## Troubleshooting

### RenownUserProvider Context Error

**Error:** `useUser must be used within an RenownUserProvider`

**Solution:** Ensure your component is wrapped by `<RenownUserProvider>`:

```typescript
<RenownUserProvider>
  <YourComponent /> {/* ✅ Can use useUser */}
</RenownUserProvider>
```

### Custom Renown URL

To use a different Renown instance:

```typescript
<RenownUserProvider renownUrl="https://your-renown-instance.com">
  <App />
</RenownUserProvider>
```

### Session Not Persisting

If sessions aren't persisting across page reloads:

1. Check that sessionStorage is available (not in incognito mode)
2. Verify the session hasn't expired (24 hour timeout by default)
3. Check browser console for any errors during initialization

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

AGPL-3.0-only

## Documentation

Full documentation is available in the Powerhouse Academy:
- [Overview & Quick Start](../../apps/academy/docs/academy/04-APIReferences/renown-sdk/00-Overview.md)
- [Authentication Guide](../../apps/academy/docs/academy/04-APIReferences/renown-sdk/01-Authentication.md)
- [API Reference](../../apps/academy/docs/academy/04-APIReferences/renown-sdk/02-APIReference.md)

## Support

For issues and questions:
- GitHub Issues: [powerhouse-inc/powerhouse](https://github.com/powerhouse-inc/powerhouse)
- Documentation: [Powerhouse Academy](https://docs.powerhouse.io)

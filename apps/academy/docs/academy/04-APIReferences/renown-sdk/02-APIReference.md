# API Reference

Complete API reference for the Renown SDK.

## Table of Contents

- [Components](#components)
- [Hooks](#hooks)
- [Functions](#functions)
- [Types](#types)
- [Classes](#classes)
- [Constants](#constants)

## Components

### `UserProvider`

Central authentication provider that automatically initializes the Renown SDK.

#### Props

```typescript
interface UserProviderProps {
  children: React.ReactNode
  renownUrl?: string
  networkId?: string
  chainId?: string
  loadingComponent?: React.ReactNode
  errorComponent?: (error: Error, retry: () => void) => React.ReactNode
}
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `React.ReactNode` | - | **Required.** Child components |
| `renownUrl` | `string` | `'https://www.renown.id'` | Renown service URL |
| `networkId` | `string` | `'eip155'` | Network identifier |
| `chainId` | `string` | `'1'` | Chain identifier |
| `loadingComponent` | `React.ReactNode` | undefined | Custom loading UI during initialization |
| `errorComponent` | `(error, retry) => ReactNode` | undefined | Custom error UI if initialization fails |

#### Example

**Basic usage (auto-initializes with defaults):**
```typescript
<UserProvider>
  <App />
</UserProvider>
```

**With custom configuration:**
```typescript
<UserProvider
  renownUrl={process.env.NEXT_PUBLIC_RENOWN_URL}
  networkId="eip155"
  chainId="1"
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
  <App />
</UserProvider>
```

#### Behavior

- **Automatically initializes** Renown SDK and ConnectCrypto on mount
- Creates global `window.renown` and `window.connectCrypto` instances
- Checks sessionStorage for existing sessions
- Handles Renown authentication redirects
- Shows `loadingComponent` during initialization (if provided)
- Shows `errorComponent` if initialization fails (if provided)
- If no custom components provided, renders children immediately
- Provides auth context to all children

---

### `RenownAuthButton`

Smart button component that adapts based on authentication state.

#### Props

```typescript
interface RenownAuthButtonProps {
  className?: string
  profileBaseUrl?: string
  renderAuthenticated?: (props: RenownAuthButtonRenderProps) => React.ReactNode
  renderUnauthenticated?: (props: { openRenown: () => void; isLoading: boolean }) => React.ReactNode
  renderLoading?: () => React.ReactNode
  showUsername?: boolean
  showLogoutButton?: boolean
  logoutButtonText?: string
}
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `className` | `string` | `""` | Custom CSS class |
| `profileBaseUrl` | `string` | `"https://www.renown.id/profile"` | Base URL for profile |
| `renderAuthenticated` | `function` | Default renderer | Custom authenticated state |
| `renderUnauthenticated` | `function` | Default renderer | Custom unauthenticated state |
| `renderLoading` | `function` | Default renderer | Custom loading state |
| `showUsername` | `boolean` | `true` | Show username next to avatar |
| `showLogoutButton` | `boolean` | `false` | Show logout button |
| `logoutButtonText` | `string` | `"Logout"` | Logout button text |

#### Example

```typescript
import { RenownAuthButton } from '@renown/sdk'

// Basic usage
<RenownAuthButton showLogoutButton />

// Custom rendering
<RenownAuthButton
  renderAuthenticated={({ user, logout }) => (
    <div>
      <span>{user.name}</span>
      <button onClick={logout}>Sign Out</button>
    </div>
  )}
  renderUnauthenticated={({ openRenown }) => (
    <button onClick={openRenown}>Sign In</button>
  )}
/>
```

---

## Hooks

### `useUser()`

Access authentication state and methods.

#### Returns

```typescript
interface UserContextValue {
  user: User | null
  loginStatus: LoginStatus
  isLoading: boolean
  isInitialized: boolean
  login: (userDid?: string) => Promise<void>
  logout: () => Promise<void>
  openRenown: () => void
}
```

| Property | Type | Description |
|----------|------|-------------|
| `user` | `User \| null` | Current authenticated user or null |
| `loginStatus` | `LoginStatus` | Current authentication status |
| `isLoading` | `boolean` | Whether an auth operation is in progress |
| `isInitialized` | `boolean` | Whether the auth system has initialized |
| `login` | `function` | Authenticate with optional DID |
| `logout` | `function` | Log out current user |
| `openRenown` | `function` | Open Renown authentication portal |

#### Example

```typescript
function MyComponent() {
  const {
    user,
    loginStatus,
    isLoading,
    login,
    logout,
    openRenown
  } = useUser()

  if (isLoading) return <div>Loading...</div>
  if (!user) return <button onClick={openRenown}>Login</button>
  return <button onClick={logout}>Logout</button>
}
```

#### Throws

Throws an error if used outside of `<UserProvider>`:

```
Error: useUser must be used within an UserProvider
```

---

## Functions

### `initRenown()`

Initialize the Renown SDK.

#### Signature

```typescript
function initRenown(
  did: string,
  networkId: string,
  renownUrl: string
): Promise<IRenown>
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `did` | `string` | Decentralized identifier (DID) |
| `networkId` | `string` | Network identifier (e.g., 'eip155') |
| `renownUrl` | `string` | Renown service URL |

#### Returns

`Promise<IRenown>` - Initialized Renown instance

#### Example

```typescript
import { initRenown } from '@renown/sdk'

const renown = await initRenown(
  'did:pkh:eip155:1:0x123...',
  'eip155',
  'https://www.renown.id'
)
```

---

### `login()`

Authenticate a user with Renown.

#### Signature

```typescript
function login(
  userDid: string | undefined,
  renown: IRenown | undefined,
  connectCrypto: IConnectCrypto | undefined
): Promise<User | undefined>
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `userDid` | `string \| undefined` | User's DID to authenticate |
| `renown` | `IRenown \| undefined` | Renown instance |
| `connectCrypto` | `IConnectCrypto \| undefined` | ConnectCrypto instance |

#### Returns

`Promise<User | undefined>` - Authenticated user or undefined

#### Side Effects

- Stores user session in sessionStorage
- Fetches user profile data
- Updates auth state

#### Example

```typescript
import { login } from '@renown/sdk'

const user = await login(
  'did:pkh:eip155:1:0x123...',
  window.renown,
  window.connectCrypto
)
```

---

### `logout()`

Log out the current user.

#### Signature

```typescript
function logout(): Promise<void>
```

#### Returns

`Promise<void>`

#### Side Effects

- Clears sessionStorage
- Calls renown.logout()
- Removes JWT handler

#### Example

```typescript
import { logout } from '@renown/sdk'

await logout()
```

---

### `openRenown()`

Open the Renown authentication portal.

#### Signature

```typescript
function openRenown(): void
```

#### Returns

`void`

#### Behavior

- Constructs authentication URL with current DID
- Adds network and chain parameters
- Sets return URL to current location
- Redirects to Renown portal

#### Example

```typescript
import { openRenown } from '@renown/sdk'

function MyLoginButton() {
  return <button onClick={openRenown}>Login</button>
}

// Or use the built-in RenownAuthButton component
import { RenownAuthButton } from '@renown/sdk'

function Header() {
  return <RenownAuthButton />
}
```

---

### `handleRenownReturn()`

Process authentication redirect from Renown.

#### Signature

```typescript
function handleRenownReturn(): Promise<void>
```

#### Returns

`Promise<void>`

#### Behavior

- Checks URL for authentication parameters
- Extracts user DID from query string
- Calls login with the DID
- Cleans up URL parameters

#### Example

```typescript
import { handleRenownReturn } from '@renown/sdk'

// Called automatically by UserProvider
useEffect(() => {
  handleRenownReturn()
}, [])
```

---

### `fetchProfileDataForUser()`

Fetch user profile data from Renown API.

#### Signature

```typescript
function fetchProfileDataForUser(user: User): Promise<User>
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `user` | `User` | User object to enrich with profile data |

#### Returns

`Promise<User>` - User with profile data

#### Behavior

- Extracts ETH address from user's DID
- Calls Renown profile API
- Enriches user object with profile data (name, avatar, etc.)
- Returns original user if profile not found

#### Example

```typescript
import { fetchProfileDataForUser } from '@renown/sdk'

const userWithProfile = await fetchProfileDataForUser(user)
console.log(userWithProfile.name) // Display name
console.log(userWithProfile.avatar) // Avatar URL
```

---

### `reauthenticateFromSession()`

Restore authentication from stored session.

#### Signature

```typescript
function reauthenticateFromSession(): Promise<User | null>
```

#### Returns

`Promise<User | null>` - Restored user or null

#### Behavior

- Checks for stored session in sessionStorage
- Calls login with stored DID
- Fetches fresh profile data
- Returns null if session invalid or expired

#### Example

```typescript
import { reauthenticateFromSession } from '@renown/sdk'

const user = await reauthenticateFromSession()
if (user) {
  console.log('Session restored for:', user.did)
}
```

---

### `extractEthAddressFromDid()`

Extract Ethereum address from a DID.

#### Signature

```typescript
function extractEthAddressFromDid(did: string): string | null
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `did` | `string` | DID string (e.g., 'did:pkh:eip155:1:0x123...') |

#### Returns

`string | null` - Ethereum address or null if invalid

#### Example

```typescript
import { extractEthAddressFromDid } from '@renown/sdk'

const address = extractEthAddressFromDid('did:pkh:eip155:1:0x1234...')
console.log(address) // '0x1234...'
```

---

## Types

### `User`

Represents an authenticated user.

```typescript
interface User {
  did: string          // Decentralized identifier
  address: string      // Ethereum address
  name?: string        // Display name from profile
  email?: string       // Email address
  avatar?: string      // Avatar image URL
  ethAddress?: string  // Ethereum address (duplicate of address)
}
```

---

### `LoginStatus`

Authentication status enumeration.

```typescript
type LoginStatus =
  | 'initial'           // Not yet checked
  | 'checking'          // Currently checking auth
  | 'authorized'        // User is authenticated
  | 'not-authorized'    // User is not authenticated
```

---

### `UserContextValue`

Type for the authentication context value.

```typescript
interface UserContextValue {
  user: User | null
  loginStatus: LoginStatus
  isLoading: boolean
  isInitialized: boolean
  login: (userDid?: string) => Promise<void>
  logout: () => Promise<void>
  openRenown: () => void
}
```

---

### `IRenown`

Interface for the Renown instance.

```typescript
interface IRenown {
  user: User | undefined | (() => Promise<User | undefined>)
  login: (did: string) => Promise<User | undefined>
  logout: () => Promise<void>
  on: (event: string, handler: Function) => Unsubscribe
}
```

---

### `IConnectCrypto`

Interface for the ConnectCrypto instance.

```typescript
interface IConnectCrypto {
  did: () => Promise<string>
  // Additional methods...
}
```

---

## Classes

### `ConnectCrypto`

Manages cryptographic operations and DID generation.

#### Constructor

```typescript
constructor(keyStorage: IKeyStorage)
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `keyStorage` | `IKeyStorage` | Key storage implementation |

#### Methods

##### `did()`

Get the DID for the current key.

```typescript
async did(): Promise<string>
```

**Returns:** `Promise<string>` - The DID

**Example:**
```typescript
const connectCrypto = new ConnectCrypto(new BrowserKeyStorage())
const did = await connectCrypto.did()
console.log(did) // 'did:pkh:eip155:1:0x...'
```

---

### `BrowserKeyStorage`

Browser-based key storage using IndexedDB.

#### Constructor

```typescript
constructor()
```

#### Usage

```typescript
import { BrowserKeyStorage, ConnectCrypto } from '@renown/sdk'

const keyStorage = new BrowserKeyStorage()
const connectCrypto = new ConnectCrypto(keyStorage)
```

---

### `SessionStorageManager`

Manages user session persistence.

#### Static Methods

##### `setUserData()`

Store user session data.

```typescript
static setUserData(data: {
  user: User
  userDid: string
  loginStatus: LoginStatus
  timestamp: number
}): void
```

**Example:**
```typescript
SessionStorageManager.setUserData({
  user: currentUser,
  userDid: currentUser.did,
  loginStatus: 'authorized',
  timestamp: Date.now()
})
```

##### `getUserData()`

Retrieve stored user session.

```typescript
static getUserData(): {
  user: User
  userDid: string
  loginStatus: LoginStatus
  timestamp: number
} | null
```

**Returns:** Session data or null

**Example:**
```typescript
const session = SessionStorageManager.getUserData()
if (session) {
  console.log('Found session for:', session.user.did)
}
```

##### `clearUserData()`

Clear stored session.

```typescript
static clearUserData(): void
```

**Example:**
```typescript
SessionStorageManager.clearUserData()
```

##### `isUserDataValid()`

Check if session data is valid.

```typescript
static isUserDataValid(data: {
  user: User
  userDid: string
  loginStatus: LoginStatus
  timestamp: number
}): boolean
```

**Returns:** `boolean` - Whether session is valid

**Example:**
```typescript
const data = SessionStorageManager.getUserData()
if (data && SessionStorageManager.isUserDataValid(data)) {
  // Session is valid
}
```

##### `getStoredUserDid()`

Get stored user DID.

```typescript
static getStoredUserDid(): string | null
```

**Returns:** `string | null` - Stored DID or null

---

## Constants

### `RENOWN_URL`

Default Renown service URL.

```typescript
const RENOWN_URL: string = 'https://www.renown.id'
```

---

### `RENOWN_NETWORK_ID`

Default network identifier.

```typescript
const RENOWN_NETWORK_ID: string = 'eip155'
```

---

### `RENOWN_CHAIN_ID`

Default chain identifier.

```typescript
const RENOWN_CHAIN_ID: string = '1'
```

---

## Global Window Extensions

The SDK extends the global `Window` interface:

```typescript
declare global {
  interface Window {
    renown?: IRenown
    connectCrypto?: IConnectCrypto
    reactor?: {
      setGenerateJwtHandler: (handler: (driveUrl: string) => Promise<string>) => void
      removeJwtHandler: () => void
    }
  }
}
```

### `window.renown`

Global Renown instance after initialization.

**Usage:**
```typescript
if (window.renown) {
  const user = await window.renown.login('did:pkh:...')
}
```

### `window.connectCrypto`

Global ConnectCrypto instance after initialization.

**Usage:**
```typescript
if (window.connectCrypto) {
  const did = await window.connectCrypto.did()
}
```

---

## Error Handling

### Common Errors

#### `useUser must be used within an UserProvider`

**Cause:** Using `useUser()` outside of `<UserProvider>`

**Solution:** Wrap your component tree with `<UserProvider>`

```typescript
<UserProvider>
  <YourComponent /> {/* ✅ Can use useUser */}
</UserProvider>
```

#### `Invalid DID format`

**Cause:** DID doesn't match expected format `did:pkh:networkId:chainId:address`

**Solution:** Ensure DID is properly formatted

```typescript
// ✅ Valid
'did:pkh:eip155:1:0x1234567890123456789012345678901234567890'

// ❌ Invalid
'did:1234567890123456789012345678901234567890'
```

#### `Renown or ConnectCrypto not available`

**Cause:** SDK initialization failed

**Solution:** The UserProvider automatically initializes the SDK. If you see this error:

1. Check that `<UserProvider>` is mounted
2. Check browser console for initialization errors
3. Verify network connectivity to Renown service
4. Try providing an `errorComponent` prop to see detailed error messages

```typescript
<UserProvider
  errorComponent={(error, retry) => (
    <div>
      <p>Init failed: {error.message}</p>
      <button onClick={retry}>Retry</button>
    </div>
  )}
>
  <App />
</UserProvider>
```

---

## TypeScript Support

The SDK is fully typed. Import types as needed:

```typescript
import type {
  User,
  LoginStatus,
  UserContextValue,
  IRenown,
  IConnectCrypto,
} from '@renown/sdk'
```

---

## Version Compatibility

| SDK Version | React Version | TypeScript Version |
|-------------|---------------|-------------------|
| 5.x | 18.x - 19.x | 4.5+ |
| 4.x | 18.x | 4.5+ |

---

## Related Documentation

- [Authentication Guide](./AUTHENTICATION.md) - Comprehensive auth implementation guide
- [Migration Guide](./MIGRATION.md) - Upgrading from older versions
- [Examples](../examples/) - Full implementation examples

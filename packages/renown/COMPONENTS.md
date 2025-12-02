# Renown SDK Components

The Renown SDK provides a ready-to-use React component for authentication UI.

## Component

### RenownAuthButton

Smart button that adapts based on authentication state. Shows login button when not authenticated, and user info when authenticated.

#### Basic Usage

```tsx
import { RenownAuthButton } from '@renown/sdk'

function Header() {
  return <RenownAuthButton />
}
```

#### With Logout Button

```tsx
<RenownAuthButton
  showLogoutButton
  logoutButtonText="Sign Out"
  showUsername
/>
```

#### Custom Rendering

```tsx
<RenownAuthButton
  renderAuthenticated={({ user, logout, openProfile }) => (
    <div className="flex items-center gap-2">
      <img
        src={user.avatar}
        alt={user.name}
        className="w-8 h-8 rounded-full cursor-pointer"
        onClick={openProfile}
      />
      <span>{user.name}</span>
      <button onClick={logout}>Logout</button>
    </div>
  )}
  renderUnauthenticated={({ openRenown, isLoading }) => (
    <button
      onClick={openRenown}
      disabled={isLoading}
      className="btn-primary"
    >
      {isLoading ? 'Loading...' : 'Sign In'}
    </button>
  )}
/>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `className` | `string` | `""` | Custom CSS class for container |
| `profileBaseUrl` | `string` | `"https://www.renown.id/profile"` | Base URL for profile |
| `renderAuthenticated` | `function` | Default renderer | Custom authenticated state |
| `renderUnauthenticated` | `function` | Default renderer | Custom unauthenticated state |
| `renderLoading` | `function` | Default renderer | Custom loading state |
| `showUsername` | `boolean` | `true` | Show username next to avatar |
| `showLogoutButton` | `boolean` | `false` | Show logout button |
| `logoutButtonText` | `string` | `"Logout"` | Logout button text |

#### Render Props

**renderAuthenticated** receives:
```typescript
{
  user: User              // Current user
  logout: () => Promise<void>    // Logout function
  openProfile: () => void        // Open user profile
}
```

**renderUnauthenticated** receives:
```typescript
{
  openRenown: () => void  // Open Renown portal
  isLoading: boolean      // Loading state
}
```

---

## Examples

### Integration with Next.js Navbar

```tsx
// components/Navbar.tsx
'use client'

import { RenownAuthButton } from '@renown/sdk'
import Link from 'next/link'

export function Navbar() {
  return (
    <nav className="flex items-center justify-between p-4">
      <Link href="/">
        <h1>My App</h1>
      </Link>

      <RenownAuthButton
        className="navbar-auth"
        profileBaseUrl="https://www.renown.id/profile"
        showLogoutButton
        renderAuthenticated={({ user, logout, openProfile }) => (
          <div className="flex items-center gap-3">
            <div
              onClick={openProfile}
              className="flex items-center gap-2 cursor-pointer hover:opacity-80"
            >
              {user.avatar && (
                <img
                  src={user.avatar}
                  alt={user.name || 'User'}
                  className="w-8 h-8 rounded-full"
                />
              )}
              <span className="text-sm font-medium">
                {user.name || user.did.slice(0, 15) + '...'}
              </span>
            </div>
            <button
              onClick={logout}
              className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
            >
              Logout
            </button>
          </div>
        )}
        renderUnauthenticated={({ openRenown, isLoading }) => (
          <button
            onClick={openRenown}
            disabled={isLoading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Sign In'}
          </button>
        )}
      />
    </nav>
  )
}
```

### Simple Login Page

```tsx
// app/login/page.tsx
'use client'

import { RenownAuthButton, useUser } from '@renown/sdk'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function LoginPage() {
  const { user, loginStatus } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (loginStatus === 'authorized' && user) {
      router.push('/dashboard')
    }
  }, [loginStatus, user, router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold">Welcome</h1>
        <p className="text-gray-600">Sign in to continue</p>
        <RenownAuthButton
          renderUnauthenticated={({ openRenown }) => (
            <button
              onClick={openRenown}
              style={{
                padding: '0.75rem 2rem',
                fontSize: '1rem',
                backgroundColor: '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem'
              }}
            >
              Sign In with Renown
            </button>
          )}
        />
      </div>
    </div>
  )
}
```

### Profile Dropdown

```tsx
// components/ProfileDropdown.tsx
'use client'

import { RenownAuthButton } from '@renown/sdk'
import { useState } from 'react'

export function ProfileDropdown() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <RenownAuthButton
      renderAuthenticated={({ user, logout, openProfile }) => (
        <div className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2"
          >
            <img
              src={user.avatar}
              alt={user.name || 'User'}
              className="w-10 h-10 rounded-full"
            />
          </button>

          {isOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-2">
              <div className="px-4 py-2 border-b">
                <p className="font-semibold">{user.name}</p>
                <p className="text-xs text-gray-500">{user.did.slice(0, 20)}...</p>
              </div>
              <button
                onClick={openProfile}
                className="w-full px-4 py-2 text-left hover:bg-gray-100"
              >
                View Profile
              </button>
              <button
                onClick={logout}
                className="w-full px-4 py-2 text-left text-red-600 hover:bg-gray-100"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      )}
      renderUnauthenticated={({ openRenown }) => (
        <button onClick={openRenown} className="btn-primary">
          Sign In
        </button>
      )}
    />
  )
}
```

### Adapting Existing Components

If you have existing UI components (like shadcn/ui), you can wrap them:

```tsx
// components/RenownAuthButtonWithShadcn.tsx
'use client'

import { RenownAuthButton } from '@renown/sdk'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function RenownAuthButtonWithShadcn() {
  return (
    <RenownAuthButton
      renderAuthenticated={({ user, logout, openProfile }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-10 w-10 rounded-full">
              <Avatar>
                <AvatarImage src={user.avatar} alt={user.name || 'User'} />
                <AvatarFallback>
                  {(user.name || user.did).substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user.name}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user.ethAddress || user.address}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={openProfile}>
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={logout}>
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      renderUnauthenticated={({ openRenown, isLoading }) => (
        <Button onClick={openRenown} disabled={isLoading}>
          {isLoading ? 'Loading...' : 'Sign In'}
        </Button>
      )}
    />
  )
}
```

## Styling

All components accept `className` and `style` props for custom styling:

```tsx
// Tailwind CSS
<RenownAuthButton className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg" />

// Inline styles with custom renderer
<RenownAuthButton
  renderUnauthenticated={({ openRenown }) => (
    <button
      onClick={openRenown}
      style={{
        background: 'linear-gradient(to right, #667eea, #764ba2)',
        color: 'white',
        padding: '12px 32px',
        borderRadius: '8px',
        border: 'none',
        fontWeight: '600'
      }}
    >
      Sign In
    </button>
  )}
/>

// CSS Modules
<RenownAuthButton className={styles.authButton} />
```

## TypeScript Support

All components are fully typed:

```typescript
import type {
  RenownAuthButtonProps,
  RenownAuthButtonRenderProps
} from '@renown/sdk'

const myProps: RenownAuthButtonProps = {
  className: 'my-button',
  showLogoutButton: true
}
```

## Browser Support

The components work in all modern browsers that support:
- ES6+
- React 18+
- CSS Grid and Flexbox

## Accessibility

All components include:
- Keyboard navigation support
- ARIA labels (when using default renderers)
- Focus states
- Disabled states
- Loading states

For custom renderers, ensure you add proper accessibility attributes.

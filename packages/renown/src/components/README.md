# Renown UI Components

Reusable React components for Renown authentication and user profiles.

## RenownLoginAvatar

A flexible login/avatar component that displays a login button when not authenticated, and a user avatar when authenticated.

### Features

- **Headless design**: Use custom render props to integrate with your own UI library
- **Default styling**: Works out of the box with minimal styling
- **Profile linking**: Automatically opens profile page on avatar click
- **TypeScript support**: Fully typed with TypeScript

### Basic Usage

```tsx
import { RenownLoginAvatar } from '@renown/sdk'

function MyComponent() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [user, setUser] = useState(null)

  return (
    <RenownLoginAvatar
      isLoggedIn={isLoggedIn}
      user={user}
      onLoginClick={() => {
        // Handle login
        console.log('Login clicked')
      }}
      profileBaseUrl="https://renown.io/profile"
    />
  )
}
```

### With Custom UI (shadcn/ui)

```tsx
import { RenownLoginAvatar } from '@renown/sdk'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

function NavbarAuth() {
  return (
    <RenownLoginAvatar
      isLoggedIn={isLoggedIn}
      user={user}
      onLoginClick={handleLogin}
      renderAvatar={({ user, onClick }) => (
        <Avatar onClick={onClick} className="cursor-pointer">
          <AvatarImage src={user.avatar} alt={user.username} />
          <AvatarFallback>{user.username.substring(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
      )}
      renderButton={({ onClick }) => (
        <Button variant="outline" onClick={onClick}>
          Log in
        </Button>
      )}
    />
  )
}
```

### Props

#### `RenownLoginAvatarProps`

| Prop              | Type                                                         | Required | Description                                                       |
| ----------------- | ------------------------------------------------------------ | -------- | ----------------------------------------------------------------- |
| `isLoggedIn`      | `boolean`                                                    | Yes      | Whether the user is logged in                                     |
| `user`            | `RenownUser`                                                 | No       | User data (required if `isLoggedIn` is true)                      |
| `onLoginClick`    | `() => void`                                                 | No       | Callback when login button is clicked                             |
| `profileBaseUrl`  | `string`                                                     | No       | Base URL for profile pages (default: "https://renown.io/profile") |
| `renderAvatar`    | `(props: { user: RenownUser, onClick: () => void }) => ReactNode` | No       | Custom avatar renderer                                             |
| `renderButton`    | `(props: { onClick: () => void }) => ReactNode`              | No       | Custom button renderer                                             |

#### `RenownUser`

| Prop          | Type     | Required | Description                       |
| ------------- | -------- | -------- | --------------------------------- |
| `username`    | `string` | Yes      | User's username                   |
| `avatar`      | `string` | No       | URL to user's avatar image        |
| `ethAddress`  | `string` | No       | User's Ethereum address           |

### Default Styling

The component includes minimal default styling that can be overridden:

- Avatar: 2.5rem circular image or fallback with initials
- Button: Simple outlined button with padding
- Colors: Purple gradient for fallback avatar (#9333ea)

### Integration Example for vetra.to

```tsx
// In vetra.to/modules/shared/components/navbar/components/renown-login-avatar.tsx
import { RenownLoginAvatar, type RenownUser } from '@renown/sdk'
import { Avatar, AvatarFallback, AvatarImage } from '@/modules/shared/components/ui/avatar'
import { Button } from '@/modules/shared/components/ui/button'
import type { User } from '../types'

interface Props {
  isLoggedIn: boolean
  user?: User
  onLoginClick?: () => void
}

export function VetraLoginAvatar({ isLoggedIn, user, onLoginClick }: Props) {
  // Map vetra.to User type to RenownUser
  const renownUser: RenownUser | undefined = user
    ? {
        username: user.username,
        avatar: user.avatar,
        ethAddress: user.ethAddress,
      }
    : undefined

  return (
    <RenownLoginAvatar
      isLoggedIn={isLoggedIn}
      user={renownUser}
      onLoginClick={onLoginClick}
      profileBaseUrl="https://auth.renown.io/profile"
      renderAvatar={({ user, onClick }) => (
        <div className="flex items-center gap-2">
          <Avatar onClick={onClick} className="cursor-pointer">
            <AvatarImage src={user.avatar} alt="avatar" />
            <AvatarFallback>{user.username.substring(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="flex text-sm font-medium md:hidden">{user.username}</span>
        </div>
      )}
      renderButton={({ onClick }) => (
        <Button
          variant="outline"
          onClick={onClick}
          className="hidden cursor-pointer items-center gap-2 md:flex"
        >
          Log in
        </Button>
      )}
    />
  )
}
```

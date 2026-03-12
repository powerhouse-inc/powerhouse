# Renown React Components

React components and hooks for Renown authentication are provided by `@powerhousedao/reactor-browser`, not by `@renown/sdk` directly.

```bash
npm install @powerhousedao/reactor-browser
```

## Setup

Wrap your app with `RenownProvider`:

```tsx
import { RenownProvider } from "@powerhousedao/reactor-browser";

function App() {
  return (
    <RenownProvider appName="my-app">
      <MyApp />
    </RenownProvider>
  );
}
```

## Components

### RenownAuthButton

Smart button that adapts to auth state. Three levels of customization:

**Zero-config:**
```tsx
import { RenownAuthButton } from "@powerhousedao/reactor-browser";

<RenownAuthButton />
```

**Slot overrides** (partial customization):
```tsx
<RenownAuthButton
  loginContent={<span>Connect Wallet</span>}
  loadingContent={<Spinner />}
/>
```

**Headless** (full customization via render function):
```tsx
<RenownAuthButton>
  {(auth) => {
    if (auth.status === "loading" || auth.status === "checking") return <Spinner />;
    if (auth.status !== "authorized") {
      return <button onClick={auth.login}>Sign In</button>;
    }
    return (
      <div>
        <span>{auth.displayName}</span>
        <button onClick={auth.logout}>Log out</button>
      </div>
    );
  }}
</RenownAuthButton>
```

### RenownLoginButton

Styled login button. Supports `asChild` to use your own element:

```tsx
import { RenownLoginButton } from "@powerhousedao/reactor-browser";

// Default
<RenownLoginButton />

// Custom element
<RenownLoginButton asChild>
  <button className="my-btn">Sign in with Renown</button>
</RenownLoginButton>
```

### RenownUserButton

User avatar button with dropdown menu. Supports `asChild` and custom menu items:

```tsx
import { RenownUserButton } from "@powerhousedao/reactor-browser";

// Default — reads from context
<RenownUserButton />

// Custom element
<RenownUserButton asChild>
  <button>My Account</button>
</RenownUserButton>

// Extra menu items
<RenownUserButton
  menuItems={[
    { label: "Settings", onClick: () => navigate("/settings") },
  ]}
/>
```

## Hook

### useRenownAuth

Headless hook for fully custom UIs:

```tsx
import { useRenownAuth } from "@powerhousedao/reactor-browser";

function MyAuth() {
  const { status, displayName, login, logout, openProfile } = useRenownAuth();

  if (status === "loading" || status === "checking") return <Spinner />;
  if (status !== "authorized") return <button onClick={login}>Login</button>;

  return (
    <div>
      <span>{displayName}</span>
      <button onClick={openProfile}>Profile</button>
      <button onClick={logout}>Log out</button>
    </div>
  );
}
```

**Returns `RenownAuth`:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | `"initial" \| "checking" \| "authorized" \| "not-authorized" \| "loading" \| undefined` | Current auth state |
| `user` | `User \| undefined` | Full user object |
| `address` | `string \| undefined` | Ethereum address |
| `ensName` | `string \| undefined` | ENS name |
| `avatarUrl` | `string \| undefined` | Avatar URL |
| `profileId` | `string \| undefined` | Renown profile document ID |
| `displayName` | `string \| undefined` | ENS name or username |
| `displayAddress` | `string \| undefined` | Truncated address (0x1234...5678) |
| `login` | `() => void` | Opens Renown portal |
| `logout` | `() => Promise<void>` | Logs out |
| `openProfile` | `() => void` | Opens Renown profile page |

## Integrating with shadcn/ui

```tsx
import { RenownAuthButton } from "@powerhousedao/reactor-browser";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function AuthButton() {
  return (
    <RenownAuthButton>
      {(auth) => {
        if (auth.status === "loading" || auth.status === "checking") {
          return <Button variant="ghost" disabled>Loading...</Button>;
        }
        if (auth.status !== "authorized") {
          return <Button onClick={auth.login}>Sign In</Button>;
        }
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                <Avatar>
                  <AvatarImage src={auth.avatarUrl} />
                  <AvatarFallback>
                    {(auth.displayName ?? "U")[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{auth.displayName}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={auth.openProfile}>Profile</DropdownMenuItem>
              <DropdownMenuItem onClick={auth.logout}>Log out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      }}
    </RenownAuthButton>
  );
}
```

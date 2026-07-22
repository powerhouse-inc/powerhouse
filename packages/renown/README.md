# Renown SDK

Core authentication SDK for Renown — handles credential verification, session management, and cryptographic operations.

For React components and hooks, see [COMPONENTS.md](./COMPONENTS.md).

## Installation

```bash
npm install @renown/sdk
```

## RenownBuilder

```typescript
import { RenownBuilder } from "@renown/sdk";

const renown = await new RenownBuilder("my-app")
  .withBaseUrl("https://www.renown.id")
  .build();
```

**Builder methods:**

- `withBaseUrl(url)` — Renown server URL (default: `https://www.renown.id`)
- `withStorage(storage)` — Custom user data persistence (default: in-memory)
- `withEventEmitter(emitter)` — Custom event emitter for state changes
- `withCrypto(crypto)` — Pre-built crypto instance
- `withKeyPairStorage(storage)` — Key pair storage (crypto is built from this)
- `withProfileFetcher(fetcher)` — Custom profile enrichment strategy

## Renown Instance

```typescript
// Login with a DID
const user = await renown.login("did:pkh:eip155:1:0x...");

// Check current state
renown.user;    // User | undefined
renown.status;  // "initial" | "checking" | "authorized" | "not-authorized"

// Listen to state changes
const unsub = renown.on("user", (user) => { ... });
const unsub2 = renown.on("status", (status) => { ... });

// Logout
await renown.logout();

// Bearer tokens for API auth
const token = await renown.getBearerToken({ expiresIn: 3600 });
const verified = await renown.verifyBearerToken(token);
```

## Types

```typescript
import type { User, LoginStatus, IRenown } from "@renown/sdk";

interface User {
  did: string;
  address: `0x${string}`;
  chainId: number;
  networkId: string;
  credential: PowerhouseVerifiableCredential | undefined;
  profile?: RenownProfile;
  ens?: { name?: string; avatarUrl?: string };
}

type LoginStatus = "initial" | "checking" | "authorized" | "not-authorized";
```

## Utilities

```typescript
import { parsePkhDid, verifyAuthBearerToken } from "@renown/sdk";

// Parse a DID:pkh string
const { networkId, chainId, address } = parsePkhDid("did:pkh:eip155:1:0x...");

// Verify a bearer token
const result = await verifyAuthBearerToken(jwt); // false | AuthVerifiedCredential
```

## Wallet adapters (in-page sign-in)

`@renown/sdk/wallet` provides pluggable wallet adapters so a host app (e.g.
Connect) can sign a Renown credential **in-page**, without redirecting to the
Renown portal. Each adapter is a separate subexport, loaded via dynamic
`import()` so its wallet libraries are **optional peer dependencies** with zero
startup cost until a login method is chosen.

| Subexport                | Adapter  | Peer dependencies                                              |
| ------------------------ | -------- | ------------------------------------------------------------- |
| `@renown/sdk/wallet/rainbow` | RainbowKit + wagmi (external wallets) | `wagmi`, `@rainbow-me/rainbowkit`, `@tanstack/react-query`, `viem` |
| `@renown/sdk/wallet/privy`   | Privy (embedded / social / email)     | `@privy-io/react-auth`, `viem`                                |
| `@renown/sdk/wallet/mock`    | Headless test/dev signer (no UI)      | `viem`                                                        |

Install only the peer deps for the adapters you enable.

> **Host apps should not wire these adapters by hand.** Use the
> `RenownWalletProvider` + `useRenownLoginMethods` + `useRenownAuth` primitives
> from `@powerhousedao/reactor-browser/renown`, which handle the activator,
> lazy-loading, controller merging and login UI wiring. See that package's
> README ("Renown in-page sign-in"). `resolveAdapters` below is the low-level
> primitive those build on.

```typescript
import { resolveAdapters } from "@renown/sdk/wallet";

// Loads ONLY the configured adapters (dynamic import, on demand).
const adapters = await resolveAdapters({
  rainbow: { walletConnectProjectId: "..." },
  privy: { appId: "...", methods: ["google", "email"] },
});
```

Each adapter exposes a `Provider` (mount it around the app; it accepts a runtime
`theme` of `"light" | "dark" | { mode, accentColor?, accentColorForeground? }`)
and a controller with `connect(method?)`, `disconnect()`, and `getSession()`.
`connect()` resolves a `WalletSession` (`{ address, chainId, signTypedData }`);
pass it to `renown.signIn(session)` to write + log in the credential in-page.

**Login methods.** Rainbow supports `wallet`; Privy supports `wallet`, `google`,
`apple`, `email` (default `["google", "email"]`). Social/email flows run inside
Privy's own modal (OAuth uses a popup, keeping the page alive) so sign-in
completes in-page — no full-page redirect.

**Configuration.** Only public identifiers belong in client config: Privy's
`appId` (and optional `clientId`), and RainbowKit's `walletConnectProjectId`.
Never put a Privy **App Secret** in browser config — it is server-only.

## Node.js

For server-side usage, import from `@renown/sdk/node`:

```typescript
import { RenownBuilder } from "@renown/sdk/node";
```

## License

AGPL-3.0-only

## Support

- GitHub Issues: [powerhouse-inc/powerhouse](https://github.com/powerhouse-inc/powerhouse)
- Documentation: [Powerhouse Academy](https://docs.powerhouse.io)

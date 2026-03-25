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

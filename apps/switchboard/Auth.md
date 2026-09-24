# Powerhouse Authentication System Tutorial

## Overview

The Powerhouse authentication system is a sophisticated, decentralized identity and authorization solution that combines blockchain-based authentication with role-based access control. It provides secure, verifiable, and privacy-preserving authentication for decentralized applications while maintaining the flexibility of traditional role-based systems.

## What It's Capable Of

### 🔐 **Decentralized Identity Management**

- **DID (Decentralized Identifier) Creation**: Generates unique, self-sovereign identifiers based on Ethereum addresses
- **Verifiable Credentials**: Uses W3C Verifiable Credentials standard for cryptographic proof of identity
- **Wallet Integration**: Seamless integration with Ethereum wallets and other Web3 providers
- **Privacy Preservation**: Users can maintain pseudonymous identities while building reputation

### 🎭 **Access Control**

- **Supreme Admins**: a global admin list (`ADMINS`) whose addresses bypass all permission checks
- **Per-Document Permissions**: READ / WRITE / ADMIN grants, ownership, and group membership enforced per document
- **Flexible Configuration**: Easy setup through environment variables or configuration files
- **Runtime Management**: permissions can be granted or revoked at runtime via the GraphQL API

### 🔒 **Advanced Security Features**

- **Challenge-Response Authentication**: Cryptographic proof of wallet ownership
- **JWT Token Management**: Secure session handling with automatic expiration
- **Credential Verification**: Real-time validation against the Renown API
- **Session Management**: Multiple active sessions with individual controls

### 🌐 **Cross-Platform Compatibility**

- **GraphQL Integration**: Native GraphQL support with authentication middleware
- **REST API Support**: Standard HTTP authentication headers
- **Multi-Origin Support**: Configurable CORS and origin restrictions
- **Mobile & Desktop**: Works across all platforms and devices

## How It Works Under the Hood

### 1. **Authentication Flow Architecture**

```
User Wallet → Challenge Request → Signature → Token Generation → Session Creation
     ↓              ↓              ↓            ↓              ↓
  Ethereum    Nonce + Message   Signed      JWT Token     Active Session
  Address     (Cryptographic)   Message     (Verifiable)  (Authorized)
```

### 2. **Decentralized Identity Creation**

The system uses the **Renown** service to create and manage decentralized identities:

```typescript
// DID Format: did:pkh:eip155:1:0x1234...
interface PKHDid {
  networkId: string; // Network identifier (e.g., "mainnet")
  chainId: number; // Blockchain chain ID (e.g., 1 for Ethereum mainnet)
  address: `0x${string}`; // Ethereum wallet address
}
```

**Key Benefits:**

- **Self-Sovereign**: Users control their own identity without central authority
- **Portable**: Identity can be used across different applications
- **Verifiable**: Cryptographic proof of ownership and authenticity
- **Privacy-Preserving**: No personal information required

### 3. **Challenge-Response Authentication**

Instead of traditional username/password, the system uses cryptographic challenges:

```typescript
// Step 1: Create Challenge
const challenge = await createChallenge(userAddress);
// Returns: { nonce: "random-string", message: "Sign this message: ..." }

// Step 2: User Signs Message
const signature = await signMessage(challenge.message);

// Step 3: Verify Signature
const token = await solveChallenge(challenge.nonce, signature);
```

**Security Features:**

- **Nonce-based**: Prevents replay attacks
- **Cryptographic Proof**: Verifies wallet ownership
- **Time-limited**: Challenges expire quickly
- **Unique per Session**: Each login uses a different challenge

### 4. **Verifiable Credentials System**

The system leverages W3C Verifiable Credentials for identity verification:

```typescript
interface VerifiableCredential {
  "@context": ["https://www.w3.org/2018/credentials/v1"];
  type: ["VerifiableCredential"];
  credentialSubject: {
    chainId: number;
    networkId: string;
    address: string;
  };
  issuer: string; // DID of the credential issuer
  issuanceDate: string; // When credential was created
  proof: object; // Cryptographic proof of authenticity
}
```

**Verification Process:**

1. **Token Decoding**: Extract credential information from JWT
2. **Credential Validation**: Verify against W3C standards
3. **Issuer Verification**: Check credential issuer authenticity
4. **Credential Existence Check**: Validate credential still exists and is valid — against a remote Renown/Switchboard or this switchboard's own read model (see [Which Renown Instance Is Used](#which-renown-instance-is-used))
5. **User Extraction**: Create user object from verified credentials

### 5. **Authorization**

Authentication produces a verified user; authorization is then decided by a global admin list plus per-document permissions:

```typescript
interface AuthConfig {
  enabled: boolean;
  admins: string[]; // Wallet addresses with global admin (bypass) access
  skipCredentialVerification?: boolean; // DANGER (test/dev only): skips the Renown credential re-check, the only binding between a token's claimed address and its signing key — allows identity spoofing. Refused at boot unless VITEST/NODE_ENV=test or ALLOW_INSECURE_SKIP_CREDENTIAL_VERIFICATION=true.
}
```

**How access is decided:**

- **Supreme Admins**: addresses in `admins` bypass every check
- **Document Owners**: implicit ADMIN on documents they create
- **Per-Document Grants**: READ / WRITE / ADMIN granted to users or groups, inherited from protected ancestors

#### Attachments

An attachment is readable by whoever may read the document that references it.
`GET /attachments/:hash/download-target` decides that twice over: the caller
must be able to read the document's `global` scope, and the reference index
must confirm that the document really does reference this hash. A denial is a
single generic `404` either way, so it never tells the caller which of the two
failed.

Which model answers the first half is the deployment's choice, and by default it
is the permission tables above — unchanged.

```bash
# Decide an attachment read with the referencing document's own policy
export ATTACHMENT_READS_FOLLOW_DOCUMENT_POLICY=true
```

With it on, the document's **own policy** decides, evaluated for the caller's
subject: their address *and* the `did:key` of the app instance whose token
authenticated them, because a grant can name either and a document's creator is
recorded by key. It needs a policy model to evaluate, which auth enforcement is
what supplies, and refuses to boot without one rather than leave the tables
deciding while the configuration says otherwise.

Why a deployment would want it: one whose documents carry policies keeps no rows
in the permission tables, so asking those tables about such a document returns
whatever the host-wide policy says — under `OPEN`, `true`, for every caller
including an anonymous one. Handing out bytes on that answer gives the file to
anyone who learns its hash, which the document's own state may well have told
them before their access was taken away.

Two things to know before turning it on. A document that carries **no** policy
stays readable, because an uninitialized policy is not a denial — unless the
host also sets `DEFAULT_PROTECTION`, which tells the gate to withhold what it
cannot decide, and then attachments on unpolicied documents are refused along
with everything else about them. And every non-browser client that downloads
bytes — an extraction worker, an indexer — needs a read grant of its own on the
documents it fetches, or it stops working the moment this is enabled.

The presigned URL a target carries is short-lived by design: the authorization
behind it is decided once, when it is issued, and the URL keeps working until it
expires however the policy changes in between. The default ceiling is **300
seconds**, and it applies whether or not the caller asked for a lifetime —
otherwise omitting `expiresIn` would be a way to opt out of it.

```bash
# Raise it if a deployment genuinely needs longer; still bounded by the
# 7-day maximum a SigV4 signature can carry.
export ATTACHMENT_DOWNLOAD_TARGET_MAX_TTL_SECONDS=1800
```

### 6. **Session Management**

Advanced session handling with multiple active sessions:

```typescript
interface Session {
  id: string;
  createdAt: Date;
  createdBy: string;
  referenceExpiryDate?: Date;
  referenceTokenId?: string;
  isUserCreated?: boolean;
  name?: string;
  revokedAt?: Date;
  allowedOrigins?: string;
}
```

**Session Features:**

- **Multiple Sessions**: Users can have several active sessions
- **Custom Names**: Human-readable session identifiers
- **Expiration Control**: Configurable session lifetimes
- **Origin Restrictions**: Limit where sessions can be used
- **Revocation**: Immediate session termination capability

## How to Use the Authentication System

### 1. **Basic Configuration**

#### Environment Variables Method

```bash
# Enable authentication
export AUTH_ENABLED=true

# Configure admin wallet addresses (comma-separated)
export ADMINS="0x111,0x222,0x333"
```

`AUTH_ENABLED` does two things: it selects the authorization policy
(`ADMIN_ONLY` instead of `OPEN`) **and** it makes the middleware verify the
bearer so `ctx.user` is populated. `RESOLVE_CALLER_IDENTITY` separates the
second from the first:

```bash
# Read the bearer and populate ctx.user, whatever the policy is
export RESOLVE_CALLER_IDENTITY=true
```

|                                  | `AUTH_ENABLED` unset       | `AUTH_ENABLED=true`             |
| -------------------------------- | -------------------------- | ------------------------------- |
| `RESOLVE_CALLER_IDENTITY` unset  | no user, `OPEN`            | user resolved, `ADMIN_ONLY`     |
| `RESOLVE_CALLER_IDENTITY=true`   | **user resolved, `OPEN`**  | user resolved, `ADMIN_ONLY`     |

It defaults to whatever `AUTH_ENABLED` is, so a deployment that never sets it
behaves exactly as before. The bold cell is the combination `AUTH_ENABLED`
alone cannot express, and the one a custom subgraph needs when it does its own
authorization: its resolvers learn who is calling without every non-admin
being locked out of switchboard.

It **resolves** an identity and enforces nothing — a request with no token is
still admitted, with no user. Verification is otherwise identical to
`AUTH_ENABLED=true`, Renown credential check included, so an invalid token is
still a 401.

That last property is the hole `REQUIRE_AUTHENTICATED_CALLER` closes: it
turns the same resolved identity into enforcement.

```bash
# Admit authenticated callers, reject anonymous ones with a 401
export REQUIRE_AUTHENTICATED_CALLER=true
```

It defaults to off, so nothing changes for existing deployments. When on,
every GraphQL request without a resolved caller — subgraphs, the supergraph,
and the SSE subscription endpoint alike — is answered with a `401`
(`{"error": "Authentication required"}`) before any resolver runs. It is the
one switch that expresses "authenticated callers allowed, anonymous not":
under `OPEN` the policy itself answers `true` to everything, and
`ADMIN_ONLY` locks out every non-admin, so neither can do this on its own.
CORS preflights (`OPTIONS`) are still admitted, as they never carry a token.

It requires a caller to be resolvable at all, so it refuses to boot without
`RESOLVE_CALLER_IDENTITY=true` or `AUTH_ENABLED=true` — with identity
resolution off, no bearer is ever read and it would reject every caller,
including authenticated ones.

It also covers the attachment routes, which are mounted on the HTTP adapter and
never pass the GraphQL fetch chain. Their own 401 keys on `AUTH_ENABLED`, so
without this switch a deployment running `OPEN` serves them to anyone; with it,
every attachment route refuses a caller it cannot name — `download-target`
included, even though that route decides per document on its own.

##### Serving one path anonymously

Some products have a flow that runs *before* sign-in: previewing an invitation
from the code in its e-mail, for instance, so the screen can say who the
invitation is for. That flow has no caller by definition, and the floor above
would answer it a `401`.

```bash
export REQUIRE_AUTHENTICATED_CALLER=true
export REQUIRE_AUTHENTICATED_CALLER_EXEMPT_PATHS=/graphql/public
```

Comma-separated, so several paths are one variable:

```bash
export REQUIRE_AUTHENTICATED_CALLER_EXEMPT_PATHS=/graphql/public,/graphql/invites
```

Each entry is matched against the request's **pathname, in full** — never as a
prefix, so `/graphql/public` does not also exempt `/graphql/public-admin`. A
trailing slash on either side is ignored; a leading slash is required, and a
path without one is refused at boot rather than left as an exemption that
silently never applies. Configuring exemptions while the floor is off is
refused too: it would describe a protection the server is not applying.

The exempt paths are named in the boot log, because the one question worth
asking about this floor is what is still open.

Every entry is a hole in it. Only ever name a path that serves operations which
are safe without a caller, and prefer a route mounted for exactly that purpose
over exempting one that also serves something else. Note what this switch does
**not** reach, in either configuration: routes registered directly on the HTTP
adapter (`/health`, `/ready`, `/explorer`, `/d/:drive`) and package HTTP routes,
which declare their own `auth` per route.

#### Configuration File Method

```json
{
  "auth": {
    "enabled": true,
    "admins": ["0x111", "0x222", "0x333"]
  }
}
```

#### Which Renown Instance Is Used

Step 4 of the verification process re-checks that the signer's Renown credential
still exists. `auth.renown` says which instance answers that question:

```json
{
  "auth": {
    "enabled": true,
    "admins": ["0x111"],
    "renown": {
      "source": "remote",
      "url": "https://renown.acme.io",
      "switchboardUrl": "https://sb.acme.io/graphql"
    }
  }
}
```

| Field | Env override | Meaning |
| --- | --- | --- |
| `source` | `RENOWN_SOURCE` | `remote` (default) queries another instance; `self` reads this switchboard's own `renown-read-model` subgraph in-process. |
| `url` | `RENOWN_URL` | Renown base URL, used for discovery and the REST fallback. Defaults to `https://www.renown.id`. |
| `switchboardUrl` | `SWITCHBOARD_URL` | A switchboard's GraphQL endpoint to read credentials from directly, skipping discovery. |

Env vars win over the config file field by field; a blank value counts as unset.
With `source: "remote"` the order is `switchboardUrl`, then discovery via `url`,
then the Renown REST API at `url`. With `source: "self"` both URLs are ignored
for verification — but `url` still applies to this switchboard's own identity
(below).

Either way the credential's EIP-712 proof is re-verified and expiry and
delegation binding are re-checked, so a locally stored credential is held to the
same standard as a remote one. Successful checks are cached per identity for
`CREDENTIAL_VERIFICATION_CACHE_TTL_MS` (60s default) in both modes, so
revocation still lags by up to that TTL.

`self` requires a loaded package that provides the `renown-read-model` subgraph
(`@powerhousedao/renown-package`). Startup fails if none does, rather than booting
a switchboard that rejects every authenticated request.

Where the pieces live: `@renown/sdk` owns the read-model contract
(`RENOWN_READ_MODEL_SUBGRAPH`, `createLocalCredentialVerifier`), this app wires
it to the running reactor after the API is up, and `reactor-api` only supplies
the generic `GraphQLManager.executeSubgraphQuery` plus an injectable
`verifyCredential` — core has no knowledge of the renown package. A host that
sets `source: "self"` without injecting a verifier is refused at boot rather
than silently verified against a remote Renown.

#### The Switchboard's Own Identity

Separately from verifying incoming credentials, a switchboard has its own
identity — the `ph login` keypair it uses to authenticate *outbound* to remote
drives and services. It authenticates against `auth.renown.url` too, so one
setting covers both directions. Pass `identity.baseUrl` when starting the server
to point it somewhere else; unset everywhere, it falls back to
`https://www.renown.id`.

### 2. **Frontend Integration**

#### Using the useAuth Hook

```typescript
import useAuth from '../hooks/useAuth';

function LoginComponent() {
  const { signIn, signOut, isAuthorized, address } = useAuth();

  if (!isAuthorized) {
    return (
      <button
        onClick={signIn}
        className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded"
      >
        Sign in with Ethereum
      </button>
    );
  }

  return (
    <div>
      <p>Welcome, {address}</p>
      <button onClick={signOut}>Sign Out</button>
    </div>
  );
}
```

#### Session Management

```typescript
const { createSession, revokeSession, sessions } = useAuth();

// Create a new session
const token = await createSession(
  "My API Token", // Session name
  3600, // Expiry in seconds (1 hour)
  "https://myapp.com", // Allowed origin
);

// Revoke a session
await revokeSession(sessionId);
```

### 3. **Backend Integration**

#### Express Middleware Setup

```typescript
import { AuthService } from "@powerhousedao/reactor-api";

const authService = new AuthService({
  enabled: true,
  admins: ["0x111", "0x222"],
});

// Verify the Bearer token on each request. `verifyBearer` returns either an
// AuthContext ({ user?, admins, auth_enabled }) or a Response (e.g. 401) when
// the token is invalid, expired, or revoked.
app.use(async (req, res, next) => {
  const result = await authService.verifyBearer(req.headers.authorization);

  if (result instanceof Response) {
    // Invalid / expired / revoked token — forward the 401.
    res.status(result.status).json(await result.json());
    return;
  }

  if (result.auth_enabled && !result.user) {
    // Auth is enabled but the request is anonymous.
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  req.auth = result; // stash { user?, admins, auth_enabled } for handlers
  next();
});

// Access the authenticated context in route handlers
app.post("/api/data", (req, res) => {
  const { user, admins } = req.auth;
  const isAdmin = !!user && admins.includes(user.address);

  if (isAdmin) {
    // Admin-only operations
  }
});
```

#### GraphQL Context Integration

```typescript
const graphqlManager = new GraphQLManager(/* config */);

// Add auth context fields
graphqlManager.setAdditionalContextFields(
  authService.getAdditionalContextFields(),
);
```

### 4. **API Authentication**

#### HTTP Headers

```bash
# Include JWT token in Authorization header
curl -H "Authorization: Bearer <your-jwt-token>" \
     https://api.example.com/data
```

#### GraphQL Queries

```typescript
// Apollo Client with auth link
const authLink = setContext((_, { headers }) => ({
  headers: {
    ...headers,
    authorization: token ? `Bearer ${token}` : "",
  },
}));

const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
});
```

### 5. **Advanced Features**

#### Custom Session Creation

```typescript
// Create a long-lived API token
const apiToken = await createSession(
  "API Integration Token",
  86400 * 30, // 30 days
  "*", // Allow all origins
);

// Create a restricted session
const restrictedToken = await createSession(
  "Mobile App Token",
  86400 * 7, // 7 days
  "https://mobile.myapp.com", // Restrict to mobile app
);
```

#### Admin-Only Route Protection

```typescript
// Middleware for admin-only routes
const requireAdmin = (req, res, next) => {
  const { user, admins } = req.auth;
  if (!user || !admins.includes(user.address)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

app.post("/admin/users", requireAdmin, (req, res) => {
  // Admin-only user management
});
```

## Security Considerations

### 🔒 **Best Practices**

1. **Token Storage**: Store tokens securely (localStorage for web, secure storage for mobile)
2. **Session Expiry**: Set reasonable expiration times for different use cases
3. **Origin Restrictions**: Limit session usage to specific domains when possible
4. **Regular Rotation**: Encourage users to rotate their sessions periodically
5. **Revocation**: Provide easy ways for users to revoke compromised sessions

### 🚨 **Security Features**

- **Automatic Expiration**: Sessions automatically expire based on configuration
- **Immediate Revocation**: Sessions can be revoked instantly if compromised
- **Credential Validation**: Real-time verification against the Renown API
- **Cryptographic Proof**: All authentication uses cryptographic signatures
- **No Password Storage**: No passwords to compromise or leak

## Troubleshooting

### Common Issues

1. **"Missing authorization token"**
   - Ensure the Authorization header is included
   - Check that the token format is `Bearer <token>`

2. **"Verification failed"**
   - Token may be expired or malformed
   - Check token validity and renewal

3. **"Credentials no longer valid"**
   - User's Renown credentials may have been revoked
   - Re-authenticate through the wallet connection

4. **"Forbidden"**
   - User's wallet address not in allowed roles
   - Check role configuration and user permissions

## Performance Optimization

### Scalability Features

- **Stateless Design**: No server-side session storage required
- **Distributed Validation**: Credentials can be verified across multiple nodes
- **Efficient Lookups**: O(1) role checking using Set data structures

## Conclusion

The Powerhouse authentication system provides a robust, secure, and flexible foundation for decentralized applications. By combining blockchain-based identity with traditional role-based access control, it offers the best of both worlds: the security and privacy of Web3 with the familiarity and flexibility of enterprise authentication systems.

Whether you're building a simple web app or a complex enterprise system, the authentication system scales to meet your needs while maintaining the highest security standards. The decentralized nature ensures user privacy and control, while the role-based system provides the administrative oversight needed for production applications.

For more information and advanced usage examples, refer to the Powerhouse documentation and community resources.

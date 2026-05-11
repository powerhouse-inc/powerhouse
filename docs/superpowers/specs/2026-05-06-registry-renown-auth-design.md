# Registry Renown Auth (Design)

**Status:** Approved (Frank, 2026-05-06)
**Affected:** `packages/registry` (server), `clis/ph-cli` (publish + new `registry login`), `packages/shared/registry` (helpers), `powerhouse-k8s-hosting/powerhouse-chart` + dev tenant values.

## 1. Problem

The Powerhouse registry (verdaccio behind a thin express wrapper) authenticates publishes via verdaccio's htpasswd plugin. Login state is per-pod: `npm login` writes a line to `/data/htpasswd` on whichever pod handled the request, and verdaccio's signing secret is per-pod-startup. With `replicaCount: 3` + `persistence.kind: emptyDir`, a publish that lands on a different pod from the login is rejected. Today this manifests as "retry until you happen to hit the right pod."

Meanwhile, `ph login` (renown) already gives every developer a cryptographically verifiable identity via `@renown/sdk`. JWTs minted from that identity are verifiable on any pod with no shared state — the public key is derivable from the issuer's DID. That's the natural lever.

## 2. Decisions (from brainstorm)

1. **Who can publish:** anyone with a Renown identity. Reads stay public (`access: $all`).
2. **Developer flow:** single login. `ph login` once, then `ph publish` mints a fresh short-lived registry-bound JWT per invocation. Plus a small `ph registry login` helper for raw `npm publish` / CI flows that writes a longer-lived token to `~/.npmrc`.
3. **Identity in manifest:** Ethereum address as `_npmUser.name`; custom `_renownDid` field stamped onto the manifest body for downstream tooling.
4. **Migration:** grace period — htpasswd plugin stays in the verdaccio config, but with emptyDir-per-pod it's effectively a no-op for end-users today. The grace period is just defense-in-depth so a stray legacy account doesn't hard-401.
5. **Multi-registry:** server learns its own audience from `PH_REGISTRY_PUBLIC_URL`. Tokens are bound to a single registry hostname via the JWT `aud` claim. Same image, different env, deploys independently as `registry.dev.vetra.io` / `registry.vetra.io` / future tenants.

## 3. Architecture

```
[client] ── Bearer <renown-jwt> ──> [ingress] ── any pod ──>
   express app:
     renown-auth middleware
       - verifyAuthBearerToken(jwt)               // signature + exp, via @renown/sdk/node
       - require payload.aud === PH_REGISTRY_PUBLIC_URL
       - require credentialSubject.address present
       - mint a verdaccio-format JWT (signPayload from @verdaccio/signature)
         signed with the per-pod verdaccio.secret;
         payload: { name: address, real_groups: ['$authenticated','renown'], groups: [...] }
       - replace req.headers.authorization with the verdaccio JWT
       - attach req.renownUser = { address, did, networkId, chainId } for hooks
     publish hook (existing createPublishHook):
       - on PUT, if req.renownUser, stamp _renownDid on the manifest body
   verdaccio handler:
     - apiJWTmiddleware accepts the swapped JWT (signed with the secret it knows)
     - allow_publish: $authenticated → permits write
     - storage layer writes to S3 (already shared across pods)
```

Stateless because the renown JWT is signature-verifiable from the DID alone, and the verdaccio JWT we mint never leaves the pod (it lives only for the duration of one request, signed with whatever per-pod secret verdaccio happens to have generated). No shared HMAC secret, no shared session store, no sticky sessions.

## 4. Server changes (`packages/registry`)

### 4.1 New file: `src/auth/renown-middleware.ts`

```ts
import type { Request, Response, NextFunction } from "express";
import { signPayload } from "@verdaccio/signature";
import { verifyAuthBearerToken } from "@renown/sdk/node";

export interface RenownAuthOptions {
  publicUrl: string; // expected `aud` claim
  verdaccioSecret: string; // shared with the runServer config
}

export function createRenownAuthMiddleware(opts: RenownAuthOptions) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return next();

    const token = header.slice(7);
    const verified = await verifyAuthBearerToken(token).catch(() => false);
    if (!verified) return next(); // fall through to verdaccio's own auth path

    const payload =
      (verified.verifiableCredential as any).payload ?? verified.payload;
    const aud = payload?.aud;
    const expectedAud = opts.publicUrl;
    const audOk = Array.isArray(aud)
      ? aud.includes(expectedAud)
      : aud === expectedAud;
    if (!audOk) return next(); // not for this registry → unauthenticated

    const subject = verified.verifiableCredential.credentialSubject;
    if (!subject?.address) return next();

    const groups = ["$authenticated", "renown"];
    const verdaccioJwt = await signPayload(
      {
        name: subject.address.toLowerCase(),
        real_groups: groups,
        groups,
      } as any,
      opts.verdaccioSecret,
      { expiresIn: "5m" },
    );

    req.headers.authorization = `Bearer ${verdaccioJwt}`;
    (req as any).renownUser = {
      address: subject.address.toLowerCase(),
      chainId: subject.chainId,
      networkId: subject.networkId,
      did: payload?.iss,
    };
    next();
  };
}
```

Notes:

- `verifyAuthBearerToken` already validates signature + `exp`. We additionally enforce `aud` here.
- On any failure we fall through (`next()`) without setting auth — verdaccio's normal path handles the request, which means anonymous for reads ($all) and 401 for writes ($authenticated). Falling through is what enables the htpasswd grace period to keep working.

### 4.2 `src/run.ts`: wire it in

Mount the middleware before the verdaccio handler. Read config from `RegistryConfig.renown`. Set verdaccio's top-level `secret` to a per-pod random value (generated at startup if not provided) so `signPayload` and verdaccio's `verifyJWTPayload` agree.

```ts
const verdaccioSecret =
  config.verdaccioSecret ?? crypto.randomBytes(32).toString("hex");
verdaccioConfig.secret = verdaccioSecret;
verdaccioConfig.security = {
  ...(verdaccioConfig.security as any),
  api: {
    jwt: { sign: { expiresIn: "5m" } },
    ...(verdaccioConfig.security?.api ?? {}),
  },
};

if (config.renown?.enabled) {
  app.use(
    createRenownAuthMiddleware({
      publicUrl: config.renown.publicUrl,
      verdaccioSecret,
    }),
  );
}
```

### 4.3 `src/middleware.ts`: stamp `_renownDid` on publish

Inside `createPublishHook`, before calling `originalEnd`, when `req.renownUser` is present, parse the manifest body and inject `_renownDid` into the version object's `_npmUser` block (or as a top-level custom field on the version manifest). Use the npm publish protocol's body shape: PUT body contains a "package document" with `versions: { [v]: <manifest> }`.

```ts
const body = req.body as any;
const versions = body?.versions ?? {};
for (const v of Object.keys(versions)) {
  if (typeof versions[v] === "object") {
    versions[v]._renownDid = (req as any).renownUser?.did;
  }
}
```

Note: this runs _before_ verdaccio writes the manifest, because our publish hook is a middleware that wraps `res.end`. The mutation to `req.body` doesn't propagate to verdaccio unless we re-serialize. Practical alternative: skip stamping the manifest body and instead set a side-channel (S3 metadata / a separate `manifest-meta.json` per package). For v1 we go simpler — only stamp on the response side and accept that `_renownDid` is best-effort metadata. **Decision: defer manifest stamping.** v1 just attaches `_renownDid` to the registry's _publish notification_ (SSE + webhook payloads), which is enough for downstream tooling to know who published. Extending to the manifest itself is a clean follow-up once we move custody of the manifest body into our middleware.

### 4.4 `src/types.ts`

```ts
export interface RegistryConfig {
  // ...existing fields...
  verdaccioSecret?: string; // optional override; otherwise randomized
  renown?: {
    enabled: boolean;
    publicUrl: string; // e.g. https://registry.dev.vetra.io
  };
}
```

### 4.5 `src/cli.ts`: env vars + flags

- `--public-url` flag, fallback `PH_REGISTRY_PUBLIC_URL`
- `--auth-renown` flag, fallback `PH_REGISTRY_AUTH_RENOWN` (default `true` when public-url is set)
- `--verdaccio-secret` flag, fallback `PH_REGISTRY_VERDACCIO_SECRET` (default: random per-pod)

### 4.6 Notification payload extension

Add `publishedBy?: { address, did }` to publish/unpublish notifications. SSE event JSON gains the field; webhook subscribers see it too.

### 4.7 Dependencies

Add `@renown/sdk` and `@verdaccio/signature` to `packages/registry/package.json` (the latter is already transitively present via verdaccio).

## 5. CLI changes (`clis/ph-cli` + `packages/shared`)

### 5.1 `clis/ph-cli/src/commands/publish.ts`

Replace the htpasswd `checkNpmAuth` precheck with a renown precheck:

1. Resolve registry URL (existing logic).
2. Load renown via `getRenown()` (existing helper); require `renown.user` (logged in).
3. Mint a token via `generateAccessToken(renown, { expiresIn: 300, aud: registryUrl })`.
4. Pass to npm via the registry-scoped config flag:

   ```
   npm publish --registry <url> --//<host>/:_authToken=<jwt> ...forwardedArgs
   ```

   This is npm's standard config-flag form for per-registry tokens. No `.npmrc` mutation required.

5. If renown is not configured, fall back to current behavior (`checkNpmAuth` + npm publish), preserving back-compat for anyone who has `npm adduser`'d into a single-pod-era registry.

Implementation lives in a new helper `mintRegistryToken(registryUrl, expiresInSeconds)` exported from `packages/shared/registry`.

### 5.2 New: `clis/ph-cli/src/commands/registry-login.ts`

```
ph registry login [--registry <url>] [--expiry 30d]
```

1. Resolve registry URL.
2. Mint token (`generateAccessToken` with `aud=registryUrl`, expiresIn from `--expiry`).
3. Read `~/.npmrc`, replace any existing `//<host>/:_authToken=…` for that host with the new value, write it back.
4. Print the host + expiry to stderr; do not echo the token.

Wires into `clis/ph-cli/src/commands/index.ts` and `clis/ph-cli/src/commands/ph-cli-commands.ts`.

### 5.3 New args module: `packages/shared/clis/args/registry.ts`

Defines `registryLoginArgs` (registry url, expiry, debug).

### 5.4 New helper module: `packages/shared/registry/npmrc.ts`

`writeRegistryAuthToken(host, token)` — atomic update of `~/.npmrc`, preserving other lines.

### 5.5 Token expiry parsing

Reuse `parseExpiry` from `@renown/sdk/node`. Same syntax as `ph access-token --expiry`.

## 6. Helm chart changes (`powerhouse-k8s-hosting/powerhouse-chart`)

### 6.1 `templates/registry-deployment.yaml`

The `env` block already iterates `.Values.registry.env`. No template changes needed — values just add new keys.

### 6.2 `tenants/dev/powerhouse-values.yaml`

```yaml
registry:
  # ... existing ...
  env:
    PORT: "4873"
    NODE_ENV: development
    NODE_OPTIONS: "--max-old-space-size=3072"
    PH_REGISTRY_PUBLIC_URL: "https://registry.dev.vetra.io"
    PH_REGISTRY_AUTH_RENOWN: "true"
```

That's it for dev. Other tenants are unchanged until they opt in.

For `registry.vetra.io` later: same env block with `PH_REGISTRY_PUBLIC_URL: "https://registry.vetra.io"`.

## 7. Failure modes

- **Renown SDK throws on a malformed JWT.** Caught in middleware; falls through to verdaccio's normal path.
- **Token's `aud` doesn't match registry's `publicUrl`.** Falls through; effectively unauthenticated; publish gets 401. Operator's TODO is to make sure CLI passes `--registry <correct-url>` so the audience matches.
- **Renown DID resolution upstream is down.** `verifyAuthBearerToken` fails, we fall through, publish 401s. Acceptable for v1; renown availability is a hard prereq for the design.
- **Per-pod `verdaccio.secret` rotation under HPA scale-up.** A request mints its verdaccio JWT and forwards within the same handler — the JWT never crosses pods, so per-pod secrets are fine.
- **htpasswd cleanup later.** When we flip the grace period off (separate PR, weeks later), the verdaccio config drops the htpasswd plugin entirely. Flip is a values-only change in the chart (no code).

## 8. Out of scope

- Manifest-body `_renownDid` stamping (deferred per §4.3).
- Renown auth on read paths.
- Per-scope publish allowlists (`@powerhousedao/*` reserved for admins). Trivial later via env var (e.g. `PH_REGISTRY_PROTECTED_SCOPES`).
- Token revocation. Renown bearer tokens are signature-verified, not stored — revoking means rotating the user's CLI keypair. Acceptable for v1.
- `ph registry logout` command. Users can `npm logout` or strip the `.npmrc` line manually. Easy follow-up.

## 9. Implementation order

1. `packages/registry`: types, middleware, `run.ts` wiring, CLI flags. Smoke-test locally with a published pkg.
2. `packages/shared/registry`: `mintRegistryToken` + `writeRegistryAuthToken` helpers.
3. `clis/ph-cli`: rewrite `publish.ts`, add `registry-login.ts`, register commands.
4. Helm chart values for dev tenant.
5. Build + push registry image; bump tag in dev values; ArgoCD sync.
6. End-to-end test: `ph login`, then `ph publish` from a sandbox package against `registry.dev.vetra.io`.

# Registry Renown Auth via Verdaccio Plugin (Design)

**Status:** Approved (Frank, 2026-05-06)
**Replaces:** `2026-05-06-registry-renown-auth-design.md` (the express-middleware-secret-swap approach).
**Affected:** `packages/registry` only — all changes scoped to the server.

## 1. Why we're redesigning

The first cut shipped Renown auth as an express middleware in front of verdaccio. The middleware verified the Renown JWT, then minted a verdaccio-format JWT signed with `verdaccioConfig.secret` so verdaccio's `apiJWTmiddleware` would accept it. Three rollouts later (dev.218 → dev.223), `/-/whoami` still returns `{}` for valid Renown tokens. Root cause: verdaccio's `Config.checkSecretKey` runs against the **storage plugin's persisted secret** (e.g. `<storage>/.verdaccio-db.json`), not the value we passed in `config.secret`. The middleware signs with our value; verdaccio verifies with a different value; signatures never match.

The fix the team lead pointed at — `IPluginAuth.apiJWTmiddleware` — replaces the entire signing/verifying dance with: tell verdaccio directly who the user is. Verdaccio's loader calls our plugin's `apiJWTmiddleware(helpers)`, the returned handler sets `req.remote_user = helpers.createRemoteUser(...)`, no secret needed.

## 2. Decisions carried over from the prior brainstorm

(All previously approved; restated for completeness.)

1. **Who can publish:** anyone with a Renown identity. Reads stay public (`access: $all`).
2. **Developer flow:** `ph login` once, then `ph publish` mints a fresh 5-min token per call; `ph registry-login` writes a longer-lived token to `~/.npmrc` for raw `npm publish` / CI.
3. **Identity in manifest:** lowercase Ethereum address as `_npmUser.name`; `publishedBy: { address, did }` on SSE/webhook notification payloads.
4. **Migration:** htpasswd plugin stays next to `auth-renown` in the verdaccio plugin chain (grace period).
5. **Multi-registry:** each deployment configures its own `PH_REGISTRY_PUBLIC_URL`. JWTs are audience-bound to that URL; cross-registry replay rejected by did-jwt.

## 3. Architecture

```
[client] ── Authorization: Bearer <renown-jwt> ──> [pod]
   express app:
     // existing routes (powerhouse router + publish/unpublish hooks)
     // verdaccio handler:
     verdaccio's auth.apiJWTmiddleware() ── delegated to our plugin ──┐
                                                                      ▼
                                          [verdaccio-auth-renown plugin]
                                            - extract bearer
                                            - peek JWT alg; skip if not ES256/ES256K/EdDSA
                                            - verifyAuthBearerToken(jwt, { audience })
                                            - on success: req.remote_user = helpers.createRemoteUser(addr, ['$authenticated','renown'])
                                            - on failure: req.remote_user = helpers.createAnonymousRemoteUser()
     verdaccio downstream:
       allow_publish: $authenticated → permits
       /-/whoami → returns address as username
       publish PUT → accepts, writes to S3
   our publish hook (existing):
     reads req.remote_user.name (the eth address) → stamps publishedBy on SSE/webhook
```

Stateless: a Renown JWT is signature-verifiable from the issuer's DID alone, no shared HMAC secret across pods, no per-pod random whose lifecycle has to match verdaccio's.

## 4. Components

### 4.1 New: `packages/registry/src/auth/verdaccio-auth-renown-plugin.ts`

The plugin module. Implements the subset of `IPluginAuth` we need: `apiJWTmiddleware`, plus the boilerplate stubs verdaccio expects (`authenticate`, `allow_access`, `allow_publish`).

Behavior:

- `apiJWTmiddleware(helpers)` returns an express handler that:
  1. Reads `req.headers.authorization`. No bearer → anonymous.
  2. Decodes the JWT header to peek at `alg`. If not in `{ES256, ES256K, EdDSA}` → anonymous (silences the noisy RS256 console.error from `@renown/sdk` we saw in pod logs).
  3. Calls `verifyAuthBearerToken(token, { audience: cfg.publicUrl })`. Caught failure → anonymous.
  4. Reads `verified.verifiableCredential.credentialSubject.address` → lowercased → `helpers.createRemoteUser(addr, ['$authenticated', 'renown'])`.
- `authenticate(user, password, cb)` → `cb(null, false)` (we never use Basic auth on Renown).
- `allow_access(user, pkg, cb)` → `cb(null, true)` (per-package `access: $all` in verdaccio config drives this; the plugin's hook is permissive by default).
- `allow_publish(user, pkg, cb)` → `cb(null, user.real_groups.includes('$authenticated'))`. Tightens it: only authenticated users (renown OR htpasswd) may publish.

Default export is a factory `(config, params) => RenownAuthPlugin` so verdaccio's plugin loader can `require()` and call it.

### 4.2 Build entry: `packages/registry/tsdown.config.ts`

Add a second tsdown entry that emits a CJS file at `dist/verdaccio-auth-renown.cjs`. CJS is required because verdaccio's loader is `require()`-based and `@verdaccio/loaders` cannot import an ESM module synchronously.

### 4.3 Verdaccio config: `packages/registry/src/verdaccio-config.ts`

Drops the `secret:` and `security.api.jwt` overrides we added in the previous design — they were workarounds for the JWT swap and are now load-bearing for nothing.

Adds:

- `plugins: <abs path to packages/registry/dist>` so verdaccio's loader knows where to look.
- `auth: { 'auth-renown': { publicUrl }, htpasswd: { file: ... } }` when `config.renown` is set; just `htpasswd` otherwise. Order matters — verdaccio tries plugins in declared order; renown first means valid Renown bearers win immediately.

### 4.4 `packages/registry/src/run.ts` cleanup

Removes:

- `randomBytes` import.
- `verdaccioSecret` / `verdaccioSecretArg` derivation.
- `effectiveVerdaccioSecret` post-runServer read of `verdaccioConfig.secret` (the workaround that didn't work).
- The `app.use(createRenownAuthMiddleware(...))` mount.
- The diagnostic console.logs added during debugging.

Adds: nothing. The plugin is wired through verdaccio's normal loader, not our express stack.

### 4.5 `packages/registry/src/auth/renown-middleware.ts`

Deleted. The plugin replaces it entirely.

### 4.6 `packages/registry/src/types.ts` + `cli.ts`

Removes `verdaccioSecret` from `RegistryConfig` and `RegistryCommandArgs`. Removes the `--verdaccio-secret` / `PH_REGISTRY_VERDACCIO_SECRET` CLI option from `cli.ts`. The publish hook keeps reading the publisher identity but switches from `req.renownUser.address` to `req.remote_user.name` (verdaccio's standard).

### 4.7 Notification payload: unchanged

`publishedBy: { address, did }` continues to be stamped on SSE + webhook events. Source switches from `req.renownUser` to `req.remote_user`. The `did` field becomes optional / best-effort — `req.remote_user` doesn't carry the issuer DID. We can add it back via a small additional field on the plugin's RemoteUser if downstream consumers need it; deferred.

## 5. Tests

### 5.1 Unit tests: `packages/registry/tests/verdaccio-auth-renown-plugin.test.ts`

- No bearer → `createAnonymousRemoteUser` called once, no SDK calls.
- Bearer with `alg: RS256` → anonymous, SDK never called.
- Bearer with valid Renown JWT + matching audience → `createRemoteUser(address, ['$authenticated','renown'])`.
- Bearer with wrong audience → anonymous (SDK rejects via did-jwt's `audience` option).
- `allow_publish` permits when `real_groups` contains `$authenticated`, denies otherwise.
- `allow_access` always permits (delegated to package config).

### 5.2 Local end-to-end (mandatory before push)

- Boot registry locally with `PH_REGISTRY_PUBLIC_URL=http://localhost:8765`, `PH_REGISTRY_AUTH_RENOWN=true`, no S3.
- `ph access-token --audience http://localhost:8765` → `curl -H "Authorization: Bearer <jwt>" .../-/whoami` returns `{"username": "0x..."}` (NOT `{}`).
- `npm publish --//localhost:8765/:_authToken=<jwt>` of a small test package → 201 / success.
- `npm publish` with no token → 401.
- `ph publish` from a sandbox package → succeeds.

This local check is a hard gate. The previous failure mode (mocked tests pass, real integration broken) was caused by skipping it.

## 6. Out of scope

- Per-scope publish allowlists (`@powerhousedao/*` reserved for admins). Trivial later via env var read by the plugin.
- Token revocation — same constraint as before, Renown bearers are signature-verified, not stored. Rotate the user's CLI keypair to revoke.
- Promoting the plugin to a separately-published `@powerhousedao/verdaccio-auth-renown` package. Sensible after this is stable for a few weeks; not now.
- Stamping `_renownDid` on publish notifications. Easy follow-up once we add a side-channel from the plugin to the publish hook.

## 7. Implementation order (writing-plans input)

1. Plugin module + factory + unit tests.
2. tsdown second entry for CJS output.
3. `verdaccio-config.ts` — replace `secret`/`jwt` overrides with `plugins` + `auth: { auth-renown }`.
4. `run.ts` — delete express middleware mount + `verdaccioSecret` plumbing.
5. Delete `auth/renown-middleware.ts` and the related test file.
6. Drop `verdaccioSecret` from types/cli.
7. Update publish hook to read `req.remote_user.name`.
8. Local e2e validation (whoami + publish) — must pass before push.
9. Push, release, deploy, observe `/-/whoami` returns the user's address.

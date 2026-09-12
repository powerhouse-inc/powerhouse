# Investigation — upstream bug report `6.2.2-dev.85`

Source report: `upstream-bugs-6.2.2-dev.85.md` (six defects found while building vault
authorization on `feat/vault-authorization`, reported against `6.2.2-dev.85`, re-verified by
the reporter against `main` @ `4f706b7` for items 1-4 only).

Investigated here against **`9a3ddb34b`** (branch `fix/lib-bugs`, off `main`). One agent per
defect; each verified the code, designed an isolated repro, and ranked fixes. No source was
changed — this document is the finding, not the fix.

## Verdict table

| # | Defect | Verified at `9a3ddb34b` | Report's own suggested fix |
|---|--------|-------------------------|----------------------------|
| 1 | Unbound `logger.error` in `.catch` | **YES — and 3 sites, not 1** | **Broken** — doesn't typecheck; its regression test false-greens |
| 2 | Tokenless WS → close 4500, no retry | **YES — reproduced live** | **Broken** — 4401 is also non-retryable; only 4403 retries |
| 3 | `SyncManager` drops remote on `init()` failure | **YES** | Usable, but wrong field names and a wrong negative case |
| 4 | Renown `returnUrl` drops the query string | **YES — red test in real Chromium** | **Unsafe as written** — round-trips stale `?user=` + Privy params |
| 5 | `DriveAuthRequiredModal` has no way out | **YES** (built chunk hash identical to the dev.85 dist) | Half right — backdrop dismissal contradicts documented intent |
| 6 | Attachment read model won't replay across an ordinal hole | **YES — reproduced** | **Correct** (the only one) |

## Cross-cutting notes

- **Three of the six suggested fixes would not work as written.** Items 1, 2 and 4 each need a
  materially different change; see the per-bug sections.
- **Item 2 is not purely a bug.** The tokenless-WS refusal is a recorded decision pinned by a
  test with an explanatory comment (`packages/reactor-api/test/auth.service.resolve-identity.test.ts:225-235`).
  The *close code* is a bug under either policy; *admitting anonymous WS* is a policy reversal
  that needs human sign-off.
- **Item 6's "silently swallowed" claim is false at this HEAD** — it logs at error level on every
  write after the hole. The real second defect there is different: read-model factory failures are
  fatal at boot while the processor manager's are not.
- **Each investigation found something the report missed**, listed per section. The most consequential:
  bug 1 has two more defective sites (one live in Switchboard's Vite loader); bug 2 has a second
  asymmetry in the opposite direction (WS *admits* anonymous where HTTP refuses); bug 3's catch
  blocks leak half-registered remotes; bug 4's stale-`?user=` hazard is live because Connect never
  consumes the param.
- **Suggested ordering if these get fixed:** 1 first (cheap, and it masks every `useDispatch`
  rejection, including the Forbidden writes the other defects produce — but note it does *not* mask
  2-6 themselves: 2 is server-side, 3 logs through a correctly-bound `this.logger`, 4 and 5 are
  silent by nature, 6 logs at error level). Then 6 and 3 (data / availability), then 4 and 5 (the
  share-link flow), then 2 (which needs a policy decision first).
- **Bugs 3 and 5 interact and should be fixed together** — see the correction in bug 3 (b)(3).

---

# Bug 1 — unbound logger.error in .catch (VERIFIED, WORSE: 3 sites)

## (a) Verified: YES, ran it
node repro.mjs against the worktree's built document-model:
  singleton logger.error (bare): TypeError: Cannot read properties of undefined (reading '#level')
  child logger.error (bare):     same
  arrow wrapper (control):       NO THROW
#level is a true ECMAScript private field — packages/document-model/src/logger.ts:95, read at :183 in
error(). Not a plain property, so it throws rather than no-ops.
Call site confirmed: packages/reactor-browser/src/hooks/dispatch.ts:35-37.

### TWO MORE SOURCE SITES THE REPORTER MISSED
- apps/switchboard/src/server.mts:886 —
  `graphqlManager.regenerateDocumentModelSubgraphs().catch(logger.error);` (childLogger(["switchboard"])).
- packages/reactor-api/src/packages/vite-loader.mts:26-28 — THE WORST ONE:
    customLogger.info = logger.info; customLogger.warn = logger.warn; customLogger.error = logger.error;
  Vite calls these with this===customLogger, giving a DIFFERENT error:
  "TypeError: Cannot read private member #level from an object whose class did not declare it"
  (verified at runtime). LIVE: apps/switchboard/src/server.mts:748 calls createViteLogger(logger), so in
  switchboard's Vite package-loader mode EVERY Vite log line throws.

## (b) Report accuracy — four corrections
1. "the only bare-method pass" — WRONG, three source sites.
2. The suggested call-site fix DOES NOT TYPECHECK:
   TS2345: Argument of type 'unknown' is not assignable to parameter of type 'string'.
   ILogger.error is (message: string, ...replacements: any[]) => void. `.catch(logger.error)` only
   compiles because .catch's reason is `any`. Working shape: logger.error("dispatch failed", error).
3. The suggested REGRESSION TEST FALSE-GREENS. Spying logger.error replaces the method with an own
   property that never reads #level. Measured:
     variant1 spy-the-logger   -> calls:1 escaped:null        <-- FALSE GREEN
     variant2 spy-console.error-> calls:0 escaped:TypeError   <-- correctly RED
4. @typescript-eslint/unbound-method is ALREADY ENABLED and already useless here.
   `eslint --print-config .../dispatch.ts` reports unbound-method:[2], from
   tseslint.configs.recommendedTypeChecked at eslint.config.js:642, type-aware projectService at :277;
   off only for the legacy filesWithUnsafeRules list (:263) which does NOT include dispatch.ts.
   `eslint src/hooks/dispatch.ts` exits 0. WHY: the singleton is annotated `: ILogger` (logger.ts:199)
   and ILogger declares PROPERTY-STYLE function types (logger-types.ts), which the rule treats as
   detachment-safe. `new ConsoleLogger().error` bare-passed IS flagged.
Right: the #level mechanism, the dist line numbers (162/207 match), and that the rejection path is real
(dispatchActions, reactor-browser/src/actions/dispatch.ts:70-81, awaits makeSignedActionsWithContext and
queueActions, either can reject).

## Blast-radius facts
ConsoleLogger is the ONLY detach-unsafe ILogger producer (reactor worker forwarding-logger.ts and
vetra codegen logger.ts return object literals of arrows; reactor-mcp/src/logger.ts is a re-export).
No `extends ConsoleLogger`, no logger.error.call/apply, no {...logger}/JSON.stringify(logger).
All 13 test spies use vi.spyOn(logger,"error") (instance + string key) — verified these keep working
with arrow class fields (spy + restore both fine).
builder-tools/connect-utils/vite-config.ts:148's logger.error.bind(logger) binds VITE's createLogger(),
not ours — not precedent. Codegen templates contain zero logger-method references, so "generated hooks"
is correct only transitively via useDispatch.

## (c) Repro
scratchpad/bug1/: repro.mjs, test-shape.mjs (proves which test shape goes red), FINDINGS.md,
proposed-test.ts.
PRIMARY permanent home: packages/document-model/test/logger.test.ts (exists, already pins prior
formatMessage defects). For each of the five levels: detach the method, assert no throw + the matching
console.* (verbose/debug -> console.debug) received the message; plus one case re-homing log.error onto a
foreign object (the vite-loader shape). Red today, green after the class fix.
SECONDARY (call-site pin): NEW packages/reactor-browser/test/dispatch.node.test.ts — NODE project
(useDispatch calls no React hooks, so the browser-project false-green trap is sidestepped).
vi.mock("../src/actions/dispatch.js") with a rejecting dispatchActions; spy console.error NOT
logger.error; assert the original message + nothing in unhandledRejection.

## (d) Fixes
1. RECOMMENDED — DO BOTH.
   CLASS: convert the five log methods at logger.ts:127-190 to arrow class fields. Blast radius measured
   and small: no subclasses, no prototype spies, all spies instance+string, ILogger already declares
   property-style types so `implements` matches BETTER after. Only observable diff: Object.keys(logger)
   gains five entries (nothing spreads/serializes a logger). Five closures per instance, negligible.
   This is the durable half — it fixes site 3 (vite-loader), which no .catch edit would reach.
   CALL SITES still required: the class fix alone does NOT deliver the report's "expected behavior".
   `.catch(logger.error)` puts the Error in the MESSAGE slot, which never passes through stringify, so
   THE STACK IS LOST AT EVERY LEVEL. Measured:
     logger.error(err)                       -> [ts] Error: the real error       (no stack, ever)
     logger.error("dispatch failed", err) @debug -> message + full stack
   So: `.catch((error: unknown) => logger.error("dispatch failed", error))` at dispatch.ts:35-37 and the
   equivalent at server.mts:886; vite-loader.mts:26-28 needs (...a)=>logger.info(...a) or .bind(logger).
2. Call sites only — three one-line edits, zero risk to the published surface. Rejected as sufficient:
   leaves the class a loaded gun; the repo has already produced three occurrences.
3. Lint (after the fix): (i) with arrow fields, unbound-method goes correctly silent, nothing needed;
   (ii) to make the existing rule fire, change ILogger in logger-types.ts from property-style to METHOD
   signatures. Flood estimate ~7 sites total (5 source incl. the 3 vite-loader lines, 2 test hits at
   apps/switchboard/test/worker-pool.test.ts:264 and attachment-reference-read-model.test.ts:178) — not
   a flood. Rule allows x.error.bind(x), flags [x.error] / expect(x.error).
   (iii) Fallback: third rule in the repo's inline logger/* plugin (eslint.config.js:445-580) reusing
   isLoggerCallee to flag a non-callee logger-method MemberExpression. Must exempt .bind( and expect(.

---

# Bug 2 — tokenless WS -> 4500, client never retries (VERIFIED live)

## (a) Verified: YES, every mechanical claim
Throw: packages/reactor-api/src/services/auth.service.ts:182 (exact line). :177 returns null when
!config.enabled, so the throw needs AUTH_ENABLED=true — the report's premise. Other throws :187 :192 :197 :207.
Wiring: graphql-manager.ts:817-841 (#createWebSocketContext, NO try/catch), :861-864 (#makeWsContextFactory),
:996-1000 attachWebSocket.
NO onConnect in any adapter — and there are THREE, not two:
  gateway/adapter-gateway-apollo.ts:196-217, adapter-gateway-mercurius.ts:116-132,
  adapter-gateway-stitching.ts:485-503.
graphql-ws IS 6.0.7. Verified in its dist: context() per-operation (server-3ewaJSjp.js:206-207, in the
Subscribe branch, not ConnectionInit); throw->4500 (use/ws.js:66-82); 4500 in client's fatal list
(client.js:279-292); onConnect returning false -> close(4403,"Forbidden") (server-3ewaJSjp.js:66-68).

### LIVE REPRO (scratchpad/bug2/repro.mjs, real graphql-ws 6.0.7 + ws 8.20.1)
  V1 current (throw in context): ack, then closed 4500, connecting attempts: 1  <-- retryAttempts:3 IGNORED
  V2 onConnect -> false:         closed 4403 x4, connecting attempts: 4         <-- RETRIED
  V3 report's literal fix (socket.close(4401)+return false): closed 4401, attempts: 1 <-- ALSO NOT RETRIED
  V4 throw inside onConnect:     closed 4500
git log 4f706b7..9a3ddb34b on those paths: only 4888ba0e7/222e575d9 (stitching adapter). auth.service.ts
and graphql-manager.ts untouched since the report.

## (b) Report accuracy — three corrections, one significant
1. **THE REPORT'S OWN SUGGESTED FIX DOES NOT FIX THE SYMPTOM.** 4401 is in the client's NON-retryable
   list (client.js:284, right above the commented-out `// CloseCode.Forbidden, might grant access out
   after retry`). V3 proves it. Only 4403 is retryable. The prose hedges but the code block and the
   "Expected behavior" lead with 4401 — implementing it as written keeps "signing in does not revive it".
2. Two adapters -> three (stitching added after the report's commit). Any fix touches all three plus the
   shared WsContextFactory type at gateway/types.ts:16-18.
3. "once per anonymous subscription attempt" -> once per SOCKET; the first subscribe closes it.
Minor: the "error-level line + Internal error" is ONE console.error at use/ws.js:70-74 — reactor-api logs
nothing itself, so "log at info/warn" means CATCHING IN REACTOR-API before graphql-ws sees it.
Under NODE_ENV=production the close reason is literally "Internal server error" (use/ws.js:6), so a real
Switchboard client never sees "Missing authorization".
UNVERIFIED: Connect's own createClient config (retryAttempts/shouldRetry) — the mechanism was verified,
not Connect's behavior.
EXTRA COST the report misses: because context() is per-operation, verifyToken + verifyCredentialExists run
PER SUBSCRIPTION. The credential cache (DEFAULT_CREDENTIAL_CACHE_TTL_MS=60_000) mitigates the remote hop,
not the JWT verify. onConnect fixes this too.

### THREE THINGS THE REPORT MISSES THAT MATTER MORE
(i) THE REFUSAL IS A RECORDED DECISION, PINNED BY A TEST:
    packages/reactor-api/test/auth.service.resolve-identity.test.ts:225-235
    "enabled=true still refuses a websocket connection with no token" with a comment saying admitting one
    is a concession to resolveIdentity alone "and must not leak into auth-on".
    => policy (B) is a REVERSAL needing human sign-off, not an oversight. THE CLOSE CODE IS A BUG UNDER
    EITHER POLICY. That separation drives the ranking.
    But the pin's parity argument is incomplete: verifyBearer returns {user: undefined} for a tokenless
    request under enabled:true too (auth.service.ts:118-125). HTTP's `enabled` enforcement is ADMIN_ONLY
    IN RESOLVERS (server.ts:934-938), never a connection refusal.
(ii) SSE ALREADY ADMITS ANONYMOUS SUBSCRIPTIONS UNDER AUTH_ENABLED=true. #setupSSEHandler
    (graphql-manager.ts:1145-1167) uses the HTTP getAuthContext path. Same subscription schema, over SSE
    at /graphql/stream, gives an anonymous caller user:undefined and authorizes per resolver. WS is the
    ONLY subscription transport that refuses the connection. Strongest argument that policy B adds no
    new exposure.
(iii) A SECOND ASYMMETRY IN THE OPPOSITE DIRECTION, UNNOTICED BY ANYONE: wsServer is
    new WebSocketServer({server: httpServer, path:"/graphql/subscriptions"}) (server.ts:655-658) — raw ws
    binds its own upgrade listener, so requireAuthFetchMiddleware (server.ts:888) NEVER SEES A WS UPGRADE.
    With RESOLVE_CALLER_IDENTITY=true + REQUIRE_AUTHENTICATED_CALLER=true + AUTH_ENABLED=false: HTTP and
    SSE reject anonymous with 401 while WS ADMITS anonymous (auth.service.ts:176-178 returns null because
    enabled is false). The WS gate is keyed on the WRONG FLAG — `enabled` where HTTP uses
    requireAuthenticatedCaller.

### What the flags actually do (server.ts:707-800, 930-938)
AUTH_ENABLED -> authEnabled: selects the authorization POLICY (ADMIN_ONLY vs OPEN, or DOCUMENT_PERMISSIONS
  when a permission service exists); what AuthContext.auth_enabled reports.
RESOLVE_CALLER_IDENTITY -> resolveCallerIdentity: whether the bearer is read and ctx.user populated.
  Enforces nothing.
REQUIRE_AUTHENTICATED_CALLER -> requireAuthenticatedCaller: installs createRequireAuthFetchMiddleware(),
  a FETCH middleware rejecting anonymous with 401 before any subgraph. Off by default; refused at boot
  without identity resolution (server.ts:252-267). THIS is the "refuse anonymous connections" flag.
DEFAULT_PROTECTION -> defaultProtection: document with no permission row treated as protected
  (document-permission.service.ts:330-341). Per-document authz, decided in resolvers.

## (c) Repro
Already run (above). Permanent: packages/reactor-api/test/gateway/ws-auth-close-code.test.ts
BLOCKER: packages/reactor-api/src/graphql/websocket.ts:5 —
`if (process.env.VITEST !== "true" && process.env.NODE_ENV !== "test")` else useServer throws. This is why
gateway-adapter-contract.ts:466-469 skips its attachWebSocket case. NOTE the contract test's own comment
is WRONG: setting NODE_ENV != "test" does not unblock it, the guard also requires VITEST !== "true".
Use vi.mock("../../src/graphql/websocket.js", () => ({ useServer: (await import("graphql-ws/use/ws")).useServer })).
describe.each(["apollo","mercurius","stitching"]): tokenless vs auth-enabled -> 4403 not 4500, no
error-level log; tokenless vs resolveIdentity-only -> delivers; valid bearer -> user on ctx.
Heavier "tokenless subscription to an UNPROTECTED document succeeds": build on
packages/reactor-api/test/subscriptions-sse.test.ts (real ReactorSubgraph + stubbed IAuthorizationService,
lines 26-48) — the existing per-subscription-authz harness; only the transport changes.
There is NO existing live graphql-ws-client integration test in reactor-api.

## (d) Fixes
1. RECOMMENDED — onConnect + GATE THE REFUSAL ON requireAuthenticatedCaller (policy B by default,
   policy A when the flag is set). Split authenticateWebSocketConnection resolve-vs-enforce mirroring
   HTTP: return null for a MISSING header regardless of enabled (matching verifyBearer :118-125); keep
   throwing only for a header PRESENT BUT INVALID (:187 :192 :197 :207). GraphQLManager gains onConnect
   that resolves once, refuses (return false -> 4403) when user===null && this.#requireAuthMiddleware
   !== undefined, catches invalid-header throws and logs at warn, stashes user on ctx.extra; context()
   becomes pure.
   THE FLAG IS ALREADY ON THE OBJECT: #requireAuthMiddleware at graphql-manager.ts:130, set at :212,
   only exists when requireAuthenticatedCaller is true (server.ts:887-893). No new config field.
   Blast radius: auth.service.ts (:176-182), graphql-manager.ts, gateway/types.ts:16-18 + :98-102 (widen
   WsContextFactory to a {onConnect?, context} PAIR rather than a 4th attachWebSocket param, so the three
   adapters can't drift), all three adapters. PLUS auth.service.resolve-identity.test.ts:225-235 must be
   rewritten — A DELIBERATE REVERSAL NEEDING HUMAN SIGN-OFF, not a silent edit.
   Only option fixing BOTH asymmetries. Extra pin: REQUIRE_AUTHENTICATED_CALLER=true + AUTH_ENABLED=false
   -> tokenless WS closes 4403 (today it's admitted).
2. onConnect + 4403 + warn, POLICY UNCHANGED — transport-only. Fixes the 4500, the no-retry (V2: 4
   attempts vs V1's 1), the error-level log, and the per-operation credential verification. Leaves both
   asymmetries. auth.service.ts untouched, the pinned test stays green. Smallest diff that needs no
   policy decision.
3. The report's literal snippet — DO NOT SHIP (V3). The explicit socket.close is also redundant: return
   false already closes; the manual close merely overrides the code with a worse one. The try/catch in
   the snippet is MANDATORY not stylistic — V4: a throw inside onConnect still closes 4500.

## (e) SHIPPED: fix 1, and the behaviour change it carries — RELEASE NOTE

Fix 1 landed, so the reversal flagged above is real and needs saying out loud.

BEFORE: `AUTH_ENABLED=true` refused a tokenless WebSocket connection at the
handshake, whatever `REQUIRE_AUTHENTICATED_CALLER` said.
AFTER: the refusal is keyed on `REQUIRE_AUTHENTICATED_CALLER`, as HTTP and SSE
already were. `AUTH_ENABLED=true` with the flag unset now ADMITS a tokenless
subscription, with no user on the context.

Who is affected: a deployment running `AUTH_ENABLED=true` and NOT setting
`REQUIRE_AUTHENTICATED_CALLER`. Nothing else changes.

Why it is not a new hole, and where it still is one:
- The reactor's own subgraph authorizes per document on every event
  (`documentChanges`/`jobChanges` -> `canReadDocument`), so an admitted
  anonymous socket sees exactly what an anonymous HTTP query already saw.
- A PACKAGE-PROVIDED subgraph with subscriptions is the gap. Those resolvers
  have no per-event authorization, and `attachWebSocket` runs for every
  subgraph with `hasSubscriptions`. Such a subscription was previously
  unreachable anonymously and now is not.
- The same subgraph's QUERIES were already reachable anonymously under this
  config: `requireAuthFetchMiddleware` is the only thing that 401s an
  anonymous HTTP caller, and it is built only when the flag is set
  (server.ts:887-893). So WS was accidentally stricter than HTTP, and the
  exposure this closes over is one the deployment already had.

Action for an operator who relied on the old behaviour: set
`REQUIRE_AUTHENTICATED_CALLER=true`. That refuses anonymous on BOTH transports
(401 over fetch, 4403 over WS) and is the flag that was always meant to express
it. The server now warns at boot when auth is on and this flag is not set.

## Out of scope but flag it
graphql-manager.ts:996 calls attachWebSocket ONCE PER SUBSCRIPTION-CAPABLE SUBGRAPH, all on the single
wsServer from server.ts:655. Each useServer registers its own ws.on("connection") and overwrites
ws.options.handleProtocols (use/ws.js:7,29) — N subgraphs = N graphql-ws servers racing on every socket,
and a per-subgraph 4403 from one closes the socket for all. Whatever fix lands, its test should attach the
same way so this doesn't hide behind a single-subgraph harness.

---

# Bug 3 — SyncManager drops remote on init() failure (VERIFIED)

Worktree: ~/.worktrees/powerhouse/lib-bugs @ 9a3ddb34b

## (a) Verified: YES
- startup catch: packages/reactor/src/sync/sync-manager.ts:219-229 (init :220, remotes.delete :227, continue :228). NO storage removal.
- add catch: :429-435 (init :430, remotes.delete :432, remoteStorage.remove :433, throw :434).
- Both unconditional, no error classification.
- Auth chain confirmed: GqlRequestChannel.init() -> touchRemoteChannel (gql-req-channel.ts:268-269, :721-767)
  -> reactor-api subgraph.ts:824-851 touchChannel -> assertCanReadCanonical (base-subgraph.ts:233-244)
  -> ForbiddenError (errors.ts:8-15). authorization.service.ts #canAccess: protected + no userAddress = denied.
- Classification IS available unwrapped at catch site: executeGraphQL is the only thrower, constructs
  GraphQLRequestError directly (errors.ts:10-31). No wrapping between it and the catch.
- Existing tests pinning current behavior (both green):
  test/sync/sync-manager/unit.test.ts:377 "should not register remote when channel.init() fails"
  test/sync/sync-manager/unit.test.ts:632 "should clean up on channel.init() failure" (asserts remove() called, :655)

## (b) Report corrections
1. Field names wrong: it's `category` + `statusCode` (+ `codes`), NOT `kind` + `status`.
2. Helper already exists: isDriveAuthError(error) at errors.ts:330-345, exported from the barrel.
   classifyError (gql-req-channel.ts:878-904) is private.
3. "No health state a UI could show" is WRONG — and the bug-3 agent's own correction of it was ALSO
   wrong. ConnectionStateSnapshot.requiresAuth exists and crosses RPC (sync-manager-proxy.ts). The
   agent concluded "nothing renders it", but it only grepped packages/. **apps/connect DOES render
   it**: apps/connect/src/components/use-drive-auth-gate.ts:19
   (`if (snap.state === "error" && snap.requiresAuth)`) drives the full-page DriveAuthGate at
   apps/connect/src/pages/content.tsx:53-60, with its own test at
   apps/connect/src/components/use-drive-auth-gate.test.ts.
   => The "locked — sign in" affordance the report asks for ALREADY EXISTS, and no design-system work
   is needed for it. It also means a remote left in a requiresAuth error state renders a full-page,
   undismissable gate replacing Connect's content — which resolves bug 5's open caveat against
   "Connect is still usable underneath". FIX 3 AND 5 TOGETHER.
4. RemoteStatus.pull is inert (do not route the fix through it) — persisted but only ever written as createIdleHealth()
   (sync-manager.ts:351-352, :386-387). No writer in src/. Do NOT route the fix through it.
5. The suggested `kind:"parse"` negative pin CONTRADICTS the code: classifyError treats parse as
   RECOVERABLE (gql-req-channel.ts:891-892). Use "missing-data" or a plain Error instead.
6. Connect already handles the add()-path auth failure: reactor-browser/src/actions/drive.ts:210-219
   catches -> isDriveAuthError -> showPHModal driveAuthRequired. Repro B's "silent" is wrong;
   the real complaint (no auto re-add after login) stands.
7. startup() never removes from storage, so reload-after-sign-in DOES restore. Only add() destroys.
8. UNDOCUMENTED + arguably worse: BOTH catches LEAK. wireChannelCallbacks(remote) runs BEFORE init()
   (:216, :425) registering syncStatusTracker.trackRemote, inbox onAdded, deadLetter onAdded, a
   connectionStateUnsubscribes entry; loadDeadLetters too. Neither catch undoes any of it, and the
   channel is never shutdown(). Compare remove() at :471-496 which does all the teardown.

## (c) Repro
packages/reactor/test/sync/sync-manager/unit.test.ts, next to the test at :632.
Reject init with new GraphQLRequestError("...401 Unauthorized", "http", 401); assert add() rejects
(Connect's modal needs that) AND mockRemoteStorage.remove NOT called (fails today).
Negative pin: the two existing plain-Error tests pass unchanged and ARE the negative case.

## (d) Fixes
**Option 1 (recommended, minimal):** in add() catch :431-435, keep remotes.delete + rethrow, SKIP
remoteStorage.remove when isDriveAuthError(error) || category === "network". Leave startup() alone.
KEY CONSTRAINT: do NOT keep the remote in-memory without retry — addRemoteDrive short-circuits when
sync.list() already has a remote (drive.ts:184-189) and add() throws "already exists"
(sync-manager.ts:369-371), so kept-but-dead is strictly WORSE than dropped. Must update
unit.test.ts:655 to split auth case (kept) from plain-Error case (removed).
CONFIRMED after the fact: sync-manager.ts:369 checks `this.remotes.has(name)` — IN-MEMORY, not
storage. So Option 1 (keep the storage record, still drop the in-memory remote) leaves re-add working
after a failed init.
No caller depends on the cleanup (reactor-api resolvers.ts:1188-1203, reactor-mcp tools/reactor.ts:554).

**Option 2 (larger):** most machinery exists — calculateBackoffDelay + recoverFromChannelNotFound
(gql-req-channel.ts:471-537), transitionConnectionState, requiresAuth, classifyError, and jwtHandler
resolved PER REQUEST (:973-987) so NO auth-token-change event is needed (none exists in the repo).
Three-way design fork: (2a) init() swallows + retries -> modal never fires; (2b) init() still rejects
but channel retries -> needs addRemoteDrive's list() short-circuit changed too; (2c) sync-manager reads
getConnectionState().requiresAuth after failure.
Whichever: the delete arm must mirror remove() (:471-496) or the leak in (b)(8) remains.

---

# Bug 4 — Renown returnUrl drops the query string (VERIFIED, red test produced)

## (a) Verified: YES
packages/reactor-browser/src/renown/session.ts:29-30 verbatim as reported. Rest of openRenown
(session.ts:10-32) only sets app/connect/network/chain.
Connect side: apps/connect/src/store/reactor.ts:488-493 reads getDriveUrl() inside createReactor
(:213); getDriveUrl :589-594, getDidFromUrl :582-587. createReactor has ONE caller
(components/load.tsx:19), one-shot lazy boot => ?driveUrl consumed once per page load.
Share-link format is real, produced by packages/vetra/.../DriveHeader.tsx:73.
REAL CHROMIUM TEST OUTPUT: RETURN_URL = http://localhost:63315/ ; expected to contain 'driveUrl' — FAILS.
Both search and hash gone.

## (b) Report accuracy
- "?user= is lost the same way" — WRONG FRAMING. `user` is what Renown APPENDS ON RETURN; nobody arrives
  with it on a share link. The real issue is the opposite: it's a STALE param that must NOT round-trip
  back out — which is what makes the report's own suggested fix unsafe.
- "read exactly once" true of CONSUMPTION, not presence: utils/url.ts:91-94 createUrlWithPreservedParams
  deliberately carries location.search through every in-app pushState (selected-drive.ts:103,110,185;
  set-selected-node.ts:35,42). openRenown is the ONLY place it's dropped.
- Hash: overstated. Connect uses createBrowserRouter (router.tsx:11); nothing reads location.hash.
  Losing the fragment is cosmetic.
- Report MISSES three more param readers that also die at the round trip:
  apps/connect/src/feature-flags.ts:154, hooks/useIsEmbedded.ts:10, utils/reactor-worker-flag.ts:34.
  These strengthen the case AGAINST an allowlist fix.

## EXTRA FINDING — the stale-?user hazard is LIVE, not theoretical
session.ts:118 `const did = userDid ?? consumeDidFromUrl();`. Connect calls login(didFromUrl, renown)
at reactor.ts:428 with didFromUrl ALREADY populated, so consumeDidFromUrl() (session.ts:91-106 — the only
thing that history.replaceStates the param away) NEVER runs. The one caller passing undefined is
use-renown-init.ts:43, which Connect doesn't use. So ?user=<did> stays in Connect's URL for the whole
session and is propagated by createUrlWithPreservedParams. Side effect: hasRedirectSignIn()
(session.ts:85-88, consumed at use-renown-auth.ts:174-178) stays permanently true.

## (c) Repro — RAN RED IN REAL CHROMIUM
test/**/*.test.ts(x) lands in the BROWSER vitest project (@vitest/browser-playwright);
environment:"happy-dom" is inert there. window.location is NOT redefinable in Chromium — the stub that
works is window.history.replaceState(null,"","/?driveUrl=..."). window.open mocked per the existing
pattern at test/renown/login-fallback.test.tsx:52.
Ran from scratchpad WITHOUT touching the worktree: scratchpad config with root=package dir,
include=absolute scratchpad test path, server.fs.allow both dirs.
`cd packages/reactor-browser && pnpm vitest run --config <scratchpad>/vitest.config.ts` ->
Tests 1 failed | 2 passed, executed in `browser (chromium)`. The red IS the bug.
Permanent home: packages/reactor-browser/test/renown/return-url.test.ts
Test 2 (stale ?user must not round-trip) passes today and is exactly what distinguishes fix 1 from fix 2.

## (d) Fixes
1. RECOMMENDED: `new URL(window.location.href)` + EXPLICIT STRIP LIST
   ["user", "privy_oauth_code", "privy_oauth_state"].
   - `user`: Renown's own return param, never stripped by Connect (see extra finding). Whether Renown
     uses searchParams.set (idempotent) or append (?user=old&user=new, where .get returns OLD) CANNOT be
     determined from this repo — renown.id is external and packages/renown has no returnUrl handling.
     Stripping makes the outcome independent of that unknown.
   - privy_oauth_code / privy_oauth_state: declared at packages/renown/src/wallet/privy/meta.ts:59 as
     redirectReturnParams, read via isWalletRedirectReturn at use-complete-redirect-sign-in.ts:28 and
     wallet-provider.tsx:144. If they round-trip, the OAuth-return arm re-arms and completeSignIn
     auto-fires. Ideally derive from mounted adapters' redirectReturnParams, but openRenown isn't
     hook-scoped — a constant next to RENOWN_URL in renown/constants.ts is the pragmatic shape.
2. Bare `href` (the report's suggestion): fixes the symptom, reopens the stale-user round trip which is
   live today. Turns test 2 red. Only acceptable with the companion fix.
3. Allowlist (forward only driveUrl): REJECT — silently breaks ph_* feature flags, useIsEmbedded and the
   reactor-worker flag on every login.

## Companion defect (separate, worth filing)
Connect should CONSUME the DID rather than merely read it — either login(undefined, renown) at
reactor.ts:428, or strip inside getDidFromUrl (reactor.ts:582). Today ?user= outlives its single use for
the whole session and keeps hasRedirectSignIn() true. Fixing it reduces option 2's hazard but doesn't
remove it (Privy params remain), so option 1 stands regardless.

---

# Bug 5 — DriveAuthRequiredModal has no way out (VERIFIED, still present)

## (a) Verified: YES at 9a3ddb34b
- packages/design-system/src/connect/components/drive-auth-gate/drive-auth-gate.tsx:4-12 — props are
  {mode?, onLogin?, onLogout?, className?}. No onClose. :18-60 renders exactly one button.
- apps/connect/src/components/modal/modals/DriveAuthRequiredModal.tsx:24-33 — role=dialog
  aria-modal=false, pointer-events-none backdrop, NO onClick. No Escape handler anywhere.
- STRONGER than the reporter had: this worktree's built chunk is
  apps/connect/dist/DriveAuthRequiredModal-Cw9eCAQ_.js — byte-identical hash to the dev.85 dist they
  inspected. "Not re-verified against main" is moot; the dist they read IS what this HEAD produces.

## (b) Report accuracy
- Path is apps/connect/, not packages/connect/.
- addRemoteDrive fires EXACTLY ONCE at apps/connect/src/store/reactor.ts:488-493 (not an effect, not
  polled) -> a dismissal will stick, no re-trigger. The report never addresses this; it's what would
  have made every fix pointless.
- The non-blocking design is DELIBERATE and documented in-tree: DriveAuthRequiredModal.tsx:12-13
  "pointer-events-none backdrop keeps the cookie banner clickable", landed upstream a54192bf8
  (2026-07-22). The reporter's cookie-banner finding is a known upstream constraint, not a discovery.
- Report only frames mode="login". The `unauthorized` mode is an equal/worse dead end: its only button
  is "Log out" (drive-auth-gate.tsx:51-57) so a signed-in non-owner must destroy their session.
- phModal is global in-memory (reactor-browser/src/hooks/modals.ts:9-23), no route coupling — navigating
  within Connect doesn't clear it either.

## Mounting
ModalsContainer (apps/connect/src/components/modal/modals-container.tsx:122-141) is a bare type->component
dispatch. NO Escape, NO backdrop, NO focus mgmt. Each modal brings its own chrome. Most use the shared
Radix `Modal` (LoginModal.tsx:46-53) which gives Escape+backdrop free. DriveAuthRequiredModal bypasses it
and createPortals raw divs. It CANNOT adopt the shared Modal without restructuring: modal.tsx:34-56 nests
Content inside Overlay, and Radix Dialog.Overlay returns null when modal={false}.

## Cookie-banner misfire — mechanism CONFIRMED structural
CookieBanner is a plain root sibling, NOT portaled (app-loader.tsx:39-46), root is
absolute inset-0 z-10000 (cookie-banner.tsx:56) — above the card's z-50. The card IS portaled to
document.body. Different DOM subtree => any !cardEl.contains(e.target) handler fires on every banner
click. Same for MigrationBanner, ServiceWorkerUpdatePrompt, ConnectionBanner and wallet portals.
Radix DismissableLayer's onPointerDownOutside would reintroduce it identically.
=> NO outside-click dismissal.

## Open caveat — NOW RESOLVED, and it is a real problem
apps/connect/src/pages/content.tsx:53-60 renders a SECOND, full-page DriveAuthGate driven by
useDriveAuthGate() -> computeAuthGate over useConnectionStates() (use-drive-auth-gate.ts:13-33). If a
failed addRemoteDrive also leaves a requiresAuth connection state, that full-page gate replaces Connect's
content entirely and is ALSO undismissable — "Connect is usable underneath" would then be false.
RESOLVED: use-drive-auth-gate.ts:19 fires on `snap.state === "error" && snap.requiresAuth`, and
gql-req-channel.ts sets exactly that pair on an auth-refused channel (:458, :523, :825). So the
full-page gate IS reachable from the same 401 that opens the modal. An onClose on DriveAuthGate does
NOT fix the full-page instance — that one is driven by connection state and clears only when the
connection is fixed (or by whatever bug 3 decides to do with a refused remote). Fix 3 and 5 together.

## (c) Repro harness (both run green at this HEAD)
- design-system: vitest + happy-dom global, setupTests.js.
  `pnpm vitest run src/connect/components/drive-auth-gate/drive-auth-gate.test.tsx` -> 4 passed.
- apps/connect: no global env; tests opt in with `// @vitest-environment happy-dom` pragma
  (apps/connect/src/components/drive-auth-gate.test.tsx:1).
  `pnpm vitest run src/components/drive-auth-gate.test.tsx` -> 2 passed.
Tests: extend drive-auth-gate.test.tsx (no close control when onClose omitted; onClose once + onLogin
untouched; close control in unauthorized mode) + NEW
apps/connect/src/components/modal/modals/DriveAuthRequiredModal.test.tsx (close control; Escape;
NEGATIVE PIN: clicking an unrelated outside button does NOT close; CTA still closePHModal+openLogin).
E2E not feasible: Connect's only Cypress spec is navigation.cy.ts; needs a live switchboard.

## (d) Fixes (blast radius: DriveAuthGate has exactly 2 in-repo consumers —
DriveAuthRequiredModal.tsx:34 and content.tsx:55 — plus stories; re-exported via export* from
design-system connect/components/index.ts:16, so external consumers unknown, but an OPTIONAL prop is additive)
1. RECOMMENDED: optional `onClose` in design-system (top-right icon button, needs `relative` on the card
   root :19-24) + Escape listener in the CONNECT WRAPPER only (not in DriveAuthGate — content.tsx:55
   renders it full-page where Escape is meaningless). Backdrop stays pointer-events-none. Zero
   cookie-banner risk. Fixes `unauthorized` mode for free. Caveat to note in the PR: non-blocking overlay
   means focus is usually elsewhere, so a global Escape can dismiss while the user types elsewhere.
2. Connect-side-only close button (no design-system release) — fragile positioning, leaves content.tsx
   gate without a path.
3. Backdrop click — REQUIRES pointer-events-auto, contradicts the documented intent, re-blocks the cookie
   banner. A deliberate UX reversal, not a bug fix.
4. DO NOT: global outside-click / DismissableLayer — mechanically guaranteed to misfire.
5. Route through shared Modal — only if going blocking; Radix Overlay/Content nesting blocks non-modal.

---

# Bug 6 — attachment read model refuses to replay across an ordinal hole (VERIFIED, reproduced)

## (a) Verified: YES, empirically. The serial-sequence premise is CORRECT.
packages/reactor-attachments/src/read-models/attachment-reference/attachment-reference-read-model.ts
  indexOperationsInOrdinalOrder :99-138 — filter `context.ordinal > this.lastOrdinal` :103,
  contiguity test :110, replay loadThroughOrdinal(incomingMax) :111, contiguous walk :115-123,
  THE THROW :125-129. loadThroughOrdinal :152-172. init() :42-59 (calls it at :54).
  indexOperations() :38-40 (same method at :39).
Sequence: packages/reactor/src/storage/migrations/009_create_operation_index_tables.ts:31
  .addColumn("ordinal","serial", col => col.primaryKey()) — Postgres-side, DB-assigned, read back via
  .returning("ordinal") at cache/kysely-operation-index.ts:249. The insert is inside executeCommit's
  transaction (:160-163, :246-252) and SEVERAL STATEMENTS RUN AFTER IT (memberships, removals, group
  refs, :254-350) — any can throw and roll back while the sequence values stay consumed.
  KyselyOperationIndex is the only production IOperationIndex; PGlite is real Postgres in wasm.
  => HOLES ARE NORMAL.

REPRO (scratchpad/bug6/repro.mjs, against the package's built dist/index.js):
  [case 1] init() over index holding 11 and 13, checkpoint 10
    threw: "cannot advance past missing ordinal 12"; indexed: []; checkpoint: 10
  [case 2] live indexOperations([op(22)]), checkpoint 20, index holds only 22 -> "missing ordinal 21"
  [case 3] indexOperations() promise -> REJECTED with "missing ordinal 31"
EXTRA FINDING: in case 1 ordinal 11 IS contiguous and was STILL DISCARDED — the throw at :125 fires
before super.indexOperations(contiguous) at :133. The model doesn't even advance to the edge of the hole.

Startup-crash mechanism CONFIRMED: packages/reactor/src/core/reactor-builder.ts:834-841 awaits each
read-model factory with NO try/catch, while processorManager.init() six lines above (:828-832) IS wrapped.
Switchboard's factory awaits readModel.init() at apps/switchboard/src/attachment-reference-read-model.mts:73;
the rejection reaches apps/switchboard/src/server.mts:1118 logger.error("App crashed: @error", e).

## (b) Report accuracy
RIGHT: the throw, the checkpoint stall, the startup crash, the serial sequence, "contiguity is only
meaningful for live delivery", and the discriminator (other models advance past holes).
WRONG at this HEAD:
- **"the throw is swallowed ... nothing is logged" — FALSE.** :63's .catch guards only the CHAIN so the
  queue is reusable; :64 returns the REJECTING promise to the caller (case 3 proves it; pinned by the
  existing test "keeps errors observable and the queue reusable" at read-model.test.ts:411). Both hosts
  log at ERROR level: reactor/src/read-models/coordinator.ts:151 and :174, and
  reactor/src/projection/hybrid-projection-coordinator.ts:141/:171. And because every subsequent write
  re-triggers the replay and re-throws, it logs ON EVERY WRITE after the hole — the OPPOSITE of silent.
- "an ordinal absent below the max is gone for good" — true ONLY under serialized commits (see (d)).

## (c) Repro
Harness already in the package: packages/reactor-attachments/test/read-models/attachment-reference/
read-model.test.ts — pure fakes, NO DB. cursorDb() :122-176 (hand-rolled Kysely stand-in holding
lastOrdinal), operationIndex(results) :186-199 (vi.fn getSinceOrdinal filtering by ordinal), op(ordinal)
:84-115, dependencies({cursor,indexOperations,writer}) :201-. Existing suite: 13 passed in 438ms.
Two proposed tests (scratchpad/bug6/proposed-test.ts, both RED today): replay across a missing ordinal on
init (checkpoint 10, index holds 11 and 13 -> both indexed, ends at 13); advance past a missing ordinal on
live delivery (checkpoint 20, index holds only 22 -> indexed, ends at 22).
**A FIX MUST REWRITE read-model.test.ts:471-487** ("fills internal gaps across pages and rejects
unresolved gaps") — its second half asserts rejects.toThrow("missing ordinal 21") and db.cursor===20,
i.e. IT PINS THE BUG GREEN.
Integration: apps/switchboard/test/attachment-reference-read-model.test.ts already boots a real reactor on
in-memory PGlite (:138-139) with the read model registered both ways. Make the hole by burning the sequence
(SELECT nextval('reactor."operation_index_operations_ordinal_seq"')) or faithfully by a tx that inserts then
throws; apply one more op; rebuild -> init() must not throw.
scripts/repair-read-model-checkpoint.mjs is the reporter's own; nothing equivalent in this repo.

## (d) Fixes
### The established policy of the other consumers: THEY DON'T CHECK AT ALL.
BaseReadModel.indexOperations (packages/reactor/src/read-models/base-read-model.ts:66-76) commits whatever
is delivered with NO >lastOrdinal filter; saveState (:161-179) sets lastOrdinal = max(ordinal in batch)
unconditionally. KyselyDocumentView (read-models/document-view.ts:38), document indexer
(storage/kysely/document-indexer.ts:36), ProcessorManager (processors/processor-manager.ts:49) and
NodeProcessor (reactor-drive/src/processors/node-processor.ts:47) all inherit it unchanged.
ProcessorManager.backfillProcessor does it explicitly: tracked.lastOrdinal = lastResult.context.ordinal
(:355) — last row of the page, contiguity irrelevant — and logs failures at error level (:345).
POLICY: idempotent commit, index whatever the index returns, the checkpoint is a RESTART HINT, not a
contiguity proof. The attachment read model is the SOLE DEVIATION.

**Option B (RECOMMENDED — the report's fix).** In indexOperationsInOrdinalOrder, once
loadThroughOrdinal(incomingMax) has merged, take all candidates through incomingMax and set
lastOrdinal = incomingMax; DELETE the throw :125-129. Keep the contiguity test :110 purely as the replay
trigger, and keep the queue + the rollback :131-137.
 - Why over "just align with base": the replay is a DELIBERATE recovery feature pinned by two existing
   tests — "restores ordinal 99 after failure at 100, then refills 100 and 101" (:328) and "keeps a
   missing-module cursor retryable and gap-recovers after registration" (:424). Both rely on a later
   delivery triggering loadThroughOrdinal to pick up an earlier FAILED batch. B preserves them; only the
   "rejects unresolved gaps" half of :471 changes.
 - Blast radius: nothing real is skipped (a hole has no row, nothing to index). Double-indexing is
   harmless — KyselyAttachmentReferenceStore.addReferences is idempotent
   (kysely-attachment-reference-store.ts:48-50, onConflict(["document_id","attachment_ref"]).doNothing()),
   and first_seen_ordinal is WRITTEN BUT READ NOWHERE in the repo (schema + store tests only), so
   out-of-order first-writes have no semantic consequence.
 - RESIDUAL RISK, precisely: "gone for good" holds only when operation-index commits are SERIALIZED.
   Default IS serialized — maxConcurrency ?? 1 at reactor-builder.ts:709 and simple-job-executor.ts:175,
   one executor, one executeCommit at a time — covering the reporter's PGlite vault and default Postgres.
   In REACTOR_WORKERS MODE ONLY (executorStartCount = pool.numWorkers, reactor-builder.ts:738; pg
   Pool({max: poolSize}) at server.mts:216) two executeCommit txns can overlap, so a hole can be
   TRANSIENT: tx took ordinal 5 and is still open while 6 committed. B would advance to 6 and the later
   [5] delivery is dropped by the filter at :103. Window = the lifetime of one in-flight transaction.
   NOTE deleting :103 alone is NOT a mitigation — :119 (`if (ordinal < expectedOrdinal) continue`) also
   drops below-checkpoint items; a real mitigation needs a deliberate "index below the checkpoint" rule.

**Option A (fallback — align fully with BaseReadModel).** Drop the filter :103, the contiguity test :110
and the replay :111; keep only the serializing queue. Correct REGARDLESS of concurrency. Cost: flips four
existing tests, two of which encode recovery intent the report never asked to change, and gives up
gap-recovery for a batch that failed and was never re-delivered. Take only if the worker-pool transient-hole
risk is judged unacceptable.

**Option C (path split — NOT recommended).** Advance past holes on init(), keep the throw on live delivery.
Leaves the run-time stall-until-restart, and registerAttachmentReferenceReadModelOnModule inits against a
RUNNING reactor (attachment-reference-read-model.mts:99-113 — note the DOUBLE init() at :111 and :113,
itself a race patch), so "init has no concurrent writer" doesn't hold on that path.

## SEPARATE DEFECT — fatal-at-startup asymmetry (the real item behind the report's "swallowed" claim)
reactor-builder.ts:834-841 awaits every read-model factory UNGUARDED, two lines below
processorManager.init() which IS wrapped in try/catch (:828-832). A read-model failure that is non-fatal at
run time (logged, other models carry on) becomes a hard "App crashed" at boot (server.mts:1118).
Fix independently: wrap the factory loop the way the processor manager is wrapped — log at error, leave
that read model unregistered/degraded, let the reactor start. Test: a factory whose init() rejects ->
buildModule() resolves and the failure is logged. Same guard owed at
attachment-reference-read-model.mts:73/111/113.

---


---

# Appendix — verification of the fixes on this branch

Run at `555826342` (9 commits over `main` @ `9a3ddb34b`), worktree clean.

| Check | Result |
|-------|--------|
| `pnpm build` | green |
| `pnpm tsc` (workspace) | **clean** — caught 2 errors this branch introduced (TS7034/TS7005, untyped array in the new WS test); fixed in `555826342` |
| `packages/document-model` | 399 passed, 1 skipped |
| `packages/reactor` | 3095 passed |
| `packages/reactor-api` | 1026 passed, 3 skipped |
| `packages/reactor-attachments` | 531 passed |
| `packages/reactor-browser` | 721 passed |
| `apps/switchboard` | 217 passed |

## The arrow-class-fields risk, measured

The `ConsoleLogger` change makes the five log methods own properties rather than
prototype methods. 11 `vi.spyOn(logger, ...)` sites across `packages/reactor` and
`packages/reactor-browser` exercise that shape. Confirmed `document-model/dist/index.js`
was rebuilt and contains the arrow form, then ran every one of those sites against it:
146 + 47 tests green. The claim that instance-keyed spies survive detachment-safe
methods is now measured rather than reasoned.

## Open observation — a load-only red, unreproduced

`packages/reactor-attachments/test/storage/fs/attachment-fs.test.ts > writeAttachmentBytes >
leaves the previous file intact when a write fails` failed **once**, during a run where four
package suites plus an unrelated `test:ci related` were executing concurrently.

Established since:
- the branch does not touch that file (`git diff --name-only main...HEAD` lists only the
  read model and its test in that package);
- the suite uses `mkdtemp` per test, so concurrent runs cannot collide on a path;
- it passes in isolation (10/10), in the full package suite serially (531/531), under 3x
  concurrent load of itself (10/10 x3), and in a repeat of the identical four-suite
  sequence (531/531).

The test drives a deliberately-failing `ReadableStream` with backpressure, which is the kind
of assertion CPU starvation can perturb. NOT attributable to this branch, and NOT dismissed
as flake: a load-only red has been a genuine defect in this repo before. Worth filing
separately as a load-sensitive test.

## What was NOT run

- Postgres-backed variants (PGlite only).
- `test/vetra-e2e`, Connect Cypress, and the package/sync integration harnesses.
- The bug 2 recipe, which is still to be written in the `recipes` repo.

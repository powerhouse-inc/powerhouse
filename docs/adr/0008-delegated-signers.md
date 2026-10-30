# ADR 0008 — Delegated signers: a second link from the session key to a named key

- **Status:** Proposed
- **Date:** 2026-10-30
- **Deciders:** Wouter Kampmann. Sign-off wanted from acaldas, Frank, the Renown owner and Benjamin Jordan (see Open questions)
- **Implements:** branches `feat/delegated-signers` (monorepo) and `feat/delegated-grant` (Sektar). Amends ADR 0005 §6-8.

## Context

A workflow run acts as the signer of its latest `PUBLISH_WORKFLOW` (ADR 0005 §6). An unattended
reconciler publishes through `dispatch.execute`, so the host signs, and `runUserOfOperation` returns
null for the host's key. On a host with no `ph login` a run then has no address, and the
authenticated-caller floor refuses its index reads. The person who set the integration up never
appears on the publish. A new environment also has no reactor connection, and nothing creates one.

Facts about the current code that the decision depends on:

- **Signature verification has a mode, and it defaults to `enforce`.** `SimpleJobExecutor` sets
  `signatureVerification ?? "enforce"`. In `enforce`, a refusal fails a mutation and drops an
  operation on load. In `log`, a refusal is counted and the write is admitted. No switchboard
  configuration sets it, so every switchboard runs `enforce`.
- **`authEnforcement` bundles two jobs.** One asks whether a signature chains to a person. The other
  asks whether that person may do this to this document. `admissionTrustPolicy` calls
  `policy.authorizeSigner` whenever a policy is set, whatever the flag. Without a policy it answers
  `!authEnforcement`. The switchboard installs the Renown policy only with the flag on
  (`apps/switchboard/src/server.mts`). That is wiring, not a limit.
- **The trust policy today needs the network.** `createRenownTrustPolicy` looks up the credential for
  (address, key). `getRenownTrustPolicyConfig` runs Renown discovery at boot. A bearer is checked
  against Renown on each cache miss, and `fetchDelegationCredential` turns any read failure into "no
  credential", so a Renown outage answers 401 to every bearer.
- **A statement in `context.signer` needs no schema change.** `signatures` is `[String!]!`, each entry
  a tuple joined with `", "` for transport. Every reader that picks the signing tuple takes the last
  entry (`verify-action-signature.ts`, `signAction`, `createSignatureVerifier`). Empty params survive
  the round trip.
- **Tuple element [3] is signed and unconstrained.** `buildOperationSignatureMessage` covers
  elements 0 to 3. `v2TupleProblem` checks 0, 2 and 4. Production code never compares element [3] with
  anything; `parseSignatureHashField` splits it, and the revision history displays it.
- **The session key is local and silent.** `IRenown.crypto.issuer` signs ES256 with a P-256 key held
  in IndexedDB. `logout` keeps it.
- **On desktop there are three keys, not one.** The webview's session key lives in the webview's
  IndexedDB. The host key is `${userData}/.ph/.keypair.json`, which `RenownCryptoBuilder` generates on
  first run. The runner key below is a third. No two are the same.
- **A desktop first run has no identity.** `.renown.json` is empty, `AUTH_ENABLED` is unset and the
  policy is `OPEN`, so `ReadableDocuments.filterFor` answers `all` and the AI gateway does not mount.
- **The switchboard binds every interface.** `httpAdapter.listen(port, tls)` passes no host, and no
  host option reaches it.

## Decision

Keep Renown as wallet to session key. Add one more link: the session key signs a statement naming a
delegate key. The delegate signs as the person and carries the statement. Verify the chain with
`authEnforcement` off. Do not build a v3 preimage.

### 1. The chain

```
wallet X --Renown credential--> session key A --statement--> delegate K
```

Two links only. K holds no Renown credential, so nothing K signs onward verifies. The trust policy
gains one rule: a key named in a Renown credential may delegate one level, attenuated. The credential
itself says nothing about this, so the Renown owner has to accept the rule.

### 2. The statement

A compact JWS, `ES256`, signed by A, with header `{"alg":"ES256","typ":"ph-delegation+jwt"}`. The
`typ` keeps it apart from bearer tokens, which A also signs.

| Claim | Value |
| --- | --- |
| `iss` | A, `did:key` |
| `aud` | K, `did:key` |
| `sub` | X, `did:pkh:<network>:<chain>:<address>` |
| `env` | The host's `did:key` |
| `scp` | `{ "ops": [...], "res": "..." }` |
| `iat`, `exp` | Seconds |
| `jti` | A UUID |
| `prf` | The Renown credential binding X to A, with its EIP-712 proof |

- `scp.ops` lists action types. This slice accepts only `PUBLISH_WORKFLOW`. Anything else, `*`
  included, is refused, and a later version widens the list.
- `scp.res` names what the statement is for. Sektar uses `sektar/integration:<id>`. The host that uses
  the statement checks it. Other reactors treat it as a label.
- `prf` is new against the earlier plan. It makes both links verifiable with no network, which the
  offline rule in §11 requires. It costs about 2 KB on each delegated action. Only publishes carry it
  in this slice.

### 3. Where the proof lives

In the action, as an earlier entry of `signatures`, and bound by the signing tuple:

```
signatures: [
  ["dlg1", A, "", <statement>, ""],
  [<time>, K, <v2 hash>, "dlg1-" + base64url(sha256(<statement>)), <signature>]
]
```

**Binding needs no v3 preimage.** Element [3] of the v2 tuple is inside the signed message, and
nothing reads it as a state hash. Setting it to the statement's hash means K's signature covers the
statement. A relay can no longer strip the statement or swap in another genuine one: the policy
refuses a tuple whose element [3] names a statement that is absent or different. The v2 preimage and
`hashActionV2` do not change.

What this does not protect:

- **Run id and workflow stay unsigned.** Those still need a v3 preimage, or `signer.app.name` as a
  label.
- **A thief with K can sign with an empty element [3] and no statement.** With enforcement off that
  op is an unverified claim, exactly like any other key claiming an address today (§5).

### 4. Verification

`verifyDelegation` is pure and offline. It checks, in order:

1. The JWS is `ES256`, typed as above, and verifies under `iss`.
2. `sub` is a `did:pkh` equal to `signer.user`.
3. `aud` equals the signing key.
4. `prf` is a credential with `issuer` X and `credentialSubject.id` equal to `iss`, and its EIP-712
   proof recovers X. A `prf` of any other shape is refused, which is what refuses depth 3.
5. `scp.ops` is a non-empty subset of the accepted action types. The action's own type is in it.
6. The signing tuple's time lies in `[iat - 300s, exp)`.

`createRenownTrustPolicy` runs this when the signer carries a statement, or when the tuple's
element [3] names one. It makes no lookup in that case. Otherwise it behaves as today.

`SignatureTrustPolicy.authorizeSigner` gains a fourth argument, `{ path, actionType }`. An older
policy ignores it. The doc comment's cache rule becomes "(user, key, statement hash)".

### 5. Verification without enforcement

The switchboard installs a policy on every host. With `authEnforcement` off it is
`createRenownTrustPolicy({ delegationOnly: true })`:

| Case | Result |
| --- | --- |
| Unsigned caller | Unchanged. The policy is never asked. A claimed address is `UNSIGNED_IDENTITY` |
| The host's own writes | Unchanged. `admissionTrustPolicy` accepts them before the policy |
| Signed write with no statement | Unchanged. The policy answers `true`, as the default did |
| Stored operations | Unchanged. The policy is asked once, at first storing, never on re-append. No sweep runs |
| Sync from a peer | Unchanged with no statement. With one, it is verified like any other |
| Signed write with a statement | Verified offline. A failed chain is `SIGNER_UNAUTHORIZED` |

Delegation-only mode makes no network call and needs no Renown discovery at boot, so it adds no boot
dependency. A host with no delegations behaves as today. With enforcement on, a valid chain is
accepted and everything else behaves as today. The action type check then has force, because a
stripped statement leaves (X, K) with no credential, which is refused.

Verified with enforcement off: the chain, the audience, the person, the time window, the action type
and, at first write, the environment. Only recorded: a key claiming an address with no statement, and
`scp.res` on other reactors. The reactor's document permissions stay off.

### 6. The environment check

`env` must equal the host's own key at first write (`path: "mutation"`). On load it is not checked,
because peers receive these operations legitimately. This stops a copied key and statement being used
on another host. It does not stop a thief who writes to the original host, or a peer's reactor
accepting a copy by load. A trust policy with no known host key refuses a statement at first write.

### 7. Amendments to ADR 0005

- **§6:** a publish signed by a delegate with a valid statement is the person's publish. The rule and
  `runUserOfOperation` do not change: K is not the host key, so the run user is X with subject key K.
  Runs start after a person approved the runner, not each snapshot. The history shows this honestly.
- **§6:** a host that needs a person (§9) does not publish as nobody. Sektar's reconciler stops and
  asks for the grant instead.
- **§7:** unchanged. Run writes stay host-signed until stage 2.
- **§8:** unchanged. With enforcement on and no `authConditions`, a host with no address still has
  the grant problem described there.

### 8. Lifecycle

Link one is judged at issuance, link two at each use. `checkCredential` answers one of four:

| Answer | Meaning | Effect |
| --- | --- | --- |
| `active` | Renown holds it | None |
| `revoked` | Renown says revoked, or dropped one not yet expired | Repairs stop, workflows are disabled, the card asks again |
| `expired` | Past its date | None. Link one is not re-judged, or every delegate would die in 7 days |
| `unknown` | Renown did not answer | None. Log a warning. It never blocks or stops anything |

- `exp` passing stops repairs and disables the workflows, and the card asks again. Any visit from a
  signed-in browser renews silently. Statements last 30 days and renew with under 10 days left.
- An op already stored stays valid after `exp`. A run on it resolves to X until the reconciler
  disables the workflow.
- A person's logout changes nothing.

### 9. Who needs a person

A processor learns about its host from a new `IProcessorHostModule.host`: `{ key, address,
requiresPerson }`. `requiresPerson` is true when the authorization policy is not `OPEN`. The field is
absent in the browser.

A reconciler stops publishing only where `requiresPerson` is true, the host has no address and the
integration has no live statement. An `OPEN` host and a host with a `ph login` publish as they do
today.

### 10. Refused index reads

`indexQueryFor` refuses a caller the policy would give no rows, instead of returning an empty index.
Under `ADMIN_ONLY` a non-admin, or nobody, gets an error naming the cause. A refused read can no longer
pass for "nothing exists" and make an upsert duplicate everything. Under `OPEN` and
`DOCUMENT_PERMISSIONS` nothing changes, because the filter there can legitimately be partial.

### 11. Desktop

Desktop has a signed-in person, as cloud does. Decided with the owner: login is enforced, and once
logged in the app works offline.

- **Login is enforced by the switchboard.** The `desktop` host sets `auth.enabled`,
  `requireAuthenticatedCaller` and `resolveIdentity` in `config.switchboard`, as the `cli` host does
  through env. Connect's existing drive gate then asks for sign-in. The AI gateway mounts, because the
  policy is `ADMIN_ONLY`.
- **The first signed-in person becomes the owner.** `auth.ownerClaim` makes the first verified
  bearer on a host with no admins the admin, recorded in `<phDir>/.owner.json`. Nobody edits an env
  file. It is off by default, and refused alongside a configured `ADMINS`.
- **The host binds loopback.** The switchboard gains a bind address, and the `desktop` host uses
  `127.0.0.1`. Otherwise anyone on the local network holding a Renown credential could claim the host
  first.
- **Credentials work offline.** `auth.offlineCredentials` keeps each verified credential in
  `<phDir>/.credentials.json`. When Renown does not answer, a kept credential whose proof verifies is
  accepted, whatever its date. A definite "revoked" removes it. Off by default, so a cloud host still
  refuses during an outage.
- **Nothing on the path needs Renown.** The statement carries the proof, delegation-only mode has no
  lookups, `verifyAuthBearerToken` resolves `did:key` locally, and a browser `revalidate` that fails
  on the network keeps the session.
- **Sign-in goes through the system browser where the shell offers it.** The webview cannot hold a
  popup, and Google refuses embedded sign-in. `ph-desktop-shell` needs to expose an opener
  (`window.phDesktop.openExternal`). With it, `openRenown` uses the same console session as
  `ph login`: open `/console?session=…&connect=<A>`, poll, log in. Without it, `openRenown` keeps the
  redirect, which returns to the app's own URL. Google's integration sign-in needs the same opener.

### 12. Runner key

Sektar keeps one per-environment key, never the host key, in `<phDir>/.runner-keypair.json`. Where
`PH_WORKFLOWS_SECRETS_MASTER_KEY` is set, the file is AES-256-GCM encrypted under a key derived from
it. Piece workers get no env (`worker/transport.ts`), so on a cloud host they can read the file but
not open it. On desktop there is no such key, so the file is plain, on the same disk as the host key.

The reconciler is the only caller, and it signs only `PUBLISH_WORKFLOW`, only for a statement it has
verified against its own K and `env`.

## Consequences

### Positive

- Issues 2 and 4 are solved on a new environment with no `ph login`.
- History separates "X did this" from "K did this for X, on the authority of A".
- A delegated operation verifies forever, on any replica, with no network.
- Statements are tamper-evident with no change to the preimage.
- A host with no delegations keeps its behaviour, including its boot path.

### Negative / risks

- **The format is permanent once stored.** Sign-off comes before the first delegated publish.
- **Element [3] gets a second meaning.** It is cheap and it works, but it is the kind of thing a
  reviewer may reject. The fallback is a v3 preimage before anything is stored.
- **The wallet never sees the delegate.** A click in a page authorises it, and any same-origin script
  could do the same. That script can already sign as X, so this adds no power, but the wallet holds no
  record of the consent.
- **A stolen K works within scope until `exp`, and can backdate inside the window.** No offline design
  gets both "old operations verify forever" and "a thief cannot backdate".
- **Revocation reaches other reactors only through `exp`.** The host stops at once.
- **On desktop the runner key is a plain file** that piece code could read.
- **With `auth.offlineCredentials`, a revoked credential keeps working on that host until it is next
  online.**
- **Desktop login is a behaviour change.** An existing desktop store, used with no sign-in so far, now
  asks for one.

Confidence: high for the format and the verification rules, which are tested. Lower for desktop
sign-in, which depends on a shell change not yet made. Revisit if run writes move to stage 2, because
carrying `prf` on every write costs real space there, and if a v3 preimage is agreed.

## Alternatives considered

- **Do nothing.** Issues 2 and 4 stay, and every new environment needs a hidden workaround.
- **Runs act as the granter.** It changes ADR 0005 §6, adds a source to every reader of the run user,
  and needs either K or Sektar's document shape inside the runtime to be safe.
- **The person publishes every snapshot.** It is the strongest record, but a routine backfill queue
  change would wait for a person, and the reconciler stops being unattended.
- **Renown delegates to K directly.** It needs a wallet in the flow, and Renown's hosted page may not
  name another key.
- **UCAN 1.0.** It needs DAG-CBOR, Varsig and CIDs, none of which are here, and has no official JS
  library. The field names follow UCAN so the format can move later.
- **A statement with no `prf`, checked by lookup.** It is smaller, but it fails the offline rule, and
  a lookup in a pooled worker needs state it cannot reach.
- **Install the full Renown policy with enforcement off.** Every signed write would need a credential
  lookup. Peers' operations would be dropped on load and boot would need Renown. It breaks existing
  hosts.
- **A v3 preimage now.** It would also sign run ids. It is a larger change to the signing protocol, not
  needed to bind the statement, and was kept out of this slice on instruction.
- **Owner from `ph login`.** The host would need a second sign-in, for its own key, beside the
  session key's.

## Implementation footprint

- `packages/renown`: `delegation.ts`, credential status check, policy, console login, offline store.
- `packages/reactor`: the fourth `authorizeSigner` argument.
- `packages/reactor-api`: owner claim, offline credentials, `host` on the processor module, bind
  address.
- `packages/reactor-browser`: system browser sign-in.
- `apps/switchboard`: policy wiring, `indexQueryFor`, config.
- `packages/design-system`: the revision history counts tuples only.
- Sektar: runner key, grant record and step, reconciler, card, `desktop` host.

Not in this slice: run writes signed by the delegate, document permissions, HTTP bearers for
delegates, scoped agents.

## Open questions

**Renown owner**
1. May a session key delegate one level, given the wallet never sees it? Does a later credential need
   an explicit flag?
2. Does `/console` accept a `connect` key from a webview's session and return to polling with CORS
   open to `http://127.0.0.1`? `ph login` proves the page, not the browser origin.
3. Will the REST credential endpoint distinguish revoked from expired? This ADR infers it from the
   carried `expirationDate`.

**acaldas, Frank**
4. Is a second meaning for element [3] acceptable, or does it want a v3 preimage first?
5. Is the fourth `authorizeSigner` argument acceptable, and is a path-dependent `env` check sound
   against the "same verdict on every replica" contract? Replicas do agree on the operation; only
   first write adds a check.
6. Should a Sektar host run with enforcement on? Without it, a key claiming an address with no
   statement stays an unverified claim.
7. Does signing as the delegate in stage 2 disturb the grants of ADR 0005 §8?
8. Does a delegated operation sync cleanly to a peer that has no policy? Unit tests cover the entry's
   round trip; no two-reactor test over real sync exists yet.

**Benjamin Jordan**
9. Is the operation's signed time the right clock for `exp`, given ADR 0007? The window allows a thief
   to backdate. Should first write bound the signed time against the host's clock?

**Owner**
10. Is 30 days the right statement life? How long may `unknown` go on before someone is told?
11. Should `auth.ownerClaim` be reversible from the app? Today it means deleting `.owner.json`.

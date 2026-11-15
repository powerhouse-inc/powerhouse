# Document-model initial authorization

Status: Verified reference implementation. This document specifies the opt-in contract implemented in this worktree; it is not an application migration or a claim of deployment readiness.

## 1. Purpose and scope

A document-model version may declare an initial authorization policy alongside its state and operations. The Reactor resolves trusted identity bindings and installs that policy when creating an instance, before making the instance available.

This feature reuses the existing grant evaluator, auth actions, groups, and condition language. It does not introduce authentication, immutable policy restrictions, field-level privacy, implicit parent inheritance, or automatic synchronization of application roles.

The authoring feature is code-first-specific. Existing schema-first documents remain compatible; adding schema-first template authoring is outside this release. PFNUR supplies reference scenarios, not platform-specific roles or behavior. MUST, MUST NOT, and SHOULD express the feature contract.

See [application examples and negative type cases](document-model-initial-auth-examples.md) for the expected developer experience.

## 2. Model authoring contract

The declaration is `model.version({ modules, auth: context => context.policy.initial(...) })`. The context exposes only the selected modules' declared operations and the model's scopes. Auth remains platform-owned; models cannot replace its schema or reducer.

Given a code-first `note` context whose global descriptor declares `title: string` and `locked: boolean`, the operation and its policy are authored together:

```ts
const notes = note.module("notes", {
	operations: ({ global }) => ({
		setTitle: global({
			input: ph.input({ fields: { title: ph.String({ required: true }) } }),
			reduce(state, input) { state.title = input.title; },
		}),
	}),
});

const NoteV1 = note.version({
	modules: [notes],
	auth: ({ operations: ops, scopes, platform, policy: p }) => {
		const bindings = p.bindings({
			administrator: p.addressBinding({ source: "deployment" }),
			owner: p.addressBinding({ source: "instance" }),
		});
		return p.initial({
			version: 1,
			bindings,
			grants: [
				p.allow({
					id: "administrator", description: "Manage instance access",
					principal: bindings.administrator,
					target: p.executeMany([
						platform.auth.setGrant, platform.auth.removeGrant, platform.auth.moveGrant,
					]),
				}),
				p.allow({
					id: "owner-read", description: "Read this note",
					principal: bindings.owner, target: p.read(scopes.global),
				}),
				p.allow({
					id: "owner-edit", description: "Edit the title",
					principal: bindings.owner, target: p.execute(ops.notes.setTitle),
					where: ({ state }) => p.eq(state.locked, false),
				}),
			],
		});
	},
});
```

`ops.notes.setTitle` is an opaque reference to the declared operation, not a string or action creator. The compiler derives its persisted `SET_TITLE` name through existing naming rules. Using materialized action creators here would introduce a circular dependency and is prohibited.

The `auth` and condition callbacks execute during definition compilation against symbolic references and produce serializable data. They do not receive live state or execute during authorization. `p.allow` and `p.deny` construct grants; a JavaScript boolean is not a condition token.

### Required type guarantees

| Area | Required contract |
| --- | --- |
| Operation selection | References derive from the selected module tuple and its declared operation keys. No raw operation strings, guessed names, or separate action-name union. Auth cannot widen the tuple inferred from `modules`. |
| Scope | `read` takes a scope reference. `execute` derives scope from its operation. `executeMany` takes a nonempty tuple of references in one scope. |
| Conditions | A single-operation target exposes its executing scope's state and that operation's original `InputOf` input. Read and multi-operation targets expose state and subject, but no action input. Split input-dependent grants by operation. |
| Operands | Field references derive from descriptors, including nested optional fields, enum literals, null, and missing values. Only primitive-valued operands supported by auth v1 are comparable. No dynamic array membership, object equality, or implicit numeric interpretation of strings. |
| Comparisons | Infer literal constraints from the referenced operand, not the comparison value. `eq(status, "DRAFFT")` cannot widen an enum to `string`; use `NoInfer` or equivalent. |
| Principals | Address and group bindings are distinct opaque references. `anyone`, validated literal principals, and relationship principals use typed builders. Relationship conditions use the grant target's symbolic context. |
| Bindings | Preserve literal keys, kind, and deployment/instance source. Derive required resolver result maps from the version token and preserve them through materialization and family composition. Values use validated address and group-ID types, not arbitrary strings. |
| Platform operations | Expose a separate platform operation catalog with real scopes and inputs, including auth administration, document lifecycle, and inherited rename/slug/editor actions. Header operations expose subject and input without inventing a domain-state scope. Do not expose creation or genesis as ordinary grant targets. |

Implementation MUST derive the catalog from `ModelModuleToken`'s selected module keys and inferred actions, using the retained input descriptors for validators. State operands use the selected scope's `SourceOf` type. Add binding-schema metadata to the version token and materialized version so `InitialAuthBindings<typeof NoteV1>` can be inferred without a second handwritten interface. Family APIs retain this metadata per version. Widened module keys must not silently become an unrestricted string-indexed catalog; require preserved literal types. Raw `Grant` objects remain a validated wire representation, not a permissive overload of the typed authoring API.

`p.allOperations(scope)` is the explicit opt-in to current and future operations in a scope. An omitted list is not an authoring shortcut. This target has no operation-specific input context. Read grants are not implied by the TypeScript API; runtime implied-read semantics remain documented below.

TypeScript does not establish authorization or generative model identity. Same-shaped model contexts can be structurally assignable. The compiler MUST validate runtime provenance for operation, scope, binding, and condition tokens, rejecting forged, foreign, stale, or unselected references. Runtime validation also rejects unknown keys, missing values, duplicate grant IDs, and malformed imported data; these are not all statically provable.

All declared bindings MUST resolve. The resolver MUST NOT silently drop a grant with a missing binding. An invitation with no owner uses a template without an initial owner binding, or a guarded state-based relationship. Claiming it can add owner grants through authorized auth operations.

Omitting `auth` preserves existing creation behavior. Returning an initial policy makes initialization mandatory for new instances of that version. Public access requires explicit `anyone` grants and a valid administration path.

## 3. Compilation and validation

The compiler lowers typed references into a serialized template using existing `Grant` and `Condition` forms plus typed principal-binding placeholders. It MUST retain the template in the model-version specification and materialized module. Definitions containing templates use `DocumentModelDefinition.formatVersion: 2`; definitions without templates retain format 1. Unsupported definition readers MUST reject format 2 rather than discard metadata.

Compilation MUST validate binding references and kinds, unique grant IDs, operation names and scopes, and condition paths against the applicable state and input descriptors. Platform operations use the platform catalog. Existing grant, condition, and size limits also apply. Runtime validation repeats the applicable checks after binding resolution.

The compiler MUST preserve grant order. Explicit references remain unchanged when operations are added. Only `allOperations` lowers to a capability without an operation list. Scalar validators and descriptor identity remain authoritative; type inference MUST NOT substitute resolved reducer inputs for the original action inputs the evaluator receives. Custom scalar operands require an explicit primitive wire representation when their schema does not serialize as a primitive. Transforms are inspected on their input side; auth authoring MUST NOT silently change registered scalar metadata.

The compiler produces a SHA-256 digest of the canonical template, including its binding declarations, language version, and ordered grants. Helpers may construct declarations, but the compiled template MUST contain data only. No callback runs during authorization or replay.

## 4. Trusted creation inputs

The host MUST authorize creation for the requested model, application context, and parent before resolving bindings. Instance grants cannot authorize creation of their own instance.

A trusted host binding provider receives the verified requester, selected model version, authorized creation context, and validated initial domain state. It returns concrete addresses and group document IDs. A client may request a relationship, but cannot certify its own role, tenant, owner, or administrator.

Deployment bindings come from trusted host configuration. Instance bindings come from verified relationships or the authenticated requester when the application permits that assignment. Address normalization MUST follow the identity provider's rules consistently with the evaluator. Required groups MUST resolve to valid group documents in the authorized context.

`source` declares which typed provider result supplies a binding; it does not read an environment variable or resolve an identity itself. For example, `administrator: p.addressBinding({ source: "deployment" })` requires an `administrator` address in the provider's deployment configuration. An instance binding must instead be returned by `resolveInstance` for the authorized creation request.

The host registers `defineInitialAuthProvider(materialize(NoteV1), { deployment, authorizeCreation, resolveInstance })` through `ReactorBuilder.withInitialAuth({ providers, trustOrigin })`. Both callbacks receive deeply readonly, frozen initial state, the verified requester, application context, and a `read(documentId, branch?)` function for frozen, revision-tracked authorization facts. `authorizeCreation` MUST finish successfully before `resolveInstance` runs. `trustOrigin` separately authorizes an initializer key to attest creation bindings for a model version.

Trusted in-process callers use `write.createWithInitialAuth(draft, { requester, idempotencyKey, context })`. It returns the existing `WriteHandle`; `written` and `readable` return receipts, and `document({ subject })` independently gates readback. Transport adapters MUST derive `requester` from authenticated request context, never from a client-supplied identity object. The signing service and requester may be different principals.

The host MUST validate authorization-relevant initial values such as account type and company ownership. Document-backed facts used to authorize creation or resolve these relationships MUST participate in the commit's consistency checks. Fact snapshots MUST be reconstructed at the recorded stream revisions, rather than accepting a cached head alongside newer database revisions. External identity assertions remain subject to the host's verification and expiry rules.

Caller-supplied `initialState.auth`, `auth.creator`, and initialization provenance MUST be rejected on this creation path. Policy overrides are not part of version 1. Low-level document utilities can build drafts but do not establish an authorized, persisted instance.

## 5. Protected creation protocol

### Authority and evidence

New protected instances MUST use v2-signed actions and an `auth-bootstrap: 1` protocol capability. The creation signer is the one-time bootstrap authority. This authority does not confer permanent auth administration or business ownership.

The signed `CREATE_DOCUMENT` input gains an `initialAuth` commitment containing:

- Bootstrap format version, selected model version, initializer key, origin authority, and canonical intent digest.
- Kind: `template` with template digest and resolved bindings, or `copy` with source document, branch, and checked stream revisions.
- A digest of the resulting `{ version, grants }` policy.
- The initial-state digest and all three preallocated action IDs, in creation order.

The initializer key and creation action ID in the commitment MUST match the verified action. They are not accepted as independent identity assertions. Digests use the existing canonical JSON and SHA-256 conventions and preserve array order.

Legacy document IDs do not commit bootstrap authority or policy. For this protocol, derivation additionally commits the initializer app key and a digest of the complete bootstrap intent. Compute this digest before the document ID and action signatures, excluding the derived document ID, target-dependent signature hashes, and signatures. Include the intended initial state, resolved policy, bindings, origin, model version, and preallocated bootstrap action IDs. Changing any of these produces a different identity. A local unused-ID check alone cannot prevent conflicting bootstrap histories on disconnected replicas.

The immutable header MUST carry this authority/intent commitment, and `CREATE_DOCUMENT` MUST agree with it. Header validation and ID verification MUST include it when the protocol is selected; mutable `header.meta` is not suitable. Existing document ID derivation remains unchanged for documents without this protocol.

Initial values requiring the new derived document ID cannot participate in this non-circular bootstrap format; initialize them afterward through authorized operations. This is a version-1 restriction, not an existing runtime limitation. Host retries MUST reuse a persisted intent under a requester/context-scoped idempotency key; changed request content under that key is a conflict.

For `template`, the Reactor MUST independently resolve or verify the bindings and compare the policy with the selected template at origin admission. Possession of a matching digest alone is not authorization. Replicas MUST verify template substitution using the recorded bindings, without resolving them against local deployment configuration. A receiving host MUST also authorize the origin signer to attest bootstrap bindings; ordinary authentication of a user or app is insufficient. Unrecognized bootstrap authorities are refused.

Protected bootstrap MUST NOT populate `auth.creator`. Version 1 accepts the modern empty-key header path; legacy keyed-header creation is not eligible for this protocol. Existing documents retain their existing creator semantics. The concrete initial grants MUST satisfy the current creator-less administration-retention check, including a reachable unconditional address or anyone grant permitting `SET_GRANT` on `auth`.

### Commit sequence

The Reactor MUST implement one dedicated protected-creation unit:

1. Authorize the request and validate the complete initial domain state. Resolve the template and bindings for `template`, or verify the source policy for `copy` as specified below.
2. Construct and verify `CREATE_DOCUMENT`, the initial `UPGRADE_DOCUMENT`, and `INITIALIZE_AUTH`. The upgrade snapshot carries uninitialized auth; only the auth action installs the policy.
3. Verify that the initial auth action matches the committed action ID and policy digest and uses the creation signer's verified identity and app key. Validate the upgrade against its committed ID, model version, and initial state.
4. Reduce and validate the complete bootstrap privately. Any error or denied operation aborts creation.
5. Commit both the document and auth streams atomically, conditional on the document identity being unused across branches and the authorization read-set remaining valid. Persist the bootstrap evidence with them.
6. Publish views and notifications only after successful commit. Until all required bootstrap records are available, domain reads, ordinary writes, subscriptions, processors, and external sync serving MUST withhold the instance.

This requires a dedicated creation execution path within one transaction. Kysely already provides a transaction-bound execution scope that can be reused for both stream writes, indexes, and identity records. Ordinary jobs have one scope, and batch jobs do not share that boundary. The protected creation unit MUST write both streams without changing ordinary job semantics. Nontransactional storage adapters MUST reject protected creation until they provide equivalent atomicity.

Ordinary transaction-bound cache wrappers share backing maps with public caches. The protected creation path requests isolated wrappers. SQL rollback alone therefore does not prevent provisional state from being read. Protected creation MUST use private transaction caches and publish invalidations only after commit. Rollback, concurrent visibility, and post-commit notification behavior require integration tests; ordinary execution retains its existing transaction API.

Internal reconstruction may temporarily hold auth version 0; no serving or ordinary execution path may treat that intermediate state as an open instance. Subsequent attempts to initialize auth, including backdated actions, MUST fail the bootstrap commitment check unless they are the identical recorded action. Later actions MUST be evaluated after bootstrap; backdating cannot recover uninitialized permissions. Snapshot upgrades MUST NOT install or replace auth on this protocol. Bootstrap evidence is immutable and cannot be overwritten by state snapshots.

Parent attachment follows protected creation under its own authorization. Failure leaves a protected, unattached document and an explicit retryable attachment result. Creation success returns an ID and consistency receipt; returning domain state requires a separate read check.

### Retries and replication

A creation identity is the document ID, initial branch, and committed creation intent. Retry with identical evidence MUST return the existing receipt without appending genesis again. Different evidence for the same identity MUST fail with a conflict. Crash recovery MUST produce either no committed bootstrap or the complete bootstrap. A retry's `readable` receipt MUST wait for the required read projections, including when a previous process committed creation and stopped before publishing its view. Projection recovery MUST NOT repeat application processors or creation notifications.

Sync receivers MUST buffer an incomplete bootstrap and validate and commit the complete unit before serving it. Replay uses recorded grants, initial state, and evidence, never the latest template or local environment. Bootstrap prerequisites MUST precede ordinary operations in logical replay order, independent of delivery order.

Staging MUST verify fragment signature integrity before retention. Before the authoritative creation record arrives, candidates from different signer keys MUST remain separate. A conflicting fragment from another key cannot reserve a committed bootstrap action ID or prevent the authentic envelope from completing. Selecting the authoritative creation record requires its derived document identity and actual signer to match the commitment.

Ordinary operations delivered with bootstrap fragments MUST NOT make a valid bootstrap depend on their validity. The receiver commits the three-action prefix atomically, evaluates following operations through the existing authorization path, and isolates a failing following scope with a savepoint. Permanently invalid genesis or pre-genesis operations are discarded; following scopes that cannot yet be processed remain pending for a later load. Rolled-back operations MUST NOT appear in read views or successful operation receipts.

Older software admits unknown protocol keys, and some read paths fall back for unknown base-reducer versions. Neither a new flag nor a new version number alone is a compatibility barrier. Before enabling templates, upgrade participating hosts' admission, read, file-import, and export gates. Upgraded senders MUST withhold protected documents from peers without explicit support. Old binaries cannot be assumed to reject these documents themselves.

### Snapshot confidentiality

The existing initial upgrade embeds domain state inside a document-scope operation. Filtering its outer scope alone does not protect that payload. History, export, and sync MUST withhold an intact signed snapshot unless the recipient may read every embedded domain scope. The same rule covers operations embedded in document query results. A signed action MUST NOT be redacted and presented as the original operation.

Sync serving MUST check persisted creation evidence when the read projection is unavailable; metadata-only fallback cannot expose an initial upgrade snapshot. The production sync-serving factory supplies this lookup. Custom hosts constructing `SyncScopeGate` directly MUST supply its `operationStore` argument when serving protected documents.

Scope-filtered current-state query responses remain available. Partial-scope bootstrap replication with this full-snapshot format is outside version 1; it requires a separately verifiable scoped representation. This restriction and the initial-ID restriction above are release scope decisions that applications must account for.

## 6. Ongoing authorization and lifecycle

After creation, existing auth operations and evaluation semantics apply:

- Initialized policies default to deny; the last applicable grant wins.
- Address and group principals, state conditions, and action-input conditions retain their current meanings. Arbitrary cross-document business-state queries are not introduced.
- Execute allows may imply scope reads, subject to conditions. Reads have no action input. `auth` and `document` remain readable to holders under existing rules; bindings and descriptions must not contain secrets.
- Read access is scope-level. Restricting an operation does not redact fields that operation or scope exposes.
- Domain grants do not implicitly authorize auth administration, document deletion, upgrades, or parent operations.

A missing group makes that principal fail to match. This removes an allow, but can also remove a deny and expose an earlier allow. Group-deny policies MUST receive an authoring diagnostic and a missing-dependency test; the compiler MUST NOT claim all such policies fail closed. Prefer positive allow-list groups. `exists` tests presence, not non-nullness; negation of a failed comparison can become true. Nullable relationships require explicit guards.

Advertising `auth-bootstrap: 1` requires host `withInitialAuth` configuration, enforced signature verification, and the complete version-1 evaluator: `documentDecisions`, `authEnforcement`, `authGroups`, and `authConditions`. Missing support is an error, not a reason to ignore a grant. This requirement also covers groups or conditions introduced by later grant changes. Unsupported auth language versions MUST be refused on this protocol.

Defaults are applied once. Package reloads, model upgrades, and ordinary reads MUST NOT reinstall them. Policy migrations use authorized auth actions, preserve deliberate instance changes, and record their own audit history. A model version's template is immutable once released; changing it requires a new model version.

Role changes, invitation claims, revocation, owner reassignment, and service-key rotation remain explicit application workflows. Initial defaults do not supply cross-document lifecycle atomicity. Endpoint authorization remains required when a service performs privileged operations for a caller.

Import and identity-preserving replication MUST preserve valid policy and bootstrap evidence and undergo host admission. They do not grant control to the importing user.

Purge MUST erase retained initial-state and binding payloads from bootstrap intents, committed evidence, and pending replication fragments. Only the minimal tombstone and retry-conflict metadata needed to prevent resurrection may remain. A late fragment or an old creation retry MUST NOT recreate a purged identity.

A new-identity duplicate uses `kind: "copy"` in the commitment. `write.copyWithInitialAuth(sourceId, request, options?)` authorizes copying, requires read access to every source domain scope, and preserves the complete ordered policy and model version without resolving defaults. Source revisions and policy digest enter the commitment and consistency read-set. Group membership used to authorize the copy MUST be captured in that same read-set before the host authorization callback; a membership change before commit invalidates the request. The reference implementation requires every referenced group to resolve for both creation and copy. A missing group refuses the copy, including for a directly authorized administrator; it never causes a grant to be dropped. The destination receives new bootstrap actions and evidence; its trusted origin attests preservation. If the current model version no longer declares defaults, the host must supply `withInitialAuth({ authorizeCopy, ... })`; the source remains protected by its genesis commitment. The protected-copy API accepts protected sources only; legacy copying retains its existing path. Copying only available data is explicit fresh creation, not a full duplicate. Branch creation MUST NOT rerun defaults.

## 7. Errors and acceptance criteria

The implementation exposes `InitialAuthError.code` (`invalid-template`, `invalid-binding`, `unresolved-binding`) and `AuthBootstrapError.code` (`invalid-bootstrap`, `untrusted-origin`, `unsupported-bootstrap`, `incomplete-bootstrap`, `intent-conflict`). GraphQL attachment failure returns `INITIAL_AUTH_ATTACHMENT_FAILED` with the completed creation receipt. Application authorization callbacks may throw their own refusal; adapters must preserve their existing public error policy. Public errors MUST NOT expose inaccessible group membership or policy details. Failed bootstrap MUST NOT return a successful creation receipt.

The following are release-blocking integration scenarios:

| Scenario | Required result |
| --- | --- |
| Creation, crashes, and racing initializers | No open interval through direct ID reads, writes, notifications, processors, or sync. Failure commits nothing. Identical retries succeed once; foreign or backdated genesis cannot replace the policy. |
| Identity and recovery | Requester, owner, service, worker, and administrator remain distinct. Anonymous creation requires host authorization and a trusted signing authority. Missing bindings and an unreachable administration policy fail. |
| Initial state and invitations | Sensitive account types and relationships are correct before exposure. An unclaimed account has no accidental owner privileges. Claim adds only authorized grants. |
| Tenant and group boundaries | Invalid group bindings fail creation. Later absent-group behavior matches the evaluator, including the group-deny counterexample. Parent attachment grants no inherited permissions. Group-model restrictions remain enforced. |
| Operations and conditions | Unnamed operations are denied under explicit lists. Current-state and requested-input conditions enforce workflow and worker-generation restrictions. Reads, platform actions, and business reducer validation are tested separately. |
| Lifecycle and service APIs | Membership changes affect subsequent decisions under existing consistency rules. State edits cannot silently substitute for required grant changes. Unauthorized callers cannot invoke privileged service workflows. |
| Migration, imports, and copies | Existing policies survive model updates. Foreign imports require admission. Copies preserve intended access without forged provenance or automatic copier ownership. New branches do not rerun defaults. |
| Compatibility and delivery | Existing schema-first documents remain unchanged. Reordered delivery never exposes an incomplete instance. Upgraded senders withhold data from unsupported peers. Sensitive initial values are absent from unauthorized serialized history/export/sync payloads, not merely from top-level state. |

Positive and negative type tests MUST cover every row in the type-guarantee table. Runtime tests separately cover token provenance, unsafe casts, unavailable groups, and binding authorization. A type test is not proof of permission enforcement.

PFNUR's profile invitation, company isolation, statement processing, and service handover flows provide fixtures for these scenarios. Their names and role taxonomy MUST NOT enter platform APIs.

## 8. Implementation boundaries and rollout

The reference implementation retains the three existing actions specified above. Initializing auth only inside the initial upgrade snapshot was considered: the existing snapshot validator supports that representation, but history-derived group dependencies are discovered from `INITIALIZE_AUTH` and `SET_GRANT` operations. Keeping the auth action preserves that integration and its audit record without changing grant evaluation.

One admission implementation MUST validate local creation, completed replication envelopes, and file imports. A shared readiness check MUST refuse incomplete protected instances at ordinary read and write boundaries. Prepared retry intents and committed evidence SHOULD share one storage-owned lifecycle record; pending replication fragments remain outside ordinary serving stores. These requirements apply only to opted-in documents. Existing models, default feature flags, and document-ID derivation without a bootstrap commitment remain unchanged.

| Component | Required change |
| --- | --- |
| Shared definitions and compiler | Add version-bound operation references, typed targets and expressions, inferred bindings, validation, and versioned serialization. Derive types from the existing operation/state descriptors. |
| Materialization and registry | Preserve the template and inferred capability requirements per model version; reject conflicting registrations. |
| Reactor creation and storage | Add trusted binding integration, non-circular identity commitment, idempotent intent persistence, and atomic creation using transaction-capable execution scopes. |
| Replay, views, and sync | Add bootstrap, compatibility, and embedded-snapshot gates; preserve evidence and withhold incomplete or unauthorized payloads. |
| API and application adapters | Route all protected creation through the same contract, return receipts, and retain caller and parent authorization. |

Roll out protocol, identity, transaction, and reader support before models declare templates. Existing model versions and initialized instances remain unchanged. Hosts may require templates for selected new creations; they MUST NOT silently downgrade a protected version to a legacy one. No schema-first template authoring implementation is required for this release.

The reference host supports the in-process Kysely transactional executor with PostgreSQL or PGlite. `withInitialAuth` rejects worker pools and custom executor managers: trusted provider callbacks and atomic bootstrap admission have not been transported into those executors. Their existing behavior remains available without this opt-in. Supporting those configurations is a separate portability step before promoting this reference implementation to such deployments.

Migrate applications explicitly. A handover that currently requires uninitialized auth must recognize the new bootstrap or use trusted server creation before adopting the template. A package update alone is not a migration. Existing per-instance policies require separate, authorized migration only when their permissions must change.

## 9. Claim audit and verification

The implementation preserves these existing authorization rules:

| Existing behavior | Source and feature boundary |
| --- | --- |
| Uninitialized auth permits access; initialized grants use default deny and last applicable wins | [Auth actions](../../packages/shared/document-model/auth.ts) and [grant evaluator](../../packages/shared/document-model/auth-v1.ts) are unchanged. Protected bootstrap prevents an externally visible uninitialized interval. |
| Execute allows can imply reads; conditions still apply and reads have no input | [Read gate](../../packages/reactor/src/decision/read-gate.ts). Bootstrap adds readiness and signed-snapshot confidentiality checks only for opted-in documents. |
| Keyed initialization can establish permanent creator administration | [Existing initialization](../../packages/shared/document-model/auth.ts). Protected creation uses an empty-key header and installs creator-less grants satisfying the existing retention validator. |
| Auth uses recorded operation inputs; reducers may parse defaults | [Action construction](../../packages/shared/document-model/actions.ts) and [decision evaluation](../../packages/reactor/src/decision/evaluation.ts). Typed conditions derive from original input descriptors. |
| Ordinary batch jobs do not provide an atomic cross-stream bootstrap | [Execution scopes](../../packages/reactor/src/executor/execution-scope.ts). The dedicated path uses one SQL transaction with private caches. |

Executable evidence is kept beside the code:

| Contract | Verification |
| --- | --- |
| Operation/scope/input/binding inference, family metadata, invalid tokens and received definitions | [Authoring and type tests](../../packages/document-model/test/definition/auth/) |
| Trusted identities, invitations, group membership, workflow conditions, retries and revocation | [Reference application fixture](../../packages/reactor/test/initial-auth/reference-app.ts) and [persisted scenarios](../../packages/reactor/test/initial-auth/reference-app.integration.test.ts) |
| Atomic admission, rejected origins, raw-submit bypass, tracked facts, groups, frozen snapshots, archive tampering and purge | [Bootstrap integration tests](../../packages/reactor/test/initial-auth/bootstrap.integration.test.ts) |
| Cross-connection invisibility, rollback, concurrent idempotent creation and read-view recovery | [PostgreSQL integration tests](../../packages/reactor/test/initial-auth/concurrency-postgres.integration.test.ts) |
| Adding/removing templates across model versions, split legacy creation, import/copy after revocation | [Family lifecycle tests](../../packages/reactor/test/initial-auth/family-lifecycle.integration.test.ts) |
| Verified HTTP requester distinct from service signer, readback, forged inputs and recoverable attachment failure | [GraphQL application tests](../../packages/reactor-api/test/initial-auth-reference.integration.test.ts) |
| Out-of-order bootstrap and confidentiality before projection through the actual GraphQL sync transport | [HTTP sync test](../../packages/reactor-api/test/initial-auth-sync.integration.test.ts) and [projection-readiness test](../../packages/reactor-api/test/initial-auth-sync-readiness.integration.test.ts) |
| Fresh authorization facts after replication or another host's writes, including untemplated models | [Fact/cache regressions](../../packages/reactor/test/initial-auth/isolated-load-cache.integration.test.ts) |
| Group revocation during copy and missing-group refusal | [Copy permission regressions](../../packages/reactor/test/initial-auth/copy-permissions.integration.test.ts) |
| Protected create/copy through registered drive strategies | [Drive integration tests](../../packages/reactor-drive/test/reactor-drive-client.integration.test.ts) |

The reference fixture models PFNUR-style scenarios without importing or modifying PFNUR. Deployment trust, application-specific tenant checks and external identity expiry remain host responsibilities. The implementation does not auto-migrate schema-first models or existing instances. Full signed snapshots require access to every embedded domain scope; partial-scope bootstrap replication remains outside this version.

The existing [auth scope specification](auth-scope.md) provides background; executable source takes precedence over historical comments. Design guidance: [OWASP authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [DCB conditional append](https://dcb.events/specification/), and [TypeScript NoInfer](https://www.typescriptlang.org/docs/handbook/utility-types.html#noinfertype).

PFNUR reference: `apps/connect/subgraphs/shared/{policies,profile-policy,handover,account-access}.ts` in `/Users/yasiel/powerhouse/pfnur/pfnur-monorepo`. These are scenario evidence, not a runtime dependency.

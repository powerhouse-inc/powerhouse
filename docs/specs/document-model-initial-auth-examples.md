# Initial authorization: application and type examples

These examples accompany the [formal specification](document-model-initial-auth.md). Builder APIs are implemented in the reference implementation. Each policy excerpt runs inside the `auth` callback and uses that model's inferred `ops`, `scopes`, `bindings`, and `p`. Excerpts omit the common administration grant, which a complete policy must retain.

## 1. An owner can edit a note but cannot take over authorization

The main specification declares `setTitle` through `note.module`. Its grant targets `p.execute(ops.notes.setTitle)`, so renaming or removing the operation breaks the policy reference at compile time. Adding `deleteNote` does not extend that grant.

| Request | Result |
| --- | --- |
| Alice owns the note and it is unlocked | Alice can read and set its title. |
| Alice owns the note and it becomes locked | Alice can still read; the conditional title grant no longer applies. |
| Bob knows its document ID | Bob has no domain access without another grant. |
| Alice submits `SET_GRANT` or a document deletion | The title grant supplies neither permission. |
| The model later adds another operation | Existing explicit operation grants do not include it. |

The host determines `owner` from an authorized request. Accepting an arbitrary `ownerAddress` input would bypass the intended relationship even though the TypeScript value was a valid address.

The provider output type comes from the authored model:

```ts
const values = {
	deployment: { administrator: validatedAdministrator },
	instance: { owner: validatedOwner },
} satisfies InitialAuthBindings<typeof NoteV1>;
```

The values above have validated `AuthAddress` types. Parsing an address proves its representation, not that the requester may assign it. The provider still performs the authorization check. A group ID in `owner`, a missing administrator, or a raw string fails the typed boundary; unknown keys must also be rejected at runtime.

## 2. An invited profile has no owner yet

Assume the global descriptor declares `ownerAddress` as a nullable address string. The profile starts with `ownerAddress: null`. A relationship grant can remain dormant until a verified claim sets that field:

```ts
p.allow({
	id: "holder-read",
	description: "The claimed holder reads the profile",
	principal: p.anyone(),
	target: p.read(scopes.global),
	where: ({ state, subject }) => p.and(
		p.exists(subject.address),
		p.ne(state.ownerAddress, null),
		p.eq(state.ownerAddress, subject.address),
	),
});
```

Before claim, this grant allows neither an anonymous caller nor an unrelated signed-in user. After a verified claim by Alice, it matches Alice. Only an authorized service operation may set or change `ownerAddress`; allowing a holder to edit that field would change who the relationship authorizes.

`exists(null)` is true in the current evaluator because null is a present value. The explicit non-null check is intentional. Both address fields must use the same canonical representation because condition equality is case-sensitive, unlike address-principal matching.

An application can instead add fixed address grants after claim. Those grants do not follow later owner-field changes automatically; reassignment must update them explicitly. A newly created administrator profile must also have its final account type before publication, avoiding temporary staff access through an initial ordinary-user type.

## 3. Company members can read their own invoices

```ts
p.allow({
	id: "company-read",
	description: "Members of the verified company read the invoice",
	principal: bindings.companyMembers,
	target: p.read(scopes.global),
});
```

The host resolves `companyMembers` from the authorized company relationship, not a client-supplied group ID. A member of Company A cannot substitute Company B's group. Removing Alice from the referenced group removes this allow when the updated group state participates in the decision. Group membership is currently evaluated on the group's main branch.

Changing an invoice's `companyId` does not retarget an already resolved group principal. A transfer workflow must authorize the move and update the policy. It should remove old access before granting new access and handle partial failures; initial-auth creation does not make this later multi-document workflow atomic.

An absent allow-list group supplies no access. A different policy can behave dangerously:

| Ordered grants | Group state | Decision for Alice |
| --- | --- | --- |
| Allow anyone, then deny `blockedUsers` | Group contains Alice | Deny |
| Allow anyone, then deny `blockedUsers` | Group is unavailable | Allow: the deny does not match |
| Allow `companyMembers` only | Group is unavailable | Deny: no grant matches |

The compiler diagnoses the group-deny pattern. It does not silently change the existing evaluator. Applications should use positive membership grants for this case.

## 4. A worker can complete only its current processing attempt

Assume `ops.processing.complete` declares `generation: string` and `attempt: number`, and global state records those fields under `processing`, with a status enum containing `PROCESSING`.

```ts
p.allow({
	id: "worker-read",
	description: "Worker reads its assigned document",
	principal: bindings.worker,
	target: p.read(scopes.global),
});
p.allow({
	id: "worker-complete",
	description: "Complete the current processing attempt",
	principal: bindings.worker,
	target: p.execute(ops.processing.complete),
	where: ({ state, input }) => p.and(
		p.eq(state.status, "PROCESSING"),
		p.eq(input.generation, state.processing.generation),
		p.eq(input.attempt, state.processing.attempt),
	),
});
```

A delayed response from generation G1 is denied after the document moves to G2. A matching worker in G2 may proceed, subject to reducer validation. An ordinary user cannot impersonate the worker by setting a `requestedBy` field; principal matching uses verified identity.

The separate read grant matters. A read has no action input, so the generation condition cannot supply implied read access. Staff review operations need their own grants. If an endpoint executes as a privileged service, it must authorize the original caller before dispatching.

## 5. Input defaults and negation are not authorization defaults

Suppose an operation's input descriptor supplies a reducer default for `confirmed`. Auth evaluates the recorded action input; a missing field cannot be treated as already defaulted merely because the reducer later supplies it.

| Condition on a missing `action.input.confirmed` | Result |
| --- | --- |
| `eq(confirmed, true)` | False |
| `not(eq(confirmed, false))` | True |
| `and(exists(confirmed), eq(confirmed, true))` | False |

Use an explicit positive predicate for a required authorization fact. The typed input reference retains possible absence. Similarly, an amount represented as a string uses lexical ordering in auth v1: `"100" < "20"` is true. Numeric business limits must use an appropriate numeric representation or domain validation, not an assumed coercion.

## 6. A partially authorized client must not receive hidden snapshot data

Consider initial global state containing a public title and initial local state containing a private draft. A client may read global but not local. Filtering top-level `state.local` is insufficient if history still includes `UPGRADE_DOCUMENT.input.initialState.local`.

Under this contract, a projected query may return authorized global state. Raw history, export, and bootstrap sync must withhold a signed snapshot containing the private local state. They must not edit the signed payload to conceal it. Partial-scope bootstrap replication needs another verifiable representation and is outside this version.

The acceptance fixture must search the serialized response for the private value. Checking only the list of transmitted scope names misses this case.

## 7. Retries, copying, and upgrades preserve intent

A service creates an invoice and loses the response. Retrying the same requester-scoped idempotency key returns the original document and receipt. Reusing the key with a different company or policy fails. A failed parent attachment can be retried without initializing auth again.

If the service stops after committing the invoice but before its read view is updated, a retry recovers that projection before resolving `readable`. It does not create a second invoice or repeat creation notifications. If sync delivers a valid bootstrap together with a following operation that cannot be processed, the invoice still becomes available with its initial policy. The failing following scope rolls back and remains pending for a later load; the receipt contains only operations actually committed.

A full duplicate preserves the source's ordered grants, including authorized changes made since genesis. It records new creation evidence and does not make the copier an administrator. Without access to every copied scope, a full duplicate fails; an authorized partial-data import is a fresh creation with its own defaults.

If that instance is later purged, its stored creation intent and pending sync fragments must lose their initial-state payloads too. Retrying the original creation request or delivering a delayed fragment must report the purged identity rather than restore it. A genuinely new instance needs a new creation intent and identity.

An upgrade from model V1 to V2 does not reinstall auth. If V2 adds an operation, existing explicit lists do not authorize it. An `allOperations` grant deliberately includes it. Renaming an operation can invalidate old grants' intended permissions; model and policy migrations must account for the actual persisted action names.

## 8. Required compile-time failures and runtime checks

These API expressions must fail without casts. For the mixed-scope case, assume `ui.setDraft` is a declared local operation in the selected modules:

```ts
p.execute("SET_TITLE");                         // Requires an operation reference.
p.execute(ops.notes.setTtile);                   // Not a declared operation.
p.read(scopes.secret);                          // Not a declared scope.
p.executeMany([]);                              // Requires at least one operation.
p.executeMany([ops.notes.setTitle, ops.ui.setDraft]); // Global/local scope mismatch.
```

Assume `ops.review.setStatus` declares `status: "DRAFT" | "PUBLISHED"`; the worker operation still declares its numeric attempt:

```ts
p.allow({
	id: "bad-status", description: "Invalid example",
	principal: bindings.worker, target: p.execute(ops.review.setStatus),
	where: ({ input }) => p.eq(input.status, "DRAFFT"),
});
p.allow({
	id: "bad-number", description: "Invalid example",
	principal: bindings.worker, target: p.execute(ops.processing.complete),
	where: ({ input }) => p.eq(input.attempt, true),
});
p.allow({
	id: "bad-read", description: "Invalid example",
	principal: bindings.worker, target: p.read(scopes.global),
	where: ({ input }) => p.exists(input.generation), // Reads expose no input.
});
```

Returning `state.locked === false` instead of a condition token must fail. Multi-operation conditions also expose no input, even when the current operation inputs happen to overlap.

Runtime tests remain required for a reference captured from another same-shaped model, a binding from another policy, unsafe casts, unknown provider keys, and an unauthorized but well-formed group ID. TypeScript cannot certify those trust relationships.

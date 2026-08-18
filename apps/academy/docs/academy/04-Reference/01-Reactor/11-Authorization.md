---
toc_max_heading_level: 3
---

# Authorization

The reactor decides who may do what from a policy stored on the document itself, in its `auth` scope. The policy is a list of **grants** that the reducer folds like any other state, so it syncs, replays and converges the same way document content does. Reducers contain no authorization code.

This is separate from the host-side permission tables described in [Reactor API Authorization](/academy/Build/BuildingUserExperiences/Authorization/Authorization), which decide which addresses a host lets near a drive. The two answer different questions and neither substitutes for the other.

:::info[Behind feature flags]
Every flag below defaults to off, and enforcement protects nothing that already exists: a document that never emitted `INITIALIZE_AUTH` carries an uninitialized policy, which allows everything. Enforcement bites only on documents that have a policy.
:::

## Feature flags

Enforcement is staged. Each flag requires the one above it, and a reactor refuses to start on a set that skips one, because a partially enforcing reactor applies less than the operator asked for.

| Flag                | Env var                      | What it turns on                                                    |
| ------------------- | ---------------------------- | ------------------------------------------------------------------- |
| `documentDecisions` | `REACTOR_DOCUMENT_DECISIONS` | Decide writes from the document stream rather than the meta cache    |
| `authEnforcement`   | `REACTOR_AUTH_ENFORCEMENT`   | Enforce the policy at admission, replay and read                     |
| `authGroups`        | `REACTOR_AUTH_GROUPS`        | Let `{ group }` principals match against a roster document           |
| `authConditions`    | `REACTOR_AUTH_CONDITIONS`    | Evaluate `where` clauses and `{ match }` principals                  |

```typescript
new ReactorBuilder().withExecutorConfig({
  featureFlags: {
    documentDecisions: true,
    authEnforcement: true,
  },
});
```

The flags govern **enforcement only**. The data model is always live, so a grant written on a reactor with the flags off is stored and syncs; it is not enforced there.

:::warning[Flip flags per fleet, never per node]
A replay decision is a consensus outcome. Two replicas of the same document running different flags compute different verdicts for the same operation and diverge permanently. Move every node that shares a document together.
:::

## The policy

An uninitialized policy leaves the document open. `INITIALIZE_AUTH` installs the first grant list; after that the default is deny and only a grant can permit anything.

Four actions write the `auth` scope:

| Action             | Effect                                            |
| ------------------ | ------------------------------------------------- |
| `INITIALIZE_AUTH`  | Installs the initial policy. Genesis only         |
| `SET_GRANT`        | Adds a grant, or replaces the one with that `id`  |
| `REMOVE_GRANT`     | Removes a grant by `id`                           |
| `MOVE_GRANT`       | Reorders a grant, which can change the outcome    |

`UNDO`, `REDO` and `PRUNE` are refused on the `auth` scope.

### Grants

```typescript
type Grant = {
  id: string;
  description: string;
  effect: "allow" | "deny";
  principal:
    | { anyone: true }
    | { address: string }
    | { group: string } // a powerhouse/reactor-group document id
    | { match: Condition };
  capability:
    | { can: "read"; scope?: string }
    | { can: "execute"; scope?: string; operation?: string[] };
  where?: Condition;
};
```

`scope` accepts `"*"` for every scope. Omitting `operation` covers every action in the scope.

A `{ group }` principal names a roster document (`powerhouse/reactor-group`) and resolves live, so hiring and offboarding are single membership operations on the roster rather than edits to every policy that trusts it. A `where` clause reads `subject.*`, `doc.<scope>.*` and `action.input.*`, which is how a grant can depend on the values of the operation it gates.

### How a decision is made

Grants are walked in list order and **the last applicable one wins**. A grant applies when its capability covers the request and its principal matches the subject. If none applies, the request is denied.

Three rules are easy to miss:

- **An allow on `execute` confers `read` of that scope.** A grant of `{ can: "execute", scope: "*" }` therefore publishes every domain scope to whoever it names. Grant administration on `scope: "auth"` rather than `"*"`.
- **A grant that cannot apply is skipped, not honoured.** Below `authGroups` a `{ group }` principal never matches; below `authConditions` a `where` clause never holds. Both fail closed, so a policy relying on a conditional *deny* is weaker than it reads on a reactor that cannot evaluate it.
- **The creator keeps the auth scope.** The key that signed the document's header may always execute in `scope: "auth"`, so a policy cannot lock its own owner out. On an unsigned document there is no creator, and validation instead refuses any policy that would leave nobody able to administer it.

## Scopes every holder reads

The `auth` and `document` scopes are readable by anyone holding the document, whatever the grants say. A replica that could not read the policy would sync a document, see an uninitialized policy, and allow everything on it. Grants gate the domain scopes.

Read filtering happens on the [`IReactorClient`](/academy/Reference/Reactor/ReactorClient), not inside the reactor, so `reactor.get()` and `client.get()` return different documents in the same process. A withheld scope is absent from `state` rather than present and empty.

## Refusal reasons

A refused operation is stored with a `deniedReason` drawn from a closed set. Re-evaluation compares these strings, so they are consensus data and carry no grant id, subject or timestamp.

| Reason                              | Meaning                                        |
| ----------------------------------- | ---------------------------------------------- |
| `no grant permits this operation`   | Default deny; nothing applied                  |
| `denied by grant`                   | The last applicable grant had `effect: "deny"` |
| `document deleted`                  | The document was deleted at this position      |
| `auth policy version unsupported`   | The policy declares a version this build cannot evaluate |

## Limits

A version-1 policy holds at most 100 grants. A condition holds at most 100 nodes and nests at most 10 deep. These bound the work a single decision can cost.

## Asking before you write

[`evaluateActions`](/academy/Reference/Reactor/ReactorClient) predicts what the policy would decide about candidate operations without submitting them, so a control can be disabled rather than offered and refused. In React, [`useCanExecute`](/academy/Reference/EditorsUI/ReactHooks) wraps it.

## Related

- [IReactorClient](/academy/Reference/Reactor/ReactorClient) — `evaluateActions` and the read methods the gate filters.
- [React Hooks](/academy/Reference/EditorsUI/ReactHooks) — `useCanExecute`.
- [Signing](/academy/Build/BuildingUserExperiences/Authorization/Signing) — where a subject's address and app key come from.
- [Cookbook](/academy/Lookup/Cookbook) — runnable recipes: `document-acl`, `scoped-reads`, `group-principals`, `revocation-race`.

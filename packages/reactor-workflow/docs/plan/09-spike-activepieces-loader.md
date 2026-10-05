# Spike S6a — Activepieces Path B Loader

**Status:** Spike instruction. Self-contained — an implementing agent needs this document only;
the source documents are cited for background, not required reading.
**Derived from:** [`06-ap-red-compatible-architecture.md`](./06-ap-red-compatible-architecture.md)
§2.4/§6 (the Path B thesis and spike definition), [`08-workflow-automation-spec.md`](./08-workflow-automation-spec.md)
§6.3 (the loading pipeline this spike de-risks), [`05-sota-research.md`](./05-sota-research.md) §5.
**Timebox:** 1 day for the core spike; +0.5 day for the optional S6b-lite extension.

---

## 1. What this spike proves (and what it deliberately is not)

The workflow-automation spec (doc 08) bets its connector story on one claim:

> A published, unmodified Activepieces piece bundle can be loaded by `import()`, duck-typed, and
> executed under a context object **we** construct — because a piece's `run(ctx)` takes its whole
> world as a parameter and imports nothing ambiently.

This spike tests that claim end-to-end with real published artifacts and a real network call.
**The success criterion is a decision, not a component**: one of

- **PASS** — Path B works; doc 08 §6.3 stands as designed.
- **PASS WITH CAVEATS** — works, but findings X/Y change the adapter design (record them).
- **FAIL** — the bundle format / module system / context coupling breaks the approach; doc 08's
  connector contract needs rework before Phase 1.

This is **throwaway code**. It will not be merged into any Powerhouse package. Write it fast,
keep it readable, and put every finding in the notes file (§8).

### Safety measures deliberately skipped (approved for this spike)

These are host-side wrappings that are orthogonal to what is being measured. Skipping them is
sanctioned for the spike **only**:

| Skipped | Production design (for reference) |
|---|---|
| Worker/process isolation — run the piece **in-process** in a plain Node script | doc 08 §7.5 |
| DNS/SSRF egress guard | doc 08 §10 |
| Secret redaction / dual resolution / journaling | doc 08 §10 |
| Delivery-authority tokens, queue, retries | doc 08 §7.6 |
| Attester identity / reactor writes | doc 08 §11 |
| Rate limiting, caching | doc 07 §6 |

Consequence: **only run the specific pieces named below, with credentials you control (or none).**
Do not point the spike at arbitrary bundles.

### Not in scope

- Path A (building pieces from the Activepieces monorepo source) — different spike, different day.
- Any Powerhouse monorepo code. This spike requires **zero Powerhouse checkout**.
- Triggers (`poll`/`webhook`). Actions only. (Trigger lifecycle is a follow-up spike if S6a passes.)
- The full props channel. S6b-lite (§6) only probes that the functions are invocable.

---

## 2. Environment and setup

- **Node 20+** (22 preferred), ESM project (`"type": "module"`).
- macOS or Linux; network access to `registry.npmjs.org`.
- Create the project in a scratch directory **outside** this docs folder, e.g.
  `~/spikes/ap-loader-spike/`:

```
ap-loader-spike/
  package.json          { "type": "module", "private": true }
  bundles/              downloaded piece tarballs, extracted
  src/
    fetch-bundle.ts     (or .mjs — plain JS is fine for a spike)
    load-piece.ts       duck-typed loader
    mock-context.ts     the hand-written ActionContext
    run-action.ts       CLI: node src/run-action.js <piece-dir> <action-name> [props-json]
    inspect.ts          CLI: dump a loaded piece's metadata/actions/props
  notes/
    spike-notes.md      the deliverable (§8)
```

TypeScript is optional — `tsx` or plain `.mjs` both fine. No test framework needed; the scripts
*are* the test.

### 2.1 Fetching bundles

Published piece tarballs on npm are **self-contained build artifacts** (since Activepieces v0.86.0):
the `@activepieces/*` framework and third-party deps are inlined, `package.json` typically carries
**no `dependencies`, no `license`, no `repository` field**. That is expected — do not treat it as a
broken download. Do **not** `npm install` them as dependencies of the spike project; fetch and
extract, then `import()` by path:

```bash
mkdir -p bundles && cd bundles
npm pack @activepieces/piece-http        # writes activepieces-piece-http-<ver>.tgz
tar -xzf activepieces-piece-http-*.tgz && mv package piece-http
npm pack @activepieces/piece-discord
tar -xzf activepieces-piece-discord-*.tgz && mv package piece-discord
```

Record the exact versions fetched in the notes. Known-published reference versions from the
research (2026-08-31): `piece-slack@0.17.9`, `piece-gmail@0.13.0`, `piece-discord@0.5.7` — fetch
whatever `latest` resolves to and record it.

**First inspection step (do this before writing any code):** open each bundle's `package.json`
and note `main` / `module` / `exports` / `type`, and whether the JS is minified. This determines
the import strategy (§3) and is itself a spike finding.

### 2.2 Target pieces, in order

| Piece | Auth needed | Why chosen |
|---|---|---|
| `@activepieces/piece-http` | none | Proves the mechanics with zero credentials. Action: an HTTP GET against `https://httpbin.org/get` or any echo endpoint |
| `@activepieces/piece-discord` | a Discord **webhook URL** only (no OAuth, no bot token needed for the webhook-send action) | Proves a real integration; it is the briefing's demo target |

If the operator running the spike has no Discord webhook URL, `piece-http` alone is sufficient for
the PASS/FAIL decision; note the omission.

---

## 3. The loader (`load-piece.ts`)

Loading is duck-typed exactly as Activepieces' own child process does it — find the export whose
constructor is named `Piece`:

```ts
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

export async function loadPiece(entryPath: string): Promise<any> {
  let mod: Record<string, unknown>;
  try {
    mod = await import(pathToFileURL(entryPath).href);          // ESM first
  } catch {
    const require = createRequire(import.meta.url);              // CJS fallback
    mod = require(entryPath);
  }
  // unwrap default / interop shapes before scanning
  const candidates = [
    ...Object.values(mod),
    ...(mod.default ? Object.values(mod.default as object) : []),
    mod.default,
  ];
  const piece = candidates.find(
    (e: any) => e && typeof e === "object" && e.constructor?.name === "Piece",
  );
  if (!piece) throw new Error(`No Piece export found in ${entryPath}. Exports: ${Object.keys(mod)}`);
  return piece;
}
```

Resolve `entryPath` from the bundle's `package.json` (`main`, or `exports["."]`); if both are
missing, look for `src/index.js` / `index.js` / `main.js` in the extracted dir and record which.

**Known risks to check and record:**

1. **Minification.** `constructor.name === "Piece"` breaks if the bundle minifies class names.
   Their own loader relies on this, so it is *probably* preserved — verify and record. If it fails,
   fall back to structural duck-typing: an object with `displayName`, and `actions`/`triggers`
   (as records or via `getAction`/`getTrigger` methods). Note which check worked.
2. **Module system.** The bundle may be CJS, ESM, or dual. Record what each target piece actually is.
3. **Dual class identity.** The bundle inlines its own copy of the framework, so `instanceof`
   against anything we import is meaningless. Nothing in the spike may use `instanceof` —
   this rule carries into the real adapter (doc 08 §4.2).

### 3.1 Introspection (`inspect.ts`)

Before executing anything, dump what the piece exposes. The framework's `Piece` class (MIT source:
`activepieces/activepieces` → `packages/pieces/framework/src/lib/piece.ts`; consult it on GitHub if
shapes surprise you) exposes, approximately:

- `displayName`, `description`, `auth` (an auth property object or `undefined`), `minimumSupportedRelease`
- actions/triggers either as record properties or via `getAction(name)` / `getTrigger(name)` /
  `actions()` / `triggers()` — **introspect rather than assume**; log
  `Object.getOwnPropertyNames(Object.getPrototypeOf(piece))` and go from there
- `metadata()` — a serialisable descriptor, if present on this version

For each action, dump: `name`, `displayName`, `props` (each prop's `type`, `required`,
`displayName`), and whether `run` is a function. **This output is the Tier-1 conformance check in
miniature** (doc 08 §13) — paste it into the notes for both pieces.

---

## 4. The mock context (`mock-context.ts`)

This is the heart of the spike. The full surface a piece can touch at runtime, enumerated by
Activepieces' own MIT test helper `createMockActionContext`
(`packages/pieces/framework/src/lib/test/index.ts` — consult on GitHub for exact field shapes), is:

```
executionType, auth, propsValue,
store { put, get, delete },
connections { get },
tags { add },
server { apiUrl, publicUrl, token },
files { write },
output { update },
agent { tools },
run { id, stop, pause, respond },
project { id, externalId },
flows { list, current },
step { name },
generateResumeUrl
```

Build it by hand. Guidance per member:

```ts
export function makeMockContext({ auth, propsValue }: { auth?: unknown; propsValue: Record<string, unknown> }) {
  const store = new Map<string, unknown>();
  const log = (label: string) => (...args: unknown[]) =>
    console.log(`[ctx.${label}]`, JSON.stringify(args).slice(0, 500));

  return {
    executionType: "BEGIN",                    // check the enum value in the framework source; may be 'BEGIN' | 'RESUME'
    auth,                                      // whatever the piece's auth kind expects (see §5)
    propsValue,                                // resolved props — plain values, no {{templates}}
    store: {
      put: async (k: string, v: unknown) => { store.set(k, v); return v; },
      get: async (k: string) => store.get(k) ?? null,
      delete: async (k: string) => { store.delete(k); },
    },
    connections: { get: async (key: string) => { log("connections.get")(key); return null; } },
    tags: { add: async (t: unknown) => log("tags.add")(t) },
    server: { apiUrl: "http://localhost:0/", publicUrl: "http://localhost:0/", token: "spike-token" },
    files: { write: async (f: unknown) => { log("files.write")(f); return "mock://file-ref"; } },
    output: { update: async (o: unknown) => log("output.update")(o) },
    agent: { tools: [] },
    run: {
      id: "spike-run-1",
      stop: (req?: unknown) => log("run.stop")(req),
      pause: (req?: unknown) => log("run.pause")(req),
      respond: (req?: unknown) => log("run.respond")(req),
    },
    project: { id: "spike-project", externalId: async () => "spike-project" },
    flows: { list: async () => ({ data: [] }), current: { id: "spike-flow", version: { id: "v1" } } },
    step: { name: "spike-step" },
    generateResumeUrl: (params?: unknown) => `http://localhost:0/resume?x=${encodeURIComponent(JSON.stringify(params ?? {}))}`,
  };
}
```

Rules:

- **Every member logs when touched.** The list of members each piece actually calls is a primary
  spike output — it validates (or corrects) the usage table in doc 08 §4.2.
- Where the exact shape is unknown, start with the guess above, run, and let the failure tell you
  the real shape; fix and **record the correction**. Cross-check against the mock in the framework
  source when stuck.
- If a piece calls something not in this list, that is a **finding** (an undocumented context
  member) — record it prominently.

---

## 5. Executing an action (`run-action.ts`)

```ts
const piece = await loadPiece(entry);
const action = piece.getAction?.(actionName) ?? piece.actions?.[actionName];  // introspect in §3.1 first
const ctx = makeMockContext({ auth, propsValue });
const output = await action.run(ctx);
console.log("OUTPUT:", JSON.stringify(output, null, 2));
```

### 5.1 Test 1 — `piece-http`, no auth

From the §3.1 dump, find the request action (historically named `send_request` /
"Send HTTP request") and read its actual prop names. Expected shape, to be corrected against the
dump:

```jsonc
{
  "method": "GET",
  "url": "https://httpbin.org/get",
  "headers": {},
  "queryParams": { "spike": "s6a" },
  "body": undefined,
  "timeout": 10000
  // possibly: failsafe / use_proxy / response type flags — take defaults from the dump
}
```

**Pass:** the action returns a response object containing the echo of `spike=s6a`, having gone
through the bundle's inlined `httpClient` with our context. Record the output shape.

### 5.2 Test 2 — `piece-discord`, webhook auth

The webhook-send action authenticates with a webhook URL. Determine from the §3.1 dump whether the
URL lives in `ctx.auth` or in a prop; Discord's piece historically uses `auth` as the webhook URL
for `send_message_webhook`. Supply the URL via env var (`DISCORD_WEBHOOK_URL`) — never hardcode it,
even in a spike.

**Pass:** a message appears in the Discord channel; the action resolves without touching any
context member we could not service.

### 5.3 Error-path probe (15 minutes, worth it)

Run the http action against a URL that 404s and one that times out. Record **what the piece throws**
(error class name, shape, message). This feeds the `ctx.failure.classify` design (doc 08 §4.3) —
we need to know what raw piece errors look like to classify them.

---

## 6. Optional extension — S6b-lite: poke the props channel

Doc 06 §2.5 identifies design-time property resolution as **the blocker** (432/728 pieces). Full
design is Phase 1/6 work; this spike only answers: *is `Property.Dropdown.options()` invocable
from outside their engine at all?*

1. Pick a piece with a dropdown. `piece-discord`'s bot actions have channel dropdowns (needs a bot
   token); if no credential is at hand, **any** piece's dropdown still answers the mechanical half.
2. From the loaded piece, find an action prop where `prop.type === "DROPDOWN"` (or structurally:
   `typeof prop.options === "function"`).
3. Call it: `await prop.options({ auth, ...otherRefresherValues }, propsCtx)` where `propsCtx` is a
   minimal `PropertyContext`-ish object (doc 06 §2.5 says it carries roughly:
   a `searchValue`, a `connections.get`, and little else — start minimal, let failures guide).
4. **Pass:** an options array (or a well-formed `DropdownState { disabled, placeholder, options }`)
   comes back. **Partial pass (still valuable):** the function is invocable and fails only on
   missing/invalid auth — that proves the channel is mechanically possible, which is the question.

Record the exact signature that worked.

---

## 7. Success criteria — the decision table

Fill this in; it is the spike's output:

| # | Question | Answer |
|---|---|---|
| 1 | Does `import()` + duck-typing load a published bundle? (ESM/CJS? minified? which duck-type check worked?) | |
| 2 | Does the descriptor enumerate cleanly (actions, props, auth) for both pieces? | |
| 3 | Does a no-auth action execute end-to-end under the mock context? | |
| 4 | Does a credentialed action (Discord webhook) execute? | |
| 5 | Which context members were actually touched, per piece? Any members outside the documented surface? | |
| 6 | What do raw piece errors look like? | |
| 7 | (S6b-lite) Is `options()` invocable out-of-band? With what signature? | |
| 8 | **Decision: PASS / PASS WITH CAVEATS / FAIL** — and what changes in doc 08 §6.3 / §4.2 as a result | |

Anything that required deviating from this document (wrong prop names, different context shapes,
loader fallbacks) is a **correction to the specs** and belongs in the notes, not just in the code.

---

## 8. Deliverable

`notes/spike-notes.md` in the spike project, and a copy placed in this docs folder as
`10-spike-notes-s6a.md`, containing:

1. Exact piece names + versions fetched, fetch date, bundle module format, minified or not.
2. The §3.1 introspection dumps (trimmed to the interesting parts).
3. The filled-in decision table (§7).
4. Corrections to docs 06/08 discovered along the way.
5. The prompt-for-next-step: if PASS, the recommended shape of `descriptor.ts` + `context/action.ts`
   for the real `@powerhousedao/connector-activepieces` package (doc 06 §2.8); if FAIL, what to
   revisit.

The spike code itself stays in the scratch directory; link its path from the notes. Do not publish
or reuse the mock context as production code — the real context is built in Phase 4 behind the
worker boundary with all the safety measures this spike skipped.

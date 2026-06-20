# /doc-capture

Refresh (or write) the UI-walkthrough half of an academy doc from a **live capture** of the running product, driven through Playwright. Pairs with `/doc-review` (which checks API drift against source): use `/doc-review` for code-backed sections, `/doc-capture` for sections that document a browser UI.

**Usage:** `/doc-capture <section-id | doc-path> [live-url]`

- `section-id` — an id from `test/ph-lora/ph-lora-mapping.json` (resolves to `docPath`). Or pass a `doc-path` directly.
- `live-url` — where the UI runs (staging, a cloud instance, or `localhost`). Ask the user if not given.

## When to use

- A doc describes screens, panes, buttons, or a click-through flow that has drifted from the live product.
- You are writing a new tutorial for a UI that exists but isn't documented yet.
- Do **not** use this for pure API/reference sections — that's `/doc-review`.

## The core rule

Every UI instruction in the doc must trace to something you actually observed in a capture. **Do not invent UI.** If a screen or control isn't in a snapshot, either capture it or flag the gap — never guess a label, a path, or a behaviour. A doc is ~60% conceptual (sourced from repo code + existing prose) and ~40% UI walkthrough (capturable). Capture refreshes only the UI half; preserve correct conceptual sections.

---

## Steps

**1. Scope the capture**

Resolve the target doc (via `ph-lora-mapping.json` or the given path) and read it. Mark each section as **conceptual** (keep unless source contradicts) or **UI walkthrough** (refresh from capture). List the screens/flows you need to observe — that list is your capture plan.

**2. Set up the browser bridge**

You drive a real browser over the Chrome DevTools Protocol (CDP) so the user's existing login/session is reused. The recipe below is for Brave on macOS with wallet (MetaMask/Renown) auth — adapt the binary/profile path per browser and OS.

Wallet sign-in needs the user's real profile (cookies + wallet vault), but Chromium blocks remote-debugging on the live default profile. Work on a **copy**:

```bash
# 1. Quit the real browser fully first (verify: pgrep -fl "Brave Browser" → none)
# 2. Copy the profile (carries cookies + wallet vault), skipping caches
rsync -a --delete \
  --exclude 'Cache' --exclude 'Code Cache' --exclude 'GPUCache' --exclude 'Singleton*' \
  "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/" /tmp/<area>-capture-brave/
# 3. Launch the copy with remote debugging
rm -f /tmp/<area>-capture-brave/Singleton*
"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
  --remote-debugging-port=9222 --user-data-dir=/tmp/<area>-capture-brave \
  --no-first-run --no-default-browser-check about:blank &
# 4. Verify CDP is up
curl -s http://localhost:9222/json/version
```

Ask the user to unlock the wallet and confirm they're logged in to the `live-url` in the debug browser.

**3. Connect Playwright**

Register the Playwright MCP against the CDP endpoint, pointing its output at a capture dir:

```bash
claude mcp add playwright -- npx @playwright/mcp@latest \
  --cdp-endpoint http://localhost:9222 --output-dir /tmp/<area>-capture
```

`browser_*` tool schemas only load at Claude Code **startup** — after `claude mcp add` you must reload before they're usable. If the first `browser_navigate` after a browser relaunch errors with "Target page… has been closed", that's a stale handle — call it a second time and it reconnects.

**4. Assisted capture loop (user co-pilots)**

The user walks the canonical happy-path in their browser; you observe. Agree on a signal — the user does a step and says **"snap"**. On each "snap":

1. `browser_snapshot` (ARIA tree) — the source of truth for labels, structure, and state. For large pages, save to a file: pass an **absolute** `filename` like `/tmp/<area>-capture/snap-NN.md`. ⚠️ The snapshot `filename` is relative to the **current working directory** (repo root), not the MCP output dir — an absolute `/tmp/...` path keeps it out of the repo. (Screenshots *do* honour `--output-dir`.)
2. Note the URL, breadcrumb, and any state that changed (status chips, enabled/disabled controls, running/idle).
3. `browser_take_screenshot` for hero candidates. Name them `hero-NN-<slug>.png` for likely keepers, `cand-NN-<slug>.png` for extras, `pii-NN-<slug>.png` for shots with sensitive data. Screenshots can race iframe/async re-renders — if the tab focus or content changed between snapshot and screenshot, re-take.
4. Keep a running drift tally (live UI vs. current doc) and persist it to memory as you go, so a long session survives a context cutoff.

Prefer the ARIA snapshot over the screenshot for facts: exact button text, field names, tool-call names, status. Screenshots are for the reader, not for you.

**5. Reconcile against the doc**

Build a table: every UI claim in the doc vs. what you observed. Categories: `changed` (label/path/behaviour differs), `missing` (live UI not in doc), `gone` (doc describes UI that no longer exists), `confirmed`. Each row cites a capture step. Flag anything you could not observe rather than asserting it.

**6. Curate and place screenshots**

Pick the fewest shots that carry the flow (aim ≤ 5–6 heroes: entry, the main view, a representative detail, the payoff screen). Then:

- **Scrub PII.** Staging often shows real data. Confirm with the user what's OK to publish (an ENS handle may be fine; wallet addresses, emails, and DIDs usually are not). Crop or skip shots with sensitive data — `sips -c <h> <w> in.png --out out.png` crops centred if no other tool is available.
- Copy keepers into the doc's image folder with clean names: `apps/academy/<docPath>/images/<area>/<name>.png`.
- Embed with the academy convention (matches sibling docs):

```jsx
<figure className="image-container">
  <img
    src={require("./images/<area>/<name>.png").default}
    alt="<what the screen shows>"
  />
  <figcaption><one sentence; state the fact, don't sell></figcaption>
</figure>
```

**7. Update the doc**

Rewrite the UI sections to match the captures. Follow `apps/academy/STYLE.md`: second person, imperative steps, name the real labels/paths/tool names, be honest about limits (`:::warning` for dev-vs-prod caveats), no marketing words, ≤ 1 em-dash per paragraph. Preserve conceptual sections unless a capture contradicts them. Verify every embedded image path resolves and the repo root has no stray `snap-*.md` / `*.png`.

**8. Clean up**

The profile copy under `/tmp/<area>-capture-brave` holds the user's real cookies and wallet vault — tell the user to delete it when done. Leave the registered Playwright MCP and the `/tmp/<area>-capture` working files unless the user wants them removed.

---

## Gotchas (learned the hard way)

| Symptom | Cause / fix |
| --- | --- |
| `browser_navigate` → "Target page… has been closed" | Stale CDP handle after a browser relaunch. Retry once. |
| Snapshot file lands in the repo root | `filename` is relative to CWD. Pass an absolute `/tmp/...` path. |
| Screenshot shows the wrong/blank screen | Focus or an iframe changed between snapshot and screenshot. Re-select the tab and re-take. |
| Login gate where you expected the app | The app may live on a different route/subdomain than the marketing site, behind a separate session. Have the user navigate to the real app; capture from there. |
| New `browser_*` tools "don't exist" | Schemas load only at startup. Reload after `claude mcp add`. |

## Output

A short report: the reconciliation table (changed / missing / gone / confirmed, each citing a capture), the list of screenshots placed (and any skipped for PII), the doc sections rewritten, and any gaps you could not capture. Then the updated doc + images, with the repo clean of capture scratch files.

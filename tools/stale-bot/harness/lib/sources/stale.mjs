/**
 * The stale-issue source.
 *
 * The omp-native port of the better-stale-bot workflow: once a day (the
 * sweep gate), it takes a snapshot of the target repo's open issues and
 * splits them into two buckets.
 *
 *   Bucket B — not yet stale: no `Stale` label, no exempt label, and no
 *     activity for at least `daysBeforeStale` whole days. Ranked by an
 *     engagement score — the quieter the thread, the higher the priority —
 *     and the selected ones get a contextual summary comment plus the
 *     `Stale` label.
 *
 *   Bucket A — already stale: carries the `Stale` label. The reference
 *     point is when the label was *last applied* (the most recent timeline
 *     `labeled` event; the actor may be a human — a maintainer who adds
 *     `Stale` manually still sets the clock). After `daysBeforeClose` whole
 *     days without qualifying non-bot activity strictly after that moment,
 *     the issue is closed (`state_reason: not_planned`) with a single
 *     explanatory comment. Qualifying non-bot activity after the application
 *     re-activates the issue: the label comes off, silently.
 *
 * Division of labour, kept deliberate:
 *
 *   - Selection, ranking, caps, and every write to GitHub happen here, in
 *     deterministic code. The LLM never chooses an issue and never posts.
 *   - The `stale-bot` agent round drafts the words — the stale comment or
 *     the closing message — and may veto with a `skip` verdict when the
 *     decision is factually wrong (e.g. a linked PR that just merged).
 *     `unstale` needs no words, so it skips the round entirely.
 *
 * Writes are idempotent: every action is re-checked against the issue's
 * current state before it is made, so an interrupted sweep re-run is a
 * no-op on anything already handled. With `dryRun: true` the whole sweep
 * logs its decisions and drafts its comments and posts nothing.
 *
 * `selectNext` is async (the snapshot is a set of API fetches); the loop
 * awaits it. The other sources return plain values, which `await` passes
 * through untouched.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { gh as realGh, ghJson as realGhJson } from "../gh.mjs";
import { loadAgentDef } from "../agentdef.mjs";
import {
  runAgent as runAgentProcess,
  extractLastJson,
} from "../runner-process.mjs";
import { expandHome, nowIso } from "../state.mjs";
import { repoRoot } from "../paths.mjs";

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const SWEEP_KEEP = 10; // sweep summaries retained in the state file

/** Sensible defaults; config.stale overrides key by key. */
const DEFAULTS = {
  repo: null,
  staleLabel: "Stale",
  exemptLabels: [],
  daysBeforeStale: 60,
  daysBeforeClose: 7,
  botLogins: [],
  maxStalePerSweep: 30,
  maxClosePerSweep: 30,
  maxUnstalePerSweep: 30,
  sweepEveryHours: 24,
  coolDays: 30,
  roundTimeoutMin: 10,
  model: null,
  repoPath: null,
  dryRun: false,
};

// ---------------------------------------------------------------------------
// helpers (exported for tests)

/**
 * An actor counts as a bot when its login ends in `[bot]` (GitHub apps),
 * when it is listed in `botLogins`, or when it is the account this harness
 * itself posts as — the bot's own stale/closing comment must never count
 * as activity that re-activates an issue.
 */
export function isBotLogin(login, botLogins = [], selfLogin = null) {
  if (!login) return true;
  if (login.endsWith("[bot]")) return true;
  if (botLogins.includes(login)) return true;
  if (selfLogin && login === selfLogin) return true;
  return false;
}

/**
 * The reference's engagement formula, terms named so the log can show the
 * substituted arithmetic:
 *
 *   3 × distinct_users               — distinct non-bot commenters
 * + 2 × total_comments_and_reactions — non-bot comments plus issue reactions
 * + 1 × whole_weeks_since_last_updated
 */
export function engagementScore({
  distinctUsers,
  commentsAndReactions,
  weeksSinceUpdate,
}) {
  return (
    3 * distinctUsers +
    2 * commentsAndReactions +
    1 * Math.max(0, weeksSinceUpdate)
  );
}

/**
 * Parse the stale-bot verdict out of a round: the last JSON object in the
 * final message, validated against the contract. Anything else is null —
 * the caller then fails the round without writing.
 */
export function parseStaleVerdict(text) {
  const j = extractLastJson(String(text ?? ""));
  if (!j) return null;
  if (!["stale", "close", "unstale", "skip"].includes(j.action)) return null;

  if (j.action === "skip") {
    // A veto must carry a reason: it becomes the cooling record a human can
    // inspect, and a bare "skip" is not a decision.
    if (typeof j.reason !== "string" || !j.reason.trim()) return null;
    return { action: "skip", reason: j.reason.trim() };
  }

  if (typeof j.language !== "string" || !j.language.trim()) return null;
  if (
    j.action === "stale" &&
    (typeof j.comment !== "string" || !j.comment.trim())
  )
    return null;
  if (
    j.action === "close" &&
    (typeof j.closeBody !== "string" || !j.closeBody.trim())
  )
    return null;

  const str = (v) => (typeof v === "string" ? v.trim() : null);
  return {
    action: j.action,
    language: j.language.trim(),
    issueSummary: str(j.issueSummary),
    activitySummary: str(j.activitySummary),
    resolution: str(j.resolution),
    comment: str(j.comment),
    closeBody: str(j.closeBody),
    reason: str(j.reason),
  };
}

/**
 * The brief handed to the drafter: the decided action, the issue, its
 * non-bot comments, and the writing contract. The drafter reads it and
 * writes words — it has no tools of consequence and no way to act on the
 * issue itself.
 */
export function buildBrief({ task, issue, comments, st }) {
  const plainDays = (n) => `${n} days`;
  const lines = [];
  lines.push(
    `The harness has already decided what happens to GitHub issue #${task.number} in ${st.repo}.`,
    "You only write the words it will post. You cannot change the decision,",
    'except to veto it (action "skip") when it is factually wrong.',
    "",
  );
  if (task.action === "stale") {
    lines.push(
      `Decision: STALE — a summary comment is posted, then the "${task.staleLabel}" label is applied.`,
      `If no qualifying activity follows for ${plainDays(task.daysBeforeClose)}, the issue is closed automatically.`,
      "",
      `Your comment must have, in this order:`,
      `1. Opening — one or two short sentences, first person as the bot: you are marking this issue`,
      `   stale because it has been inactive. Optionally greet the author with @login.`,
      `2. Issue summary — two to four sentences: what the issue is about, what was discussed,`,
      `   and whether it looks resolved or still unresolved from the thread. If it looks resolved`,
      `   but nobody confirmed it, say exactly that — do not thank as if closure were final.`,
      `3. Next steps — ask the author or anyone following to comment if the issue is still`,
      `   relevant. State that without qualifying activity for ${plainDays(task.daysBeforeClose)} (in plain` +
        ` language: "in ${plainDays(task.daysBeforeClose)}"), it will be closed automatically.`,
      `   No vague timing ("soon", "shortly").`,
      `4. Thanks — one short closing line of appreciation.`,
      "",
    );
  } else if (task.action === "close") {
    lines.push(
      `Decision: CLOSE — the issue is closed as "not planned", with your message posted as its`,
      `final comment. The "${task.staleLabel}" label was applied; the close window of`,
      `${plainDays(task.daysBeforeClose)} passed with no qualifying non-bot activity.`,
      "",
      `Your message explains that the stale period expired without activity. Do NOT say the`,
      `issue was fixed, completed, or resolved — stale closure is not a resolution.`,
      "",
    );
  }

  lines.push(`Write in the same language as the issue title below.`, "");
  lines.push(`Issue #${issue.number}: ${issue.title}`);
  const labels = (issue.labels ?? []).map((l) => l.name);
  lines.push(
    `Labels: ${labels.length ? labels.map((l) => `\`${l}\``).join(", ") : "(none)"}`,
  );
  lines.push(`Updated: ${issue.updated_at}`);
  lines.push("");
  lines.push("Body:");
  lines.push("```");
  lines.push(String(issue.body ?? "").slice(0, 4000) || "(no description)");
  lines.push("```");
  lines.push("");
  const shown = comments.slice(-30);
  lines.push(
    `Non-bot comments (${comments.length} total, showing the last ${shown.length}):`,
  );
  if (!shown.length) lines.push("(none)");
  for (const c of shown) {
    lines.push(
      `- ${c.user?.login ?? "?"} ${String(c.created_at).slice(0, 10)}: ${String(c.body ?? "").slice(0, 1500)}`,
    );
  }
  lines.push("");
  lines.push(
    "Rules: empathetic and concise; no emoji unless the thread clearly uses them; do not",
    "contradict yourself (never sound like the issue is fully closed while inviting",
    "discussion); never invent details that are not in the issue or its comments; keep",
    "the text under ~300 words.",
    "",
    'Veto (action "skip") only when the decision is factually wrong — for example a linked',
    "pull request that was just merged, or activity proving the issue is alive. The veto",
    "needs a one-line reason; it is recorded and the issue is left alone for a while.",
    "",
    "End your final message with exactly one JSON line, no code fence:",
    '{"action":"stale|close|unstale|skip","reason":"… (required for skip)","language":"…",',
    '"issueSummary":"…","activitySummary":"…","resolution":"resolved: … | unresolved",',
    '"comment":"… (for stale)","closeBody":"… (for close)"}',
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// processing one decided issue

/**
 * Execute one decided stale action: verify current state (idempotency),
 * run the drafting round (except for `unstale`, which needs no words),
 * validate the verdict against the decision, and make the writes.
 *
 * Returns {outcome, detail, done} where `done` tells the sweep summary what
 * happened: "noop" | "stale" | "close" | "unstale" | "veto" | "failed".
 */
export async function processStaleTask(
  task,
  {
    state,
    log = () => {},
    runAgent,
    signal,
    st,
    gh: _gh,
    ghJson,
    botLogins,
    selfLogin,
    stateDir,
    now = () => Date.now(),
  } = {},
) {
  const run = runAgent ?? runAgentProcess;
  const repo = st.repo;
  const label = st.staleLabel;
  const fail = (detail, done = "failed") => {
    bumpCounts(state, "failed");
    return { outcome: "failed", detail, done };
  };

  // 1. Idempotency: re-check the live state before touching anything.
  let issue;
  try {
    issue = await ghJson(["api", `repos/${repo}/issues/${task.number}`]);
  } catch (e) {
    return fail(`#${task.number}: ${e.message}`);
  }
  const hasLabel = (issue.labels ?? []).some((l) => l.name === label);
  if (issue.state !== "open") {
    return {
      outcome: "completed",
      detail: `#${task.number} already ${issue.state} — no-op`,
      done: "noop",
    };
  }
  if (task.action === "stale" && hasLabel) {
    return {
      outcome: "completed",
      detail: `#${task.number} already carries ${label} — no-op`,
      done: "noop",
    };
  }
  if (task.action === "unstale" && !hasLabel) {
    return {
      outcome: "completed",
      detail: `#${task.number} no longer carries ${label} — no-op`,
      done: "noop",
    };
  }

  // 2. The drafting round — except for unstale, which posts nothing.
  if (task.action === "unstale") {
    state.data.active = {
      type: "stale",
      number: task.number,
      action: task.action,
      since: nowIso(),
    };
    state.save();
    try {
      removeLabel(ghJson, repo, task.number, label);
    } catch (e) {
      return fail(`#${task.number}: ${e.message}`);
    }
    bumpCounts(state, "completed");
    log(
      `stale: #${task.number} re-activated (${label} removed, no comment posted)`,
    );
    return {
      outcome: "completed",
      detail: `#${task.number} unstale`,
      done: "unstale",
    };
  }

  state.data.active = {
    type: "stale",
    number: task.number,
    action: task.action,
    since: nowIso(),
  };
  state.save();

  let comments = [];
  try {
    comments = await fetchComments(task.number, repo, ghJson);
  } catch (e) {
    log(
      `stale: #${task.number} comments unreadable (${String(e.message).slice(0, 120)}) — drafting from the body only`,
    );
  }

  const def = loadAgentDef("stale-bot");
  const cwd = st.repoPath ? expandHome(st.repoPath) : repoRoot;
  let res;
  try {
    res = await run({
      cwd,
      agentDef: def,
      model: st.model ?? def.model,
      prompt: buildBrief({ task, issue, comments, st }),
      timeoutMin: st.roundTimeoutMin,
      signal,
      log,
    });
  } catch (e) {
    return fail(
      `#${task.number}: drafting round failed — ${String(e.message).slice(0, 160)}`,
    );
  }
  if (!res?.ok) {
    return fail(
      `#${task.number}: drafting round ended badly — ${String(res?.error ?? res?.stderrTail ?? "no terminal event").slice(0, 160)}`,
    );
  }

  const verdict = parseStaleVerdict(res.finalText);
  if (!verdict) {
    log(
      `stale: #${task.number} returned no parseable verdict — no writes (retried next sweep)`,
    );
    return fail(`#${task.number}: no parseable verdict`);
  }

  // 3. A veto cools the issue instead of re-offering it every sweep.
  if (verdict.action === "skip") {
    const s = readStateFile(stateDir);
    s.cooling[String(task.number)] = {
      at: nowIso(),
      until: new Date(now() + st.coolDays * DAY).toISOString(),
      reason: verdict.reason,
    };
    writeStateFile(stateDir, s);
    bumpCounts(state, "blocked");
    log(
      `stale: #${task.number} vetoed by the drafter: ${verdict.reason} — cooling ${st.coolDays}d`,
    );
    return {
      outcome: "blocked",
      detail: `#${task.number}: ${verdict.reason}`,
      done: "veto",
    };
  }
  if (verdict.action !== task.action) {
    log(
      `stale: #${task.number} verdict action "${verdict.action}" ≠ decided "${task.action}" — no writes`,
    );
    return fail(`#${task.number}: verdict/decision mismatch`);
  }

  // 4. Execute. Dry run stops at the log line.
  if (st.dryRun) {
    const text = task.action === "close" ? verdict.closeBody : verdict.comment;
    log(
      `dry-run #${task.number} [${task.action}, ${verdict.language}]: ${JSON.stringify(text).slice(0, 600)}`,
    );
    bumpCounts(state, "completed");
    return {
      outcome: "completed",
      detail: `#${task.number} dry-run ${task.action}`,
      done: task.action,
    };
  }

  try {
    if (task.action === "stale") {
      postComment(ghJson, repo, task.number, verdict.comment);
      addLabel(ghJson, repo, task.number, label);
    } else {
      // Close: one explanatory comment, then the close as not_planned. A
      // closing comment the bot posted within the last day means an earlier
      // attempt died between the two calls — don't double-post.
      const last = comments.at(-1);
      const alreadySaid =
        last &&
        isBotLogin(last.user?.login, botLogins, selfLogin) &&
        now() - Date.parse(last.created_at) < DAY;
      if (!alreadySaid)
        postComment(ghJson, repo, task.number, verdict.closeBody);
      closeIssue(ghJson, repo, task.number);
    }
  } catch (e) {
    log(
      `stale: #${task.number} write failed: ${String(e.message).slice(0, 200)} — idempotent re-check next sweep`,
    );
    return fail(`#${task.number}: ${String(e.message).slice(0, 200)}`);
  }

  bumpCounts(state, "completed");
  log(
    `stale: #${task.number} ${
      task.action === "stale" ? `labeled "${label}"` : "closed (not_planned)"
    }`,
  );
  return {
    outcome: "completed",
    detail: `#${task.number} ${task.action}`,
    done: task.action,
  };
}

function bumpCounts(state, key) {
  if (!state?.data?.counts) return;
  state.data.counts[key] = (state.data.counts[key] ?? 0) + 1;
  state.save?.();
}

function postComment(ghJson, repo, number, body) {
  ghJson([
    "api",
    "-X",
    "POST",
    `repos/${repo}/issues/${number}/comments`,
    "-f",
    `body=${body}`,
  ]);
}

function addLabel(ghJson, repo, number, label) {
  ghJson([
    "api",
    "-X",
    "POST",
    `repos/${repo}/issues/${number}/labels`,
    "-f",
    `label=${label}`,
  ]);
}

function removeLabel(ghJson, repo, number, label) {
  ghJson([
    "api",
    "-X",
    "DELETE",
    `repos/${repo}/issues/${number}/labels/${encodeURIComponent(label)}`,
  ]);
}

function closeIssue(ghJson, repo, number) {
  // never "completed": stale closure is not a resolution.
  ghJson([
    "api",
    "-X",
    "POST",
    `repos/${repo}/issues/${number}`,
    "-f",
    "state=closed",
    "-f",
    "state_reason=not_planned",
  ]);
}

/** Comment list for one issue, capped at 5 pages (500 comments). */
// NOTE: gh api sends any call carrying a field (-f or -F) as POST unless the
// method is given explicitly — every GET with fields must carry "-X", "GET".
export async function fetchComments(number, repo, ghJson) {
  const all = [];
  for (let page = 1; page <= 5; page++) {
    const items = await ghJson([
      "api",
      "-X",
      "GET",
      `repos/${repo}/issues/${number}/comments`,
      "-F",
      "per_page=100",
      "-F",
      `page=${page}`,
    ]);
    all.push(...items);
    if (items.length < 100) break;
  }
  return all;
}

// ---------------------------------------------------------------------------
// the source

export function createStaleSource(cfg = {}, o = {}) {
  const gh = o.gh ?? realGh;
  const ghJson = o.ghJson ?? realGhJson;
  const now = o.now ?? (() => Date.now());

  const st = { ...DEFAULTS, ...(cfg.stale ?? {}) };
  if (!st.repo) {
    throw new Error('stale.repo is not set (e.g. "powerhouse-inc/powerhouse")');
  }
  const stateDir = expandHome(o.stateDir ?? cfg.stateDir ?? ".");
  const botLogins = st.botLogins ?? [];

  /** The account this harness posts as; filled in at startup. */
  let selfLogin = o.selfLogin ?? null;

  /** The in-sweep snapshot; one per `runTasks` call. */
  let sweep = null;
  let gateLogged = false;

  // -- state file ------------------------------------------------------------

  function loadStaleStateFile() {
    const s = readStateFile(stateDir);
    return s;
  }
  function saveStaleStateFile(s) {
    writeStateFile(stateDir, s);
  }

  // -- GitHub reads ------------------------------------------------------------

  /** All open issues, via the search API (it carries comments/reactions counts). */
  async function fetchOpenIssues() {
    const all = [];
    let page = 1;
    for (;;) {
      const res = ghJson([
        "api",
        "-X",
        "GET",
        "/search/issues",
        "-f",
        `q=repo:${st.repo} is:issue state:open`,
        "-F",
        "per_page=100",
        "-F",
        `page=${page}`,
      ]);
      const items = res?.items ?? [];
      all.push(...items);
      if (items.length < 100 || all.length >= (res?.total_count ?? 0)) break;
      page += 1;
    }
    return all;
  }

  /**
   * One daily pass: fetch everything, compute both buckets, rank them.
   * The result is a flat candidate list — bucket B first (labeling before
   * closures, as the reference does), then close, then unstale — with the
   * per-action caps baked into the lengths.
   */
  async function computeSweep(log) {
    const nowMs = now();
    const staleCutoff = nowMs - st.daysBeforeStale * DAY;
    const exempt = new Set(st.exemptLabels);

    const open = await fetchOpenIssues();
    log(
      `stale: ${open.length} open issues in ${st.repo} ` +
        `(stale after ${st.daysBeforeStale}d, close after ${st.daysBeforeClose}d, ` +
        `exempt: ${[...exempt].join(", ") || "none"}${st.dryRun ? ", DRY RUN" : ""})`,
    );

    const staleLabel = st.staleLabel;
    const bucketB = [];
    const bucketA = [];
    for (const i of open) {
      const labels = (i.labels ?? []).map((l) => l.name);
      if (labels.includes(staleLabel)) bucketA.push(i);
      else if (
        !labels.some((l) => exempt.has(l)) &&
        Date.parse(i.updated_at) <= staleCutoff
      ) {
        bucketB.push(i);
      }
    }

    // The posting account is its own kind of bot for re-activation purposes.
    // gh api -q .login prints a bare string — the text wrapper, not ghJson.
    const selfLogin =
      o.selfLogin ?? String(gh(["api", "/user", "-q", ".login"])).trim();

    // Bucket B: engagement score per the reference formula. `updated_at` is
    // the inactivity proxy; the comment lists split the score into its
    // distinct-user and non-bot terms.
    const scored = await Promise.all(
      bucketB.map(async (i) => {
        let comments = [];
        try {
          comments = await fetchComments(i.number, st.repo, ghJson);
        } catch {
          // a comment fetch that fails scores the issue on the counts the
          // search API already gave — the ranking stays fair, just coarser
        }
        const nonBot = comments.filter(
          (c) => !isBotLogin(c.user?.login, botLogins, selfLogin),
        );
        const distinct = new Set(
          nonBot.map((c) => c.user?.login).filter(Boolean),
        );
        const weeks = Math.floor((nowMs - Date.parse(i.updated_at)) / WEEK);
        return {
          ...i,
          _distinct: distinct.size,
          _nonBotComments: nonBot.length,
          _weeks: weeks,
          _score: engagementScore({
            distinctUsers: distinct.size,
            commentsAndReactions:
              nonBot.length + (i.reactions?.total_count ?? 0),
            weeksSinceUpdate: weeks,
          }),
        };
      }),
    );
    scored.sort(
      (a, b) =>
        a._score - b._score ||
        Date.parse(a.updated_at) - Date.parse(b.updated_at),
    );

    // Bucket A: when was the label last applied, and has anyone (non-bot)
    // made qualifying activity since?
    const closeCands = [];
    const unstaleCands = [];
    const timed = await Promise.all(
      bucketA.map(async (i) => {
        try {
          const tl = await ghJson([
            "api",
            "-X",
            "GET",
            `repos/${st.repo}/issues/${i.number}/timeline`,
            "-f",
            "per_page=100",
          ]);
          const labeled = tl.filter(
            (e) => e.action === "labeled" && e.label?.name === staleLabel,
          );
          if (!labeled.length) {
            log(
              `stale: #${i.number} has the label but no labeled event — skipping`,
            );
            return null;
          }
          const appliedAt = Date.parse(labeled[labeled.length - 1].created_at);
          // Qualifying activity: comment / edit / label change by a
          // non-bot, strictly after the label was applied. The application
          // event itself (by anyone) is not re-activation.
          const after = tl.filter((e) => {
            if (Date.parse(e.created_at) <= appliedAt) return false;
            if (
              !["commented", "edited", "labeled", "unlabeled"].includes(
                e.action,
              )
            )
              return false;
            return !isBotLogin(e.actor?.login, botLogins, selfLogin);
          });
          if (after.length > 0) return { issue: i, decision: "unstale" };
          if (nowMs - appliedAt >= st.daysBeforeClose * DAY)
            return { issue: i, decision: "close" };
          return null; // younger than the close window — nothing to do
        } catch (e) {
          log(
            `stale: #${i.number} timeline unreadable (${String(e.message).slice(0, 120)}) — leaving it alone`,
          );
          return null;
        }
      }),
    );
    for (const t of timed) {
      if (!t) continue;
      if (t.decision === "close") closeCands.push(t.issue);
      else unstaleCands.push(t.issue);
    }
    closeCands.sort((a, b) => a.number - b.number);
    unstaleCands.sort((a, b) => a.number - b.number);

    // Per-action caps. Each stale action is one comment plus one label-add
    // (and a close is one comment plus one close) — the pairs share one cap.
    const candidates = [
      ...scored
        .slice(0, st.maxStalePerSweep)
        .map((i) => ({ ...i, _action: "stale" })),
      ...closeCands
        .slice(0, st.maxClosePerSweep)
        .map((i) => ({ ...i, _action: "close" })),
      ...unstaleCands
        .slice(0, st.maxUnstalePerSweep)
        .map((i) => ({ ...i, _action: "unstale" })),
    ];

    log(
      `stale: bucket B ${scored.length} (labeling ${Math.min(scored.length, st.maxStalePerSweep)}), ` +
        `bucket A ${bucketA.length} (closing ${Math.min(closeCands.length, st.maxClosePerSweep)}, ` +
        `re-activating ${Math.min(unstaleCands.length, st.maxUnstalePerSweep)}, ` +
        `holding ${bucketA.length - closeCands.length - unstaleCands.length})`,
    );

    return {
      at: nowIso(),
      dryRun: st.dryRun,
      candidates,
      ptr: 0,
      summary: {
        at: nowIso(),
        dryRun: st.dryRun,
        labeled: [],
        closed: [],
        unstaled: [],
        skipped: [],
        failed: [],
      },
    };
  }

  /** Stamp the sweep done and record what it did. */
  function finishSweep(log) {
    const s = loadStaleStateFile();
    s.lastSweepAt = nowIso();
    s.sweeps.push(sweep.summary);
    saveStaleStateFile(s);
    log(
      `stale: sweep finished — labeled ${sweep.summary.labeled.length}, closed ${sweep.summary.closed.length}, ` +
        `re-activated ${sweep.summary.unstaled.length}, skipped ${sweep.summary.skipped.length}, ` +
        `failed ${sweep.summary.failed.length} (next sweep in ${st.sweepEveryHours}h)`,
    );
  }

  // -- the source object ---------------------------------------------------------

  return {
    name: "stale",

    /**
     * gh must be authenticated and the stale label must exist (created on
     * first real run). No vault, no switchboard — this profile never
     * touches the knowledge vault.
     */
    startup(_runCfg, _state, log) {
      selfLogin =
        o.selfLogin ?? String(gh(["api", "/user", "-q", ".login"])).trim();
      const existing =
        ghJson([
          "api",
          "-X",
          "GET",
          `repos/${st.repo}/labels`,
          "-F",
          "per_page=100",
          "-q",
          "[.[]?.name]",
        ]) ?? [];
      if (!existing.includes(st.staleLabel)) {
        if (st.dryRun) {
          log(
            `startup: dry run — would create label "${st.staleLabel}" on ${st.repo}`,
          );
        } else {
          ghJson([
            "api",
            "-X",
            "POST",
            `repos/${st.repo}/labels`,
            "-f",
            `name=${st.staleLabel}`,
            "-f",
            "color=999999",
            "-f",
            "description=Inactive issue; closed after a further grace period without activity",
          ]);
          log(`startup: created label "${st.staleLabel}" on ${st.repo}`);
        }
      }
      log(
        `startup: ${st.repo} reachable (posting as ${selfLogin}, stale after ${st.daysBeforeStale}d, ` +
          `close after ${st.daysBeforeClose}d, caps ${st.maxStalePerSweep}/${st.maxClosePerSweep}/${st.maxUnstalePerSweep}, ` +
          `${st.dryRun ? "DRY RUN" : "live"})`,
      );
    },

    /**
     * An interrupted stale sweep left nothing half-done that matters: every
     * write is re-checked against current state before it is made, so the
     * next run simply re-evaluates. Clear the record.
     */
    async recover(_runCfg, state, log) {
      const a = state.data.active;
      if (a?.type === "stale") {
        log(
          `recover: #${a.number} [${a.action}] was interrupted — clearing the record; the sweep is idempotent and will re-check it`,
        );
        state.data.active = null;
        state.save();
      }
      return null;
    },

    async selectNext({
      state,
      cfg: _runCfg = cfg,
      skip = new Set(),
      log = () => {},
    } = {}) {
      const s = loadStaleStateFile();
      const nowMs = now();

      // The sweep gate: one pass per `sweepEveryHours`. An unfinished sweep
      // (a previous run died before it stamped) is resumed, not skipped.
      if (s.lastSweepAt) {
        const age = nowMs - Date.parse(s.lastSweepAt);
        if (age < st.sweepEveryHours * 3600_000) {
          if (!gateLogged) {
            gateLogged = true;
            log(
              `stale: last sweep ${Math.max(1, Math.round(age / 3600_000))}h ago — ` +
                `next one in ${Math.max(1, Math.ceil((st.sweepEveryHours * 3600_000 - age) / 3600_000))}h`,
            );
          }
          return null;
        }
      }

      if (!sweep) sweep = await computeSweep(log);

      // Serve candidates in order, honoring the loop's skip set and our own
      // cooling records (vetoed issues are not offered again for coolDays).
      while (sweep.ptr < sweep.candidates.length) {
        const c = sweep.candidates[sweep.ptr++];
        if (skip.has(`stale-${c.number}`)) continue;
        const cool = s.cooling[String(c.number)];
        if (cool && Date.parse(cool.until) > nowMs) {
          sweep.summary.skipped.push({
            n: c.number,
            reason: cool.reason ?? "cooling",
          });
          continue;
        }
        if (c._action === "stale") {
          // The reference's mandatory substituted-arithmetic line.
          log(
            `stale: #${c.number} engagement = 3 × ${c._distinct} + 2 × ${c._nonBotComments + (c.reactions?.total_count ?? 0)} + ${c._weeks} = ${c._score} — ${c.title.slice(0, 80)}`,
          );
        } else {
          log(`stale: #${c.number} [${c._action}] — ${c.title.slice(0, 80)}`);
        }
        return {
          id: `stale-${c.number}`,
          kind: "stale",
          number: c.number,
          title: c.title,
          url: c.html_url ?? c.url,
          labels: (c.labels ?? []).map((l) => l.name),
          action: c._action,
          staleLabel: st.staleLabel,
          daysBeforeClose: st.daysBeforeClose,
          score: c._action === "stale" ? c._score : null,
        };
      }

      finishSweep(log);
      sweep = null;
      return null;
    },

    async process(task, ctx) {
      const log = ctx?.log ?? (() => {});
      const res = await processStaleTask(task, {
        ...ctx,
        st,
        gh,
        ghJson,
        botLogins,
        selfLogin,
        stateDir,
        now,
      });
      if (sweep) {
        switch (res.done) {
          case "stale":
            sweep.summary.labeled.push({
              n: task.number,
              title: task.title,
              dry: !!st.dryRun,
            });
            break;
          case "close":
            sweep.summary.closed.push({
              n: task.number,
              title: task.title,
              dry: !!st.dryRun,
            });
            break;
          case "unstale":
            sweep.summary.unstaled.push({ n: task.number, title: task.title });
            break;
          case "veto":
            sweep.summary.skipped.push({
              n: task.number,
              reason: res.detail.replace(/^#\d+: /, ""),
            });
            break;
          case "failed":
            sweep.summary.failed.push({ n: task.number, why: res.detail });
            break;
          default:
            break; // noop — already handled before this round
        }
      }
      return res;
    },
  };
}

// ---------------------------------------------------------------------------
// state-file plumbing shared with tests

function readStateFile(stateDir) {
  try {
    const j = JSON.parse(
      readFileSync(join(stateDir, "stale-state.json"), "utf8"),
    );
    return {
      lastSweepAt: j.lastSweepAt ?? null,
      sweeps: Array.isArray(j.sweeps) ? j.sweeps : [],
      cooling: j.cooling && typeof j.cooling === "object" ? j.cooling : {},
    };
  } catch {
    return { lastSweepAt: null, sweeps: [], cooling: {} };
  }
}

function writeStateFile(stateDir, s) {
  mkdirSync(stateDir, { recursive: true });
  const path = join(stateDir, "stale-state.json");
  const tmp = `${path}.tmp`;
  writeFileSync(
    tmp,
    JSON.stringify({ ...s, sweeps: s.sweeps.slice(-SWEEP_KEEP) }, null, 2) +
      "\n",
  );
  renameSync(tmp, path);
}

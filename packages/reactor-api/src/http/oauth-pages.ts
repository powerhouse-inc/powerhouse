import type { DeviceGrant } from "./oauth-grants.js";
import { formatUserCode } from "./oauth-grants.js";

/**
 * The consent page of the device grant (RFC 8628 3.3), and of the
 * authorization code grant on the same grant object: plain HTML, no script,
 * the look of the switchboard's other approval page (workflow waitpoints).
 * Opening it approves nothing: it shows what the person would allow, and its
 * buttons post to the host, which checks the page's nonce and the origin.
 */

/** What every page is sent with: no framing, no script, no caching. */
export function pageHeaders(
  formOrigins: readonly string[],
): Record<string, string> {
  return {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'${formOrigins
      .map((origin) => ` ${origin}`)
      .join("")}; frame-ancestors 'none'; base-uri 'none'`,
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
  };
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const STYLE = `
:root { color-scheme: light dark; --bg: #fafafa; --card: #fff; --fg: #0a0a0a; --muted: #6b7280; --line: #e5e7eb; --ok: #059669; --no: #dc2626; --warn: #b45309; }
@media (prefers-color-scheme: dark) { :root { --bg: #0a0a0a; --card: #171717; --fg: #fafafa; --muted: #a3a3a3; --line: #262626; --warn: #f59e0b; } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; background: var(--bg); color: var(--fg); font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { width: 480px; max-width: 100%; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 24px; }
h1 { font-size: 20px; margin: 0 0 8px; }
p { margin: 0 0 16px; color: var(--muted); }
dl { margin: 0 0 16px; padding: 12px; border: 1px solid var(--line); border-radius: 8px; display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; }
dt { color: var(--muted); } dd { margin: 0; overflow-wrap: anywhere; }
.may { color: var(--fg); }
.warning { color: var(--warn); font-weight: 500; }
code { font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
label { display: block; font-weight: 500; margin-bottom: 4px; }
input[type=text] { width: 100%; height: 36px; padding: 0 8px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: inherit; font: 16px ui-monospace, monospace; letter-spacing: 2px; text-transform: uppercase; }
.actions { display: flex; gap: 8px; margin-top: 16px; }
form.inline { flex: 1; margin: 0; }
button { width: 100%; height: 36px; border: 0; border-radius: 8px; color: #fff; font: inherit; font-weight: 500; cursor: pointer; background: var(--fg); color: var(--bg); }
.approve { background: var(--ok); color: #fff; } .deny { background: var(--no); color: #fff; }
.done h1 { color: var(--ok); } .closed h1 { color: var(--muted); }
`;

function shell(title: string, tone: string, body: string, head = ""): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">${head}
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main class="${tone}">
<h1>${escapeHtml(title)}</h1>
${body}
</main>
</body>
</html>`;
}

// No script runs on the page, so times are shown in UTC.
function formatTime(at: number): string {
  return `${new Date(at).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  })} UTC`;
}

function shortDid(did: string): string {
  return did.length > 24 ? `${did.slice(0, 14)}…${did.slice(-6)}` : did;
}

/** The page asking for a code. */
export function codeEntryPage(o: { action: string; error?: string }): string {
  const error = o.error ? `<p class="warning">${escapeHtml(o.error)}</p>` : "";
  return shell(
    "Connect a device",
    "open",
    `<p>Enter the code the device or tool shows you.</p>
${error}
<form method="get" action="${escapeHtml(o.action)}">
<label for="user_code">Code</label>
<input type="text" id="user_code" name="user_code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="9" placeholder="WXYZ-BCDF" required>
<div class="actions"><button type="submit">Continue</button></div>
</form>`,
  );
}

/** The host a code grant's redirect URI names: what the consent page shows. */
export function redirectHostOf(grant: DeviceGrant): string | undefined {
  if (!grant.code) return undefined;
  try {
    return new URL(grant.code.redirectUri).host;
  } catch {
    return grant.code.redirectUri;
  }
}

/**
 * What the person allows, and the ways to answer. For an authorization code
 * grant (an MCP client signing in) the page also says where the browser
 * returns, and checks back every few seconds (`continueUrl`, no script): once
 * the code is approved, here or by `ph token approve`, the browser goes on to
 * the client; Renown's console opens in a tab of its own meanwhile.
 */
export function consentPage(o: {
  issuer: string;
  hostDid: string | undefined;
  grant: DeviceGrant;
  nonce: string;
  endsAt: number;
  renownAction: string;
  denyAction: string;
  continueUrl?: string;
  /** Said above the details, e.g. that the code is not approved yet. */
  notice?: string;
}): string {
  const { grant } = o;
  const code = formatUserCode(grant.userCode);
  const returnsTo = redirectHostOf(grant);
  const rows: [string, string][] = [
    ["Host", o.hostDid ? `${o.issuer} (${shortDid(o.hostDid)})` : o.issuer],
    ["Session", `"${grant.label}" (${shortDid(grant.sessionDid)})`],
    ["Asked by", grant.clientId],
    ...(returnsTo ? ([["Returns to", returnsTo]] as [string, string][]) : []),
    [
      "From",
      `${grant.requestedFrom}, ${formatTime(Date.parse(grant.requestedAt))}`,
    ],
    ["Ends", `${formatTime(o.endsAt)} (${grant.days} days)`],
  ];
  const details = rows
    .map(
      ([term, value]) =>
        `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd>`,
    )
    .join("");
  const hidden = `<input type="hidden" name="user_code" value="${escapeHtml(grant.userCode)}"><input type="hidden" name="nonce" value="${escapeHtml(o.nonce)}">`;
  const notice = o.notice
    ? `<p class="warning">${escapeHtml(o.notice)}</p>\n`
    : "";
  // Renown's console in a tab of its own: this page keeps checking back.
  const renownTarget = o.continueUrl ? ' target="_blank"' : "";
  const next = o.continueUrl
    ? `\n<p>Once it is approved this page goes on to ${escapeHtml(returnsTo ?? "the app")} by itself, or <a href="${escapeHtml(o.continueUrl)}">continue</a>.</p>`
    : "";
  const refresh = o.continueUrl
    ? `\n<meta http-equiv="refresh" content="5;url=${escapeHtml(o.continueUrl)}">`
    : "";
  return shell(
    `Approve ${code}?`,
    "open",
    `${notice}<p class="may">The session "${escapeHtml(grant.label)}" may sign document changes as you on this host; no administration.</p>
<dl>${details}</dl>
<p class="warning">Approve only a code you started yourself in the last 10 minutes.</p>
<div class="actions">
<form class="inline" method="post" action="${escapeHtml(o.denyAction)}">${hidden}<button type="submit" class="deny">Deny</button></form>
<form class="inline" method="post" action="${escapeHtml(o.renownAction)}"${renownTarget}>${hidden}<button type="submit" class="approve">Approve with Renown</button></form>
</div>
<p>With a pseudonym on this computer, approve it there instead:<br><code>ph token approve ${escapeHtml(code)} --url ${escapeHtml(o.issuer)}</code></p>${next}`,
    refresh,
  );
}

/** A page that only says something. */
export function messagePage(
  title: string,
  message: string,
  tone: "done" | "closed" | "open" = "closed",
): string {
  return shell(title, tone, `<p>${escapeHtml(message)}</p>`);
}

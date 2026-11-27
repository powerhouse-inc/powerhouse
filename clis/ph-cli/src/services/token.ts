import { resolveSwitchboardPortDefault } from "@powerhousedao/shared/clis/args";
import {
  credentialBindingOf,
  credentialRecordId,
  readCredentialWithdrawal,
} from "@powerhousedao/shared/clis/credential-records";
import {
  HOST_SESSION_MAX_DAYS,
  hostSessionEnd,
  listHostSessions,
  readHostSessionLastUsed,
  withdrawHostSession,
  type HostSessionFile,
} from "@powerhousedao/shared/clis/host-sessions";
import {
  identityDataDir,
  shortAddress,
} from "@powerhousedao/shared/clis/identity";
import {
  openInBrowser,
  opensBrowser,
} from "@powerhousedao/shared/clis/local-sign-in";
import type { ActiveIdentity } from "@renown/sdk/identity";
import path from "node:path";
import { createInterface } from "node:readline/promises";

/**
 * `ph token`: host session tokens (F3e part 2), for a tool that signs nothing
 * itself. `create` runs a host's OAuth device grant: a pseudonym approves it
 * after the prompt, a Renown login on the host's page; only the token goes to
 * stdout. `approve` approves a code a device or tool shows, as `create` does
 * its own. `list` and `withdraw` read the store's files as the OS user, as
 * `ph credentials` does; with `--url` they ask the host's `oauth/sessions`
 * with a bearer of the person's own session.
 */

type Env = Readonly<Record<string, string | undefined>>;

const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
/** How `ph token` names itself to a host. */
const CLIENT_ID = "ph-cli";
const DEFAULT_LABEL = "ph token";
/** The session whose bearer reads and withdraws a person's sessions at a host. */
const OWN_SESSION_LABEL = "ph-cli";

export type TokenIo = {
  /** stdout: the token, or JSON; nothing else. */
  out: (line: string) => void;
  /** stderr: everything a person reads. */
  err: (line: string) => void;
  /** Asks yes or no; undefined when there is no terminal to ask on. */
  ask: (question: string) => Promise<boolean | undefined>;
  /** Opens a link for the person, where that is wanted (never with BROWSER=none). */
  open: (url: string) => void;
  sleep: (ms: number) => Promise<void>;
  /** Whether a pseudonym's password may be asked. */
  interactive: boolean;
  env: Env;
  /** Who acts here; the active identity of the data folder by default. */
  identity?: () => Promise<ActiveIdentity | undefined>;
};

export function defaultTokenIo(): TokenIo {
  return {
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    ask: async (question) => {
      if (!process.stdin.isTTY) return undefined;
      const rl = createInterface({
        input: process.stdin,
        output: process.stderr,
      });
      try {
        return /^y(es)?$/i.test((await rl.question(question)).trim());
      } finally {
        rl.close();
      }
    },
    open: (url) => {
      if (opensBrowser({ isTTY: process.stderr.isTTY })) openInBrowser(url);
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    interactive: process.stdin.isTTY,
    env: process.env,
  };
}

/** A refusal the person reads; the command exits 1. */
class TokenError extends Error {}

/** The host's issuer as `--url` names it; this project's switchboard by default. */
function hostUrlOf(url: string | undefined): string {
  const given = url ?? `http://localhost:${resolveSwitchboardPortDefault()}`;
  let parsed: URL;
  try {
    parsed = new URL(given);
  } catch {
    throw new TokenError(`${given} is no URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TokenError(`${given} is no http(s) URL.`);
  }
  return sameIssuer(parsed.href);
}

/** An issuer without its trailing slashes, as hosts name it. */
function sameIssuer(url: string): string {
  return new URL(url).href.replace(/\/+$/, "");
}

/** Whether `list` and `withdraw` ask the host: `--url`, unless `--data-dir` names the files. */
function atHost(args: { url?: string; dataDir?: string }): boolean {
  return args.url !== undefined && args.dataDir === undefined;
}

function dataDirOf(args: { dataDir?: string }, env: Env): string {
  return args.dataDir
    ? path.resolve(args.dataDir)
    : identityDataDir(process.cwd(), env);
}

type OAuthBody = Record<string, unknown> & {
  error?: string;
  error_description?: string;
};

async function call(
  url: string,
  init: RequestInit = {},
): Promise<{ status: number; body: OAuthBody }> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new TokenError(
      `${new URL(url).origin} cannot be reached: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const body = (await response.json().catch(() => ({}))) as OAuthBody;
  return { status: response.status, body };
}

const form = (url: string, fields: Record<string, string>) =>
  call(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });

const json = (
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  call(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const why = (body: OAuthBody, status: number) =>
  body.error_description ?? body.error ?? `HTTP ${status}`;

// ------------------------------------------------------------ approving

type Pending = {
  user_code: string;
  status: string;
  host: string;
  host_did: string | null;
  session_did: string;
  label: string;
  may: string;
  days: number;
  ends_at: string;
  client_id: string;
  /** An MCP client's sign-in: the host the person's browser returns to. */
  returns_to?: string;
  requested_from: string;
  requested_at: string;
  warning: string;
  nonce: string;
};

function shortDid(did: string): string {
  return did.length > 24 ? `${did.slice(0, 14)}…${did.slice(-6)}` : did;
}

const utc = (date: string) =>
  `${new Date(date).toISOString().slice(0, 16).replace("T", " ")} UTC`;

/** What the person allows, as the host's consent page shows it (design 3.2). */
function describePending(pending: Pending): string[] {
  const rows: [string, string][] = [
    [
      "Host",
      pending.host_did
        ? `${pending.host} (${shortDid(pending.host_did)})`
        : pending.host,
    ],
    ["Session", `"${pending.label}" (${shortDid(pending.session_did)})`],
    ["May", pending.may],
    ["Ends", `${utc(pending.ends_at)} (${pending.days} days)`],
    ["Asked by", pending.client_id],
    ...(pending.returns_to
      ? ([["Returns to", pending.returns_to]] as [string, string][])
      : []),
    ["From", `${pending.requested_from}, ${utc(pending.requested_at)}`],
  ];
  return [
    `Approve ${pending.user_code}?`,
    ...rows.map(([term, value]) => `  ${term.padEnd(9)} ${value}`),
    pending.warning,
  ];
}

/**
 * Approves the code at `url` as the pseudonym, once the person said yes (or
 * `yes`): reads the grant from the host, refuses one another host issued,
 * shows it, signs the session's credential and posts it. A no denies the
 * grant. Returns whether it was approved.
 */
async function approveCode(
  url: string,
  code: string,
  identity: ActiveIdentity | undefined,
  io: TokenIo,
  yes: boolean,
): Promise<boolean> {
  const read = await call(
    `${url}/oauth/device/pending?user_code=${encodeURIComponent(code)}`,
  );
  if (read.status === 404) {
    throw new TokenError(
      `${url} knows no code ${code}, or it has expired: start again.`,
    );
  }
  if (read.status !== 200) {
    throw new TokenError(
      `${url} did not show the code: ${why(read.body, read.status)}`,
    );
  }
  const pending = read.body as unknown as Pending;
  if (sameIssuer(pending.host) !== url) {
    throw new TokenError(
      `The code ${code} is ${pending.host}'s, not ${url}'s: approving it would let ${pending.host} sign as you. Run \`ph token approve ${code} --url ${pending.host}\` only if you meant that host.`,
    );
  }
  if (pending.status !== "pending") {
    throw new TokenError(`The code ${code} was already ${pending.status}.`);
  }
  if (!identity?.issueSessionCredential) {
    throw new TokenError(
      identity
        ? `You act as the Renown login ${identity.label}, whose wallet signs at Renown: approve the code on the host's page instead, ${url}/oauth/device?user_code=${pending.user_code}`
        : "No identity acts here to approve with.",
    );
  }
  for (const line of describePending(pending)) io.err(line);
  if (!yes) {
    const answer = await io.ask("Approve? [y/N] ");
    if (answer === undefined) {
      throw new TokenError("No terminal to ask on: pass --yes to approve.");
    }
    if (!answer) {
      await json(`${url}/oauth/device/deny`, {
        user_code: pending.user_code,
        nonce: pending.nonce,
      });
      io.err("Denied: the device or tool that asked gets no token.");
      return false;
    }
  }
  const credential = await identity.issueSessionCredential(
    pending.session_did,
    { label: pending.label, expiresInDays: pending.days },
  );
  const approved = await json(`${url}/oauth/device/approve`, {
    user_code: pending.user_code,
    credential,
    nonce: pending.nonce,
  });
  if (approved.status !== 200) {
    throw new TokenError(
      `${url} refused the approval: ${why(approved.body, approved.status)}`,
    );
  }
  io.err(
    `Approved: the session "${pending.label}" signs document changes for ${shortAddress(identity.address)} on ${url} until ${utc(String(approved.body.expires_at ?? pending.ends_at))}.`,
  );
  return true;
}

async function identityOf(io: TokenIo): Promise<ActiveIdentity | undefined> {
  if (io.identity) return io.identity();
  const { resolveActiveIdentity } = await import("@renown/sdk/identity");
  return resolveActiveIdentity({
    dataDir: identityDataDir(process.cwd(), io.env),
    interactive: io.interactive,
    create: true,
    env: io.env,
  });
}

export async function runTokenApprove(
  args: { code: string; url?: string; yes?: boolean },
  io: TokenIo = defaultTokenIo(),
): Promise<number> {
  try {
    const url = hostUrlOf(args.url);
    return (await approveCode(
      url,
      args.code,
      await identityOf(io),
      io,
      args.yes ?? false,
    ))
      ? 0
      : 1;
  } catch (error) {
    return failed(error, io);
  }
}

// ------------------------------------------------------------- creating

type Started = {
  device_code: string;
  user_code: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
};

export type IssuedToken = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  ph_session: string;
  ph_label: string;
  ph_address: string;
};

/** Polls the token endpoint as RFC 8628 3.5 says, until issued or refused. */
async function pollToken(
  url: string,
  started: Started,
  io: TokenIo,
): Promise<IssuedToken> {
  let interval = started.interval || 5;
  const deadline = Date.now() + started.expires_in * 1000;
  for (;;) {
    const polled = await form(`${url}/oauth/token`, {
      grant_type: DEVICE_CODE_GRANT,
      device_code: started.device_code,
      client_id: CLIENT_ID,
    });
    if (polled.status === 200) return polled.body as unknown as IssuedToken;
    switch (polled.body.error) {
      case "authorization_pending":
        break;
      case "slow_down":
        interval =
          typeof polled.body.interval === "number"
            ? polled.body.interval
            : interval + 5;
        break;
      case "access_denied":
        throw new TokenError("The request was denied: no token.");
      case "expired_token":
        throw new TokenError(
          "The code expired before it was approved: run `ph token create` again.",
        );
      default:
        throw new TokenError(
          `${url} issued no token: ${why(polled.body, polled.status)}`,
        );
    }
    if (Date.now() >= deadline) {
      throw new TokenError(
        "The code expired before it was approved: run `ph token create` again.",
      );
    }
    await io.sleep(interval * 1000);
  }
}

export async function runTokenCreate(
  args: {
    url?: string;
    label?: string;
    days?: number;
    replace?: string;
    yes?: boolean;
    json?: boolean;
    dataDir?: string;
  },
  io: TokenIo = defaultTokenIo(),
): Promise<number> {
  try {
    const url = hostUrlOf(args.url);
    const days = args.days;
    if (
      days !== undefined &&
      (!Number.isInteger(days) || days < 1 || days > HOST_SESSION_MAX_DAYS)
    ) {
      throw new TokenError(
        `--days: a whole number from 1 to ${HOST_SESSION_MAX_DAYS}.`,
      );
    }
    const identity = await identityOf(io);
    const start = await form(`${url}/oauth/device_authorization`, {
      client_id: CLIENT_ID,
      ph_label: args.label ?? DEFAULT_LABEL,
      ...(days !== undefined ? { ph_days: String(days) } : {}),
    });
    if (start.status !== 200) {
      throw new TokenError(
        `${url} started no grant: ${why(start.body, start.status)}`,
      );
    }
    const started = start.body as unknown as Started;
    if (identity?.issueSessionCredential) {
      if (
        !(await approveCode(
          url,
          started.user_code,
          identity,
          io,
          args.yes ?? false,
        ))
      ) {
        return 1;
      }
    } else {
      io.err(
        `Approve the code ${started.user_code} with Renown on the host's page (it expires in ${Math.round(started.expires_in / 60)} minutes):`,
      );
      io.err(`  ${started.verification_uri_complete}`);
      io.open(started.verification_uri_complete);
    }
    const issued = await pollToken(url, started, io);
    if (args.replace) {
      await withdraw(args.replace, { ...args, url: args.url }, io, {
        except: issued.ph_session,
      });
    }
    io.out(args.json ? JSON.stringify(issued, null, 2) : issued.access_token);
    return 0;
  } catch (error) {
    return failed(error, io);
  }
}

// --------------------------------------------------------- the sessions

type SessionRow = {
  id: string;
  label: string;
  address: string | null;
  grant: string;
  client_id: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  state?: string;
};

/** A person's own bearer at `url`: the `ph-cli` session, made known there. */
async function ownBearer(url: string, io: TokenIo): Promise<string> {
  const { openSession } = await import("@renown/sdk/identity");
  const session = await openSession({
    dataDir: identityDataDir(process.cwd(), io.env),
    label: OWN_SESSION_LABEL,
    place: "home",
    interactive: io.interactive,
    target: { url },
    env: io.env,
  });
  return session.bearer({ expiresIn: 600 });
}

async function hostSessions(url: string, io: TokenIo): Promise<SessionRow[]> {
  const listed = await call(`${url}/oauth/sessions`, {
    headers: { authorization: `Bearer ${await ownBearer(url, io)}` },
  });
  if (listed.status !== 200) {
    throw new TokenError(
      `${url} listed no sessions: ${why(listed.body, listed.status)}`,
    );
  }
  return (listed.body.sessions as SessionRow[] | undefined) ?? [];
}

function stateOf(dataDir: string, session: HostSessionFile, now: number) {
  const binding = session.credential
    ? credentialBindingOf(session.credential)
    : undefined;
  const withdrawal =
    binding &&
    readCredentialWithdrawal({ dataDir, id: credentialRecordId(binding) });
  if (
    withdrawal &&
    !(
      Date.parse(session.credential?.issuanceDate ?? "") >
      Date.parse(withdrawal.withdrawnAt)
    )
  ) {
    return "withdrawn";
  }
  return (hostSessionEnd(session) ?? 0) > now ? "live" : "ended";
}

function fileRows(dataDir: string): SessionRow[] {
  const now = Date.now();
  return listHostSessions({ dataDir })
    .filter((session) => session.credential !== undefined)
    .map((session) => ({
      id: session.id,
      label: session.credential?.credentialSubject.app ?? session.label,
      address: session.address ?? null,
      grant: session.grant,
      client_id: session.clientId,
      created_at: session.createdAt,
      expires_at: session.expiresAt ?? null,
      last_used_at:
        readHostSessionLastUsed({ dataDir, id: session.id }) ?? null,
      state: stateOf(dataDir, session, now),
    }));
}

const day = (date: string | null) => (date ?? "").slice(0, 10) || "-";

function table(rows: string[][]): string[] {
  const widths = rows[0].map((_, i) =>
    Math.max(...rows.map((row) => row[i].length)),
  );
  return rows.map((row) =>
    row
      .map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i])))
      .join("  ")
      .trimEnd(),
  );
}

export async function runTokenList(
  args: { url?: string; json?: boolean; dataDir?: string },
  io: TokenIo = defaultTokenIo(),
): Promise<number> {
  try {
    const remote = atHost(args);
    const where = remote ? hostUrlOf(args.url) : dataDirOf(args, io.env);
    const rows = remote ? await hostSessions(where, io) : fileRows(where);
    if (args.json) {
      io.out(
        JSON.stringify(
          { [remote ? "host" : "dataDir"]: where, sessions: rows },
          null,
          2,
        ),
      );
      return 0;
    }
    if (rows.length === 0) {
      io.out(`No host sessions ${remote ? "of yours at" : "in"} ${where}.`);
      return 0;
    }
    for (const line of table([
      [
        "ID",
        "LABEL",
        ...(remote ? [] : ["WHO"]),
        "GRANT",
        "CLIENT",
        "CREATED",
        "ENDS",
        "LAST USED",
        ...(remote ? [] : ["STATE"]),
      ],
      ...rows.map((row) => [
        row.id.slice(0, 8),
        row.label,
        ...(remote ? [] : [row.address ? shortAddress(row.address) : "-"]),
        row.grant,
        row.client_id,
        day(row.created_at),
        day(row.expires_at),
        day(row.last_used_at),
        ...(remote ? [] : [row.state ?? ""]),
      ]),
    ])) {
      io.out(line);
    }
    return 0;
  } catch (error) {
    return failed(error, io);
  }
}

/** The one session `target` names: an id prefix or a label. */
function matchOne<T extends { id: string; label: string }>(
  rows: T[],
  target: string,
): T {
  const lower = target.toLowerCase();
  const found = rows.filter(
    (row) =>
      (/^[0-9a-f]{4,32}$/.test(lower) && row.id.startsWith(lower)) ||
      row.label === target,
  );
  if (found.length === 0) throw new TokenError(`No host session ${target}.`);
  if (found.length > 1) {
    throw new TokenError(
      [
        `${target} names ${found.length} host sessions; name one by its id:`,
        ...found.map((row) => `  ${row.id.slice(0, 8)}  ${row.label}`),
      ].join("\n"),
    );
  }
  return found[0];
}

/** Withdraws the session `target` names: in the files, or at `--url`. */
async function withdraw(
  target: string,
  args: { url?: string; dataDir?: string },
  io: TokenIo,
  o: { except?: string } = {},
): Promise<void> {
  const keep = (row: { id: string }) => row.id !== o.except;
  if (atHost(args)) {
    const url = hostUrlOf(args.url);
    const row = matchOne((await hostSessions(url, io)).filter(keep), target);
    const done = await call(
      `${url}/oauth/sessions/${encodeURIComponent(row.id)}/withdraw`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${await ownBearer(url, io)}` },
      },
    );
    if (done.status !== 200) {
      throw new TokenError(
        `${url} did not withdraw ${row.id.slice(0, 8)}: ${why(done.body, done.status)}`,
      );
    }
    io.err(
      `Withdrew ${row.id.slice(0, 8)} ("${row.label}") at ${url}: its tokens are refused from their next request.`,
    );
    return;
  }
  const dataDir = dataDirOf(args, io.env);
  const sessions = listHostSessions({ dataDir }).filter(
    (session) => session.credential !== undefined && keep(session),
  );
  const row = matchOne(
    sessions.map((session) => ({
      id: session.id,
      label: session.credential?.credentialSubject.app ?? session.label,
      session,
    })),
    target,
  );
  withdrawHostSession({ dataDir, session: row.session, by: "command" });
  io.err(
    `Withdrew ${row.id.slice(0, 8)} ("${row.label}"): a running host refuses its tokens from their next request.`,
  );
}

export async function runTokenWithdraw(
  args: { target: string; url?: string; dataDir?: string },
  io: TokenIo = defaultTokenIo(),
): Promise<number> {
  try {
    await withdraw(args.target, args, io);
    return 0;
  } catch (error) {
    return failed(error, io);
  }
}

/** A refusal, or what stopped the command (a locked pseudonym, say): said, exit 1. */
function failed(error: unknown, io: TokenIo): number {
  if (!(error instanceof Error)) throw error;
  io.err(error.message);
  return 1;
}

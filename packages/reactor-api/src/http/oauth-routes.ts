import {
  credentialBindingOf,
  credentialRecordId,
  CredentialWithdrawnError,
  parsePkhIssuer,
  readCredentialWithdrawal,
  writeCredentialRecord,
  type CredentialBinding,
  type CredentialLike,
  type CredentialWithdrawer,
} from "@powerhousedao/shared/clis/credential-records";
import {
  HOST_SESSION_MAX_DAYS,
  HOST_SESSION_SCOPE,
  hostSessionEnd,
  listHostSessions,
  markHostSessionKey,
  matchHostSessionToken,
  mintHostSessionToken,
  newHostSession,
  parseHostSessionToken,
  readHostSession,
  readHostSessionLastUsed,
  removeHostSession,
  shortHostSessionId,
  withdrawHostSession,
  writeHostSession,
  type HostSessionFile,
} from "@powerhousedao/shared/clis/host-sessions";
import type { IHttpScope, RouteUser } from "@powerhousedao/shared/processors";
import {
  checkCredentialFor,
  expandCarriedCredential,
  type PowerhouseVerifiableCredential,
} from "@renown/sdk/node";
import {
  consoleApprovalUrl,
  pollConsoleCredential,
} from "@renown/sdk/identity";
import { childLogger, type ILogger } from "document-model";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  describeHostSession,
  shortAddress,
} from "../services/host-session-scope.js";
import { clientAddress, perMinuteLimit } from "./client-limits.js";
import { BodyTooLargeError, readBody } from "./node-response.js";
import {
  clientNameOf,
  listOAuthClients,
  MAX_REDIRECT_URIS,
  newOAuthClient,
  readOAuthClient,
  redirectUriRefusal,
  writeOAuthClient,
  type OAuthClient,
} from "./oauth-clients.js";
import {
  AUTHORIZATION_CODE_TTL_MS,
  DEVICE_GRANT_TTL_MS,
  DEVICE_POLL_INTERVAL_S,
  findDeviceGrant,
  formatUserCode,
  grantIdOf,
  grantNonce,
  grantNonceHolds,
  listDeviceGrants,
  newDeviceCode,
  newDeviceGrant,
  newUserCode,
  normalizeUserCode,
  readDeviceGrant,
  removeDeviceGrant,
  takeDeviceGrant,
  verifierHolds,
  writeDeviceGrant,
  type CodeGrantRequest,
  type DeviceGrant,
} from "./oauth-grants.js";
import {
  AUTHORIZATION_CODE_GRANT,
  DEVICE_CODE_GRANT,
  issuerOf,
  noIssuer,
  oauthEndpoints,
} from "./oauth-metadata.js";
import {
  codeEntryPage,
  consentPage,
  messagePage,
  pageHeaders,
  redirectHostOf,
} from "./oauth-pages.js";

/**
 * The OAuth routes that issue host session tokens (F3e part 2): the device
 * authorization grant (RFC 8628) with its consent page, the authorization
 * code grant with PKCE (RFC 6749 4.1, RFC 7636) on the same grant and consent
 * for MCP clients, their dynamic registration (RFC 7591, public clients
 * only), the token endpoint, revocation (RFC 7009), and the sessions a person
 * holds here. Public routes in the host scope `oauth`, outside the
 * authenticated-caller floor: their caller has no token yet. Nothing is
 * approved without the person's credential for the session's key; opening a
 * page approves nothing.
 */

/**
 * The label a Renown console signs today, whatever label it was asked to:
 * renown.id v2.0.0, on staging now, signs `app: "renown-app"` (and signs
 * without a click). Accepted as the asked label until renown.id with the
 * console change (PR #1: it signs the asked label, shows the host, and never
 * signs a host session without a click) runs on staging and production;
 * then this constant goes.
 */
export const RENOWN_APP_LABEL = "renown-app";

export interface OAuthRoutesOptions {
  /** The store's data folder: grants, sessions and credential records. */
  dataDir: string;
  /** The configured public origin (PUBLIC_URL), when there is one. */
  publicOrigin: string | undefined;
  /** The host's base path. */
  basePath: string;
  /** Renown, for the consent page's button. */
  renownUrl: string;
  /** The host's own key (did:key), shown on the consent page. */
  hostDid: () => string | undefined;
  /** At most this many days per session (at most 30). */
  maxDays?: number;
  /** A session was withdrawn: close what holds it. */
  onWithdrawn: (binding: CredentialBinding) => void;
  /**
   * Why a host session could do nothing on this host, when it could not
   * (ADMIN_ONLY: every document decision is an admin's, and a session
   * administers nothing). A grant is then refused, saying so.
   */
  sessionsUseless?: () => string | undefined;
  /** Whether a proxy the host trusts is in front: limits then go by `X-Forwarded-For`. */
  trustProxy?: boolean;
  logger?: ILogger;
  now?: () => number;
  /** @internal The credential check of an approval; tests slow it down. */
  checkCredential?: typeof checkCredentialFor;
}

const MAX_BODY_BYTES = 16 * 1024;
const STARTS_PER_MINUTE = 10;
const MISSES_PER_MINUTE = 10;
const MAX_PENDING_GRANTS = 1000;
const PENDING_PER_CLIENT = 20;
const SESSIONS_PER_ADDRESS = 50;
/** Expired grants and unapproved sessions are swept at most this often. */
const SWEEP_EVERY_MS = 30_000;
/** Renown console polls running at once, in all and per client. */
const RENOWN_POLLS = 50;
const RENOWN_POLLS_PER_CLIENT = 3;
/** Client registrations: a minute's, and those held, per client and in all. */
const REGISTRATIONS_PER_MINUTE = 10;
const CLIENTS_PER_ADDRESS = 20;
const MAX_CLIENTS = 1000;
/** What a code grant's session is called when its client names none. */
const DEFAULT_CODE_LABEL = "mcp client";
const SKEW_MS = 5 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const LABEL_MAX = 64;
const CLIENT_ID_MAX = 200;
/** Clients that kept polling a grant are tracked this long after it ends. */
const POLL_MEMORY_MS = 2 * DEVICE_GRANT_TTL_MS;

type Params = Record<string, unknown>;

function send(
  res: ServerResponse,
  status: number,
  body: string,
  headers: Record<string, string>,
): void {
  res.statusCode = status;
  for (const [name, value] of Object.entries(headers)) {
    res.setHeader(name, value);
  }
  res.setHeader("content-length", Buffer.byteLength(body));
  res.end(body);
}

function json(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  send(res, status, JSON.stringify(body), {
    "content-type": "application/json",
    "cache-control": "no-store",
    pragma: "no-cache",
    ...headers,
  });
}

/** An OAuth error (RFC 6749 5.2): `{ error, error_description }`, 400 unless said. */
function oauthError(
  res: ServerResponse,
  error: string,
  description: string,
  status = 400,
): void {
  json(res, status, { error, error_description: description });
}

/** A form (RFC 6749 takes forms) or JSON body as parameters. */
async function paramsOf(req: IncomingMessage): Promise<Params> {
  const raw = (await readBody(req, MAX_BODY_BYTES)).toString("utf8");
  const type = (req.headers["content-type"] ?? "").toLowerCase();
  if (type.includes("json")) {
    const value = (raw ? JSON.parse(raw) : {}) as unknown;
    return value && typeof value === "object" ? (value as Params) : {};
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

function queryOf(req: IncomingMessage): URLSearchParams {
  return new URL(req.url ?? "/", "http://host").searchParams;
}

/** A browser's form post: answered with a page, not JSON. */
function fromForm(req: IncomingMessage): boolean {
  return (req.headers["content-type"] ?? "")
    .toLowerCase()
    .startsWith("application/x-www-form-urlencoded");
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Why `resource` (RFC 8707) is no resource of the host `issuer` names;
 * undefined when it is one: `/mcp`, GraphQL, any URL on its origin.
 */
function resourceRefusal(resource: string, issuer: string): string | undefined {
  let url: URL;
  try {
    url = new URL(resource);
  } catch {
    return `resource ${resource} is no URL.`;
  }
  if (url.hash !== "") return `resource ${resource} carries a fragment.`;
  const origin = new URL(issuer).origin;
  return url.origin === origin
    ? undefined
    : `resource ${resource} is not on this host (${origin}).`;
}

/** `uri` with `params` added to its query: where a code or an error goes. */
function withQuery(uri: string, params: Record<string, string | undefined>) {
  const url = new URL(uri);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(name, value);
  }
  return url.href;
}

/** Whether a label can name a session: short, printable, and no did (the console reads one as none). */
function validLabel(label: string): boolean {
  return (
    label.trim() === label &&
    label.length > 0 &&
    label.length <= LABEL_MAX &&
    !label.startsWith("did:") &&
    // eslint-disable-next-line no-control-regex
    !/[\u0000-\u001f\u007f]/.test(label)
  );
}

export function mountOAuthRoutes(
  scope: IHttpScope,
  options: OAuthRoutesOptions,
): { dispose(): void } {
  const { dataDir } = options;
  const now = options.now ?? Date.now;
  const logger = options.logger ?? childLogger(["reactor-api", "oauth"]);
  const maxDays = Math.min(
    HOST_SESSION_MAX_DAYS,
    Math.max(1, Math.floor(options.maxDays ?? HOST_SESSION_MAX_DAYS)),
  );
  const checkCredential = options.checkCredential ?? checkCredentialFor;
  const startsLimited = perMinuteLimit(STARTS_PER_MINUTE, now);
  const missesLimited = perMinuteLimit(MISSES_PER_MINUTE, now);
  const registrationsLimited = perMinuteLimit(REGISTRATIONS_PER_MINUTE, now);
  const clientOf = (req: IncomingMessage) =>
    clientAddress(req, options.trustProxy ?? false);
  // When each grant was last polled, and its interval (slow_down raises it).
  const polls = new Map<string, { at: number; interval: number }>();
  // The Renown console polls running, per grant, and who started each.
  const renownPolls = new Map<
    string,
    { abort: AbortController; client: string }
  >();
  const renownOrigin = new URL(options.renownUrl).origin;
  let sweptAt = Number.NEGATIVE_INFINITY;

  const issuerFor = (req: IncomingMessage, res: ServerResponse) => {
    const issuer = issuerOf(req, {
      publicOrigin: options.publicOrigin,
      basePath: options.basePath,
    });
    if (!issuer) {
      oauthError(res, "temporarily_unavailable", noIssuer(req), 503);
    }
    return issuer;
  };

  const stopRenownPoll = (grantId: string) => {
    renownPolls.get(grantId)?.abort.abort();
    renownPolls.delete(grantId);
  };

  // ---------------------------------------------------------- the files

  /** Grants and unapproved sessions past their time go; at most every 30 s. */
  const sweep = () => {
    const at = now();
    if (at - sweptAt < SWEEP_EVERY_MS) return;
    sweptAt = at;
    for (const grant of listDeviceGrants(dataDir)) {
      // Kept a while past its end, so a polling client hears `expired_token`.
      if (Date.parse(grant.expiresAt) + DEVICE_GRANT_TTL_MS <= at) {
        dropGrant(grant);
      }
    }
    for (const session of listHostSessions({ dataDir })) {
      if (
        !session.credential &&
        Date.parse(session.createdAt) + 3 * DEVICE_GRANT_TTL_MS <= at
      ) {
        removeHostSession({ dataDir, id: session.id });
      }
    }
    for (const [id, poll] of polls) {
      if (poll.at + POLL_MEMORY_MS <= at) polls.delete(id);
    }
  };

  /**
   * A grant that will never issue goes, with its session: removed if nobody
   * approved it, withdrawn if its token was never collected (an approved
   * grant still on file was never taken by a poll).
   */
  const dropGrant = (grant: DeviceGrant) => {
    removeDeviceGrant(dataDir, grant.id);
    polls.delete(grant.id);
    stopRenownPoll(grant.id);
    const session = readHostSession({ dataDir, id: grant.sessionId });
    if (!session) return;
    if (!session.credential) {
      removeHostSession({ dataDir, id: session.id });
    } else if (session.tokens.length === 0) {
      withdraw(session, "host");
    }
  };

  const describe = (session: HostSessionFile) =>
    describeHostSession({
      address: session.address ?? "",
      label: session.credential?.credentialSubject.app ?? session.label,
      hostSession: {
        id: session.id,
        scope: session.scope,
        grant: session.grant,
      },
    });

  /** Whether the session's credential was withdrawn here (its tombstone). */
  const tombstoned = (session: HostSessionFile) => {
    const binding = session.credential
      ? credentialBindingOf(session.credential)
      : undefined;
    if (!binding || !session.credential) return false;
    const withdrawal = readCredentialWithdrawal({
      dataDir,
      id: credentialRecordId(binding),
    });
    return (
      withdrawal !== undefined &&
      !(
        Date.parse(session.credential.issuanceDate) >
        Date.parse(withdrawal.withdrawnAt)
      )
    );
  };

  /** The address's approved sessions that have not ended nor been withdrawn. */
  const liveSessionsOf = (address: string) => {
    const lower = address.toLowerCase();
    const at = now();
    return listHostSessions({ dataDir }).filter(
      (session) =>
        session.address?.toLowerCase() === lower &&
        (hostSessionEnd(session) ?? 0) > at &&
        !tombstoned(session),
    );
  };

  /** Withdraws a session: its credential's tombstone, then its file. */
  const withdraw = (session: HostSessionFile, by: CredentialWithdrawer) => {
    const binding = withdrawHostSession({ dataDir, session, by });
    if (binding) options.onWithdrawn(binding);
    logger.info("@session: withdrawn (@by)", describe(session), by);
  };

  // ------------------------------------------------------ the approval

  type Approval =
    | { ok: true; session: HostSessionFile }
    | { ok: false; status: number; error: string; description: string };

  const refused = (
    error: string,
    description: string,
    status = 400,
  ): Approval => ({ ok: false, status, error, description });

  /**
   * The checks every approval passes, whoever signed the credential: the
   * grant pending, the credential for the grant's key with its dates, no
   * longer than asked, the asked label, no tombstone, the per-address cap.
   */
  /** Why `grant` takes no approval now; undefined when it does. */
  const notPending = (grant: DeviceGrant, at: number): Approval | undefined => {
    if (Date.parse(grant.expiresAt) <= at) {
      return refused("expired_token", "The code has expired.");
    }
    if (grant.status !== "pending") {
      return refused("invalid_grant", `The code was already ${grant.status}.`);
    }
    return undefined;
  };

  const approve = async (
    grantId: string,
    credential: PowerhouseVerifiableCredential,
    through?: "renown",
  ): Promise<Approval> => {
    const read = readDeviceGrant(dataDir, grantId);
    const at = now();
    if (!read) return refused("invalid_grant", "No such grant.");
    const early = notPending(read, at);
    if (early) return early;
    const binding = credentialBindingOf(credential as CredentialLike);
    const issuer = parsePkhIssuer(credential.issuer.id);
    if (!binding || !issuer) {
      return refused("invalid_request", "The credential names no issuer.");
    }
    const check = await checkCredential(
      credential,
      {
        address: binding.address,
        chainId: binding.chainId,
        networkId: issuer.networkId,
        sessionDid: read.sessionDid,
      },
      at,
    );
    if (check !== "ok") {
      return refused(
        "invalid_request",
        check === "expired"
          ? "The credential has expired."
          : "The credential does not verify for this grant's session key.",
      );
    }
    // Read again after the wait: a Deny, another approval or a Renown login
    // that took the grant over in the meantime wins over this one.
    const grant = readDeviceGrant(dataDir, grantId);
    if (!grant) return refused("invalid_grant", "No such grant.");
    const late = notPending(grant, now());
    if (late) return late;
    if (grant.renownSession !== read.renownSession) {
      return refused(
        "invalid_grant",
        "The code was taken to Renown's console meanwhile: approve it there.",
      );
    }
    const end = Date.parse(credential.expirationDate ?? "");
    if (
      end > at + grant.days * DAY_MS + SKEW_MS ||
      end > at + HOST_SESSION_MAX_DAYS * DAY_MS + SKEW_MS
    ) {
      return refused(
        "invalid_request",
        `The credential runs longer than the ${grant.days} days asked (at most ${HOST_SESSION_MAX_DAYS}).`,
      );
    }
    const label = credential.credentialSubject.app;
    if (label !== grant.label && label !== RENOWN_APP_LABEL) {
      return refused(
        "invalid_request",
        `The credential signs the label "${label}", not "${grant.label}".`,
      );
    }
    const withdrawal = readCredentialWithdrawal({
      dataDir,
      id: credentialRecordId(binding),
    });
    if (
      withdrawal &&
      !(
        Date.parse(credential.issuanceDate) > Date.parse(withdrawal.withdrawnAt)
      )
    ) {
      return refused("access_denied", "This credential was withdrawn here.");
    }
    if (liveSessionsOf(binding.address).length >= SESSIONS_PER_ADDRESS) {
      return refused(
        "access_denied",
        `${shortAddress(credential.issuer.ethereumAddress)} holds ${SESSIONS_PER_ADDRESS} host sessions here: withdraw one first.`,
        429,
      );
    }
    const session = readHostSession({ dataDir, id: grant.sessionId });
    if (!session || session.did !== grant.sessionDid || session.credential) {
      return refused("invalid_grant", "The grant's session is gone.");
    }
    const approved: HostSessionFile = {
      ...session,
      credential: credential as CredentialLike,
      address: credential.issuer.ethereumAddress,
      chainId: binding.chainId,
      approvedAt: new Date(at).toISOString(),
      expiresAt: new Date(
        Math.min(end, at + grant.days * DAY_MS),
      ).toISOString(),
      ...(through ? { approvedThrough: through } : {}),
    };
    // Before the key can sign: what it signs is a host session's for good.
    markHostSessionKey(dataDir, approved);
    try {
      writeCredentialRecord({
        dataDir,
        credential: credential as CredentialLike,
        source: "host-session",
        writtenBy: "oauth",
      });
    } catch (error) {
      if (error instanceof CredentialWithdrawnError) {
        return refused("access_denied", error.message);
      }
      throw error;
    }
    writeHostSession(dataDir, approved);
    writeDeviceGrant(dataDir, {
      ...grant,
      status: "approved",
      address: approved.address,
    });
    if (through !== "renown") stopRenownPoll(grant.id);
    logger.info(
      "@session: approved by its user for @days days (client @client)",
      describe(approved),
      grant.days,
      grant.clientId,
    );
    return { ok: true, session: approved };
  };

  /** The grant a request names by its user code; answers the request when there is none. */
  const grantByCode = (
    req: IncomingMessage,
    res: ServerResponse,
    typed: unknown,
    page: boolean,
  ): DeviceGrant | undefined => {
    const code = normalizeUserCode(typed);
    const grant = code ? findDeviceGrant(dataDir, code, now()) : undefined;
    if (grant) return grant;
    if (missesLimited(clientOf(req))) {
      if (page) {
        send(
          res,
          429,
          messagePage(
            "Too many tries",
            "Wait a minute, then try the code again.",
          ),
          pageHeaders([]),
        );
      } else {
        oauthError(
          res,
          "slow_down",
          "Too many unknown codes: wait a minute.",
          429,
        );
      }
      return undefined;
    }
    if (page) {
      send(
        res,
        404,
        codeEntryPage({
          action: "device",
          error:
            "That code is unknown or has expired. Check it, or start again.",
        }),
        pageHeaders([]),
      );
    } else {
      oauthError(res, "invalid_grant", "Unknown or expired code.", 404);
    }
    return undefined;
  };

  /**
   * A consent action: POST only, with a nonce of the grant's page (or of
   * `device/pending`). The page's own buttons are also taken only from this
   * host's pages (`origin`): Origin, and Sec-Fetch-Site when sent; the Renown
   * button, which starts a poll and hands out a console session, needs the
   * Origin header too (`required`). An approval carries the person's
   * credential for the session's key, which no other site can forge, so a
   * client elsewhere (Connect) may post it (`any`).
   */
  const consentAction = async (
    req: IncomingMessage,
    res: ServerResponse,
    from: "any" | "own-page" | "own-page-required",
  ): Promise<
    { grant: DeviceGrant; params: Params; issuer: string } | undefined
  > => {
    const issuer = issuerFor(req, res);
    if (!issuer) return undefined;
    const page = fromForm(req);
    const origin = req.headers.origin;
    const site = req.headers["sec-fetch-site"];
    if (
      from !== "any" &&
      ((origin === undefined && from === "own-page-required") ||
        (origin !== undefined && origin !== new URL(issuer).origin) ||
        (site !== undefined && site !== "same-origin" && site !== "none"))
    ) {
      if (page) {
        send(
          res,
          403,
          messagePage(
            "Refused",
            "This request did not come from this host's own page.",
          ),
          pageHeaders([]),
        );
      } else {
        oauthError(res, "access_denied", "Cross-site request refused.", 403);
      }
      return undefined;
    }
    const params = await paramsOf(req);
    const grant = grantByCode(req, res, params.user_code, page);
    if (!grant) return undefined;
    if (!grantNonceHolds(grant, params.nonce, now())) {
      if (page) {
        send(
          res,
          403,
          messagePage(
            "Refused",
            "This page has expired: open the code's page again.",
          ),
          pageHeaders([]),
        );
      } else {
        oauthError(
          res,
          "access_denied",
          "Missing or expired nonce: read the grant's page or `device/pending` again.",
          403,
        );
      }
      return undefined;
    }
    return { grant, params, issuer };
  };

  // ------------------------------------------------------------- routes

  const deviceAuthorization = async (
    req: IncomingMessage,
    res: ServerResponse,
  ) => {
    const issuer = issuerFor(req, res);
    if (!issuer) return;
    const useless = options.sessionsUseless?.();
    if (useless) {
      oauthError(res, "invalid_scope", useless);
      return;
    }
    const client = clientOf(req);
    if (startsLimited(client)) {
      oauthError(
        res,
        "slow_down",
        "Too many device grants from this address: wait a minute.",
        429,
      );
      return;
    }
    const params = await paramsOf(req);
    const clientId = text(params.client_id);
    if (!clientId || clientId.length > CLIENT_ID_MAX) {
      oauthError(res, "invalid_request", "client_id is required.");
      return;
    }
    const scope = text(params.scope) ?? HOST_SESSION_SCOPE;
    if (scope.split(" ").some((s) => s !== "" && s !== HOST_SESSION_SCOPE)) {
      oauthError(
        res,
        "invalid_scope",
        `This host grants "${HOST_SESSION_SCOPE}" only.`,
      );
      return;
    }
    const label = text(params.ph_label) ?? clientId.slice(0, LABEL_MAX).trim();
    if (!validLabel(label)) {
      oauthError(
        res,
        "invalid_request",
        `ph_label: at most ${LABEL_MAX} printable characters, not starting with "did:".`,
      );
      return;
    }
    const days = daysOf(params.ph_days);
    if (days === undefined) {
      oauthError(
        res,
        "invalid_request",
        `ph_days: a whole number from 1 to ${maxDays}.`,
      );
      return;
    }
    const started = startGrant({
      client,
      label,
      days,
      clientId,
      grant: "device",
    });
    if (!started.ok) {
      oauthError(res, "slow_down", started.description, 429);
      return;
    }
    const { device } = oauthEndpoints(issuer);
    const shown = formatUserCode(started.grant.userCode);
    json(res, 200, {
      device_code: started.deviceCode,
      user_code: shown,
      verification_uri: device,
      verification_uri_complete: `${device}?user_code=${shown}`,
      expires_in: Math.floor(DEVICE_GRANT_TTL_MS / 1000),
      interval: DEVICE_POLL_INTERVAL_S,
    });
  };

  /** `ph_days`: the host's most when absent, undefined when out of range. */
  const daysOf = (value: unknown): number | undefined => {
    const raw = text(value);
    const days = raw === undefined ? maxDays : Number(raw);
    return Number.isInteger(days) && days >= 1 && days <= maxDays
      ? days
      : undefined;
  };

  /**
   * Starts a grant, either kind: the session's key (its file, approved by
   * nobody) and the pending grant, within the host's and the client's caps
   * of pending grants. One path for the device grant and the code grant.
   */
  const startGrant = (o: {
    client: string;
    label: string;
    days: number;
    /** What the consent page names as who asked. */
    clientId: string;
    grant: "device" | "code";
    code?: CodeGrantRequest;
  }):
    | { ok: true; grant: DeviceGrant; deviceCode: string }
    | { ok: false; description: string } => {
    sweep();
    const at = now();
    const waiting = listDeviceGrants(dataDir).filter(
      (grant) => grant.status === "pending" && Date.parse(grant.expiresAt) > at,
    );
    if (waiting.length >= MAX_PENDING_GRANTS) {
      return {
        ok: false,
        description:
          "This host holds too many pending grants: try again later.",
      };
    }
    if (
      waiting.filter((grant) => grant.requestedFrom === o.client).length >=
      PENDING_PER_CLIENT
    ) {
      return {
        ok: false,
        description: `This address holds ${PENDING_PER_CLIENT} pending grants: approve, deny or let them expire first.`,
      };
    }
    const taken = new Set(waiting.map((grant) => grant.userCode));
    let userCode = newUserCode();
    while (taken.has(userCode)) userCode = newUserCode();
    const session = newHostSession({
      label: o.label,
      clientId: o.code?.clientId ?? o.clientId,
      grant: o.grant,
      scope: HOST_SESSION_SCOPE,
      now: new Date(at),
    });
    writeHostSession(dataDir, session);
    const deviceCode = newDeviceCode();
    const grant = newDeviceGrant({
      deviceCode,
      userCode,
      sessionId: session.id,
      sessionDid: session.did,
      label: o.label,
      scope: HOST_SESSION_SCOPE,
      days: o.days,
      clientId: o.clientId,
      requestedFrom: o.client,
      now: at,
      ...(o.code ? { code: o.code } : {}),
    });
    writeDeviceGrant(dataDir, grant);
    logger.info(
      'Host session @id "@label": @kind grant asked by @client from @from',
      shortHostSessionId(session.id),
      o.label,
      o.grant === "code" ? "authorization code" : "device",
      o.clientId,
      o.client,
    );
    return { ok: true, grant, deviceCode };
  };

  /** Issues the token of an approved grant's session, once. */
  const issueToken = (
    res: ServerResponse,
    grant: DeviceGrant,
    session: HostSessionFile | undefined,
    unknown: string,
  ) => {
    const end = session ? hostSessionEnd(session) : undefined;
    if (!session?.credential || !session.address || !end) {
      oauthError(res, "invalid_grant", unknown);
      return;
    }
    const at = now();
    const minted = mintHostSessionToken(session.id);
    writeHostSession(dataDir, {
      ...session,
      tokens: [
        ...session.tokens,
        { hash: minted.hash, expiresAt: new Date(end).toISOString() },
      ],
    });
    logger.info(
      "@session: token issued to @client (@kind grant), ends @end",
      describe(session),
      grant.clientId,
      grant.code ? "authorization code" : "device",
      new Date(end).toISOString(),
    );
    json(res, 200, {
      access_token: minted.token,
      token_type: "Bearer",
      expires_in: Math.max(0, Math.floor((end - at) / 1000)),
      scope: session.scope,
      ph_session: session.id,
      ph_label: session.credential.credentialSubject.app,
      ph_address: session.address,
    });
  };

  const token = async (req: IncomingMessage, res: ServerResponse) => {
    const params = await paramsOf(req);
    const grantType = text(params.grant_type);
    if (!grantType) {
      oauthError(res, "invalid_request", "grant_type is required.");
      return;
    }
    if (grantType === AUTHORIZATION_CODE_GRANT) {
      codeToken(req, res, params);
      return;
    }
    if (grantType !== DEVICE_CODE_GRANT) {
      oauthError(
        res,
        "unsupported_grant_type",
        `This host issues tokens for the device grant (${DEVICE_CODE_GRANT}) and the authorization code grant only.`,
      );
      return;
    }
    const deviceCode = text(params.device_code);
    if (!deviceCode) {
      oauthError(res, "invalid_request", "device_code is required.");
      return;
    }
    const id = grantIdOf(deviceCode);
    const grant = readDeviceGrant(dataDir, id);
    // A code grant's code is no device code: its checks are the code's.
    if (!grant || grant.code) {
      oauthError(res, "invalid_grant", "Unknown or used device code.");
      return;
    }
    const clientId = text(params.client_id);
    if (clientId !== undefined && clientId !== grant.clientId) {
      oauthError(
        res,
        "invalid_grant",
        "The code was issued to another client.",
      );
      return;
    }
    const at = now();
    if (Date.parse(grant.expiresAt) <= at) {
      dropGrant(grant);
      oauthError(res, "expired_token", "The code has expired: start again.");
      return;
    }
    if (grant.status === "denied") {
      dropGrant(grant);
      oauthError(res, "access_denied", "The person denied the request.");
      return;
    }
    if (grant.status === "pending") {
      const poll = polls.get(id);
      if (poll && at - poll.at < poll.interval * 1000) {
        poll.interval += 5;
        poll.at = at;
        json(res, 400, {
          error: "slow_down",
          error_description: `Poll at most every ${poll.interval} seconds.`,
          interval: poll.interval,
        });
        return;
      }
      polls.set(id, {
        at,
        interval: poll?.interval ?? DEVICE_POLL_INTERVAL_S,
      });
      oauthError(
        res,
        "authorization_pending",
        "Not approved yet: poll again after the interval.",
      );
      return;
    }
    // Approved: the first poll takes the grant and is issued the token.
    const taken = takeDeviceGrant(dataDir, id);
    polls.delete(id);
    if (!taken) {
      oauthError(res, "invalid_grant", "Unknown or used device code.");
      return;
    }
    issueToken(
      res,
      taken,
      readHostSession({ dataDir, id: taken.sessionId }),
      "Unknown or used device code.",
    );
  };

  /**
   * The authorization code grant's token request (RFC 6749 4.1.3, RFC 7636
   * 4.5): the code taken once, then bound to the client it was issued to,
   * the exact redirect URI, the PKCE verifier and the resource. A code that
   * fails a check is spent, and its session withdrawn.
   */
  const codeToken = (
    req: IncomingMessage,
    res: ServerResponse,
    params: Params,
  ) => {
    const code = text(params.code);
    if (!code) {
      oauthError(res, "invalid_request", "code is required.");
      return;
    }
    const grant = takeDeviceGrant(dataDir, grantIdOf(code));
    if (!grant?.code?.issuedAt) {
      // Not taken (or not a code): it is no code here, or it was used.
      if (grant) writeDeviceGrant(dataDir, grant);
      oauthError(res, "invalid_grant", "Unknown, used or expired code.");
      return;
    }
    const session = readHostSession({ dataDir, id: grant.sessionId });
    const spent = (error: string, description: string) => {
      if (session) {
        if (session.credential && session.tokens.length === 0) {
          withdraw(session, "host");
        } else if (!session.credential) {
          removeHostSession({ dataDir, id: session.id });
        }
      }
      oauthError(res, error, description);
    };
    const request = grant.code;
    if (Date.parse(grant.expiresAt) <= now()) {
      spent("invalid_grant", "The code has expired: sign in again.");
      return;
    }
    if (text(params.client_id) !== request.clientId) {
      spent("invalid_grant", "The code was issued to another client.");
      return;
    }
    if (text(params.redirect_uri) !== request.redirectUri) {
      spent(
        "invalid_grant",
        "redirect_uri is not the one the code was asked for.",
      );
      return;
    }
    if (!verifierHolds(request.codeChallenge, params.code_verifier)) {
      spent(
        "invalid_grant",
        "code_verifier does not answer the code's S256 challenge.",
      );
      return;
    }
    const resource = text(params.resource);
    if (resource !== undefined && resource !== request.resource) {
      const issuer = issuerOf(req, {
        publicOrigin: options.publicOrigin,
        basePath: options.basePath,
      });
      if (!issuer || resourceRefusal(resource, issuer) || request.resource) {
        spent(
          "invalid_target",
          "resource is not the one the code was asked for, on this host.",
        );
        return;
      }
    }
    issueToken(res, grant, session, "The code's session is gone.");
  };

  const revoke = async (req: IncomingMessage, res: ServerResponse) => {
    const params = await paramsOf(req);
    const presented = text(params.token);
    if (!presented) {
      oauthError(res, "invalid_request", "token is required.");
      return;
    }
    // RFC 7009 2.2: an unknown token is answered as a revoked one.
    const parsed = parseHostSessionToken(presented);
    const session = parsed && readHostSession({ dataDir, id: parsed.id });
    if (session && matchHostSessionToken(session, parsed.secret)) {
      withdraw(session, "request");
    }
    send(res, 200, "", { "cache-control": "no-store" });
  };

  const devicePage = (req: IncomingMessage, res: ServerResponse) => {
    const issuer = issuerFor(req, res);
    if (!issuer) return;
    const typed = queryOf(req).get("user_code");
    if (typed === null || typed.trim() === "") {
      send(res, 200, codeEntryPage({ action: "device" }), pageHeaders([]));
      return;
    }
    const grant = grantByCode(req, res, typed, true);
    if (!grant) return;
    if (grant.status !== "pending") {
      send(
        res,
        200,
        messagePage(
          grant.status === "approved" ? "Already approved" : "Denied",
          grant.status === "approved"
            ? "This code was approved. There is nothing left to do here."
            : "This code was denied. The device or tool asking gets no token.",
          grant.status === "approved" ? "done" : "closed",
        ),
        pageHeaders([]),
      );
      return;
    }
    const at = now();
    send(
      res,
      200,
      consentPage({
        issuer,
        hostDid: options.hostDid(),
        grant,
        nonce: grantNonce(grant, at),
        endsAt: at + grant.days * DAY_MS,
        renownAction: "device/renown",
        denyAction: "device/deny",
      }),
      pageHeaders([renownOrigin]),
    );
  };

  const pending = (req: IncomingMessage, res: ServerResponse) => {
    const issuer = issuerFor(req, res);
    if (!issuer) return;
    const grant = grantByCode(req, res, queryOf(req).get("user_code"), false);
    if (!grant) return;
    const at = now();
    json(res, 200, {
      user_code: formatUserCode(grant.userCode),
      status: grant.status,
      host: issuer,
      host_did: options.hostDid() ?? null,
      session_did: grant.sessionDid,
      label: grant.label,
      scope: grant.scope,
      may: "sign document changes as you; no administration",
      days: grant.days,
      ends_at: new Date(at + grant.days * DAY_MS).toISOString(),
      client_id: grant.clientId,
      // An MCP client's sign-in: where the person's browser returns.
      ...(grant.code ? { returns_to: redirectHostOf(grant) } : {}),
      requested_from: grant.requestedFrom,
      requested_at: grant.requestedAt,
      expires_at: grant.expiresAt,
      warning:
        "Approve only a code you started yourself in the last 10 minutes.",
      nonce: grantNonce(grant, at),
    });
  };

  const approveRoute = async (req: IncomingMessage, res: ServerResponse) => {
    const action = await consentAction(req, res, "any");
    if (!action) return;
    let value: unknown = action.params.credential;
    if (typeof value === "string") {
      try {
        value = JSON.parse(value) as unknown;
      } catch {
        value = undefined;
      }
    }
    const credential = expandCarriedCredential(value);
    if (!credential) {
      oauthError(res, "invalid_request", "No credential to approve with.");
      return;
    }
    const result = await approve(action.grant.id, credential);
    if (!result.ok) {
      oauthError(res, result.error, result.description, result.status);
      return;
    }
    json(res, 200, {
      status: "approved",
      session: result.session.id,
      address: result.session.address,
      expires_at: result.session.expiresAt,
    });
  };

  const denyRoute = async (req: IncomingMessage, res: ServerResponse) => {
    const action = await consentAction(req, res, "own-page");
    if (!action) return;
    const { grant, issuer } = action;
    if (grant.status === "pending") {
      writeDeviceGrant(dataDir, { ...grant, status: "denied" });
      stopRenownPoll(grant.id);
      logger.info(
        'Host session @id "@label": grant denied',
        shortHostSessionId(grant.sessionId),
        grant.label,
      );
    }
    // An MCP client's sign-in: the browser goes back to it with the answer.
    if (fromForm(req) && grant.code) {
      dropGrant(grant);
      redirectCode(res, grant.code, issuer, {
        error: "access_denied",
        error_description: "The person denied the request.",
      });
      return;
    }
    if (fromForm(req)) {
      send(
        res,
        200,
        messagePage(
          "Denied",
          "The device or tool that asked gets no token. You can close this page.",
        ),
        pageHeaders([]),
      );
    } else {
      json(res, 200, { status: "denied" });
    }
  };

  const renownRoute = async (req: IncomingMessage, res: ServerResponse) => {
    const action = await consentAction(req, res, "own-page-required");
    if (!action) return;
    const { grant, issuer } = action;
    if (grant.status !== "pending") {
      oauthError(res, "invalid_grant", `The code was already ${grant.status}.`);
      return;
    }
    // A new poll for this grant replaces its old one; others count.
    const client = clientOf(req);
    const others = [...renownPolls].filter(([id]) => id !== grant.id);
    if (
      others.length >= RENOWN_POLLS ||
      others.filter(([, poll]) => poll.client === client).length >=
        RENOWN_POLLS_PER_CLIENT
    ) {
      oauthError(
        res,
        "slow_down",
        "Too many Renown approvals are waiting: finish one, or wait for it to expire.",
        429,
      );
      return;
    }
    const consoleSession = randomUUID();
    writeDeviceGrant(dataDir, { ...grant, renownSession: consoleSession });
    stopRenownPoll(grant.id);
    const abort = new AbortController();
    renownPolls.set(grant.id, { abort, client });
    void (async () => {
      try {
        const result = await pollConsoleCredential({
          sessionId: consoleSession,
          sessionDid: grant.sessionDid,
          renownUrl: options.renownUrl,
          timeoutMs: Math.max(0, Date.parse(grant.expiresAt) - now()),
          signal: abort.signal,
        });
        if (result.status !== "ready") return;
        const approval = await approve(grant.id, result.credential, "renown");
        if (!approval.ok) {
          const held = readDeviceGrant(dataDir, grant.id);
          if (held?.status === "pending") {
            writeDeviceGrant(dataDir, { ...held, status: "denied" });
          }
          logger.warn(
            'Host session @id "@label": Renown\'s credential is refused: @reason',
            shortHostSessionId(grant.sessionId),
            grant.label,
            approval.description,
          );
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          logger.warn(
            "Host session @id: asking Renown failed: @error",
            shortHostSessionId(grant.sessionId),
            String(error),
          );
        }
      } finally {
        if (renownPolls.get(grant.id)?.abort === abort) {
          renownPolls.delete(grant.id);
        }
      }
    })();
    const location = consoleApprovalUrl({
      renownUrl: options.renownUrl,
      sessionId: consoleSession,
      did: grant.sessionDid,
      label: grant.label,
      host: issuer,
      expiresInDays: grant.days,
    });
    send(res, 303, "", { location, "cache-control": "no-store" });
  };

  // ------------------------------------------- the authorization code grant

  /** Sends the browser back to the client (RFC 6749 4.1.2), naming the issuer (RFC 9207). */
  const redirectCode = (
    res: ServerResponse,
    request: Pick<CodeGrantRequest, "redirectUri" | "state">,
    issuer: string,
    params: Record<string, string>,
  ) => {
    send(res, 302, "", {
      location: withQuery(request.redirectUri, {
        ...params,
        state: request.state,
        iss: issuer,
      }),
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    });
  };

  /** A page saying why the request cannot go back to its client. */
  const authorizePage = (res: ServerResponse, status: number, why: string) =>
    send(res, status, messagePage("Cannot sign in", why), pageHeaders([]));

  /** Where a code grant's page checks back: approved, it goes on to the client. */
  const continueUrlOf = (issuer: string, grant: DeviceGrant, at: number) =>
    withQuery(oauthEndpoints(issuer).authorizeContinue, {
      user_code: formatUserCode(grant.userCode),
      nonce: grantNonce(grant, at),
    });

  const codeConsentPage = (
    res: ServerResponse,
    issuer: string,
    grant: DeviceGrant,
    notice?: string,
  ) => {
    const at = now();
    send(
      res,
      200,
      consentPage({
        issuer,
        hostDid: options.hostDid(),
        grant,
        nonce: grantNonce(grant, at),
        endsAt: at + grant.days * DAY_MS,
        renownAction: oauthEndpoints(issuer).deviceRenown,
        denyAction: oauthEndpoints(issuer).deviceDeny,
        continueUrl: continueUrlOf(issuer, grant, at),
        ...(notice ? { notice } : {}),
      }),
      pageHeaders([renownOrigin]),
    );
  };

  /**
   * `authorize` (RFC 6749 4.1.1): a registered client's request, with PKCE
   * S256 and a resource on this host, starts a grant on the device grant's
   * object and shows its consent page. An unknown client or redirect URI is
   * answered here; every other refusal goes back to the client.
   */
  const authorize = (req: IncomingMessage, res: ServerResponse) => {
    const issuer = issuerFor(req, res);
    if (!issuer) return;
    const query = queryOf(req);
    const client = readOAuthClient(dataDir, query.get("client_id"), now());
    if (!client) {
      authorizePage(
        res,
        400,
        "This app is not registered here, or its registration expired: let it register again.",
      );
      return;
    }
    const asked = query.get("redirect_uri");
    const redirectUri =
      asked ??
      (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
    if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
      authorizePage(
        res,
        400,
        "The app asked to return somewhere it did not register: nothing was sent to it.",
      );
      return;
    }
    const state = query.get("state") ?? undefined;
    const fail = (error: string, description: string) =>
      redirectCode(res, { redirectUri, state }, issuer, {
        error,
        error_description: description,
      });
    if (query.get("response_type") !== "code") {
      fail(
        "unsupported_response_type",
        "This host answers response_type=code only.",
      );
      return;
    }
    const useless = options.sessionsUseless?.();
    if (useless) {
      fail("access_denied", useless);
      return;
    }
    const challenge = query.get("code_challenge");
    if (!challenge) {
      fail(
        "invalid_request",
        "PKCE is required: send code_challenge with code_challenge_method=S256.",
      );
      return;
    }
    if (query.get("code_challenge_method") !== "S256") {
      fail("invalid_request", "code_challenge_method: S256 only.");
      return;
    }
    if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
      fail("invalid_request", "code_challenge is no S256 challenge.");
      return;
    }
    const scope = query.get("scope");
    if (
      scope &&
      scope.split(" ").some((s) => s !== "" && s !== HOST_SESSION_SCOPE)
    ) {
      fail("invalid_scope", `This host grants "${HOST_SESSION_SCOPE}" only.`);
      return;
    }
    const resources = query.getAll("resource");
    const refusal =
      resources.length > 1
        ? "Name one resource."
        : resources[0] !== undefined
          ? resourceRefusal(resources[0], issuer)
          : undefined;
    if (refusal) {
      fail("invalid_target", refusal);
      return;
    }
    const days = daysOf(query.get("ph_days") ?? undefined);
    if (days === undefined) {
      fail("invalid_request", `ph_days: a whole number from 1 to ${maxDays}.`);
      return;
    }
    const from = clientOf(req);
    if (startsLimited(from)) {
      fail(
        "temporarily_unavailable",
        "Too many sign-ins from this address: wait a minute.",
      );
      return;
    }
    const asLabel = (value: string | undefined) => {
      const label = value?.slice(0, LABEL_MAX).trim();
      return label && validLabel(label) ? label : undefined;
    };
    const label =
      asLabel(query.get("ph_label") ?? undefined) ??
      asLabel(client.clientName) ??
      DEFAULT_CODE_LABEL;
    const started = startGrant({
      client: from,
      label,
      days,
      clientId: client.clientName
        ? `${client.clientName} (${client.clientId})`
        : client.clientId,
      grant: "code",
      code: {
        clientId: client.clientId,
        redirectUri,
        codeChallenge: challenge,
        ...(state !== undefined ? { state } : {}),
        ...(resources[0] !== undefined ? { resource: resources[0] } : {}),
      },
    });
    if (!started.ok) {
      fail("temporarily_unavailable", started.description);
      return;
    }
    codeConsentPage(res, issuer, started.grant);
  };

  /**
   * Where a code grant's consent page checks back: once the grant is
   * approved its code is issued, once, and the browser goes to the client
   * with it; denied or expired, with the error; else the page again.
   */
  const authorizeContinue = (req: IncomingMessage, res: ServerResponse) => {
    const issuer = issuerFor(req, res);
    if (!issuer) return;
    const query = queryOf(req);
    const grant = grantByCode(req, res, query.get("user_code"), true);
    if (!grant) return;
    if (!grant.code || !grantNonceHolds(grant, query.get("nonce"), now())) {
      authorizePage(
        res,
        403,
        "This page has expired: sign in again from the app.",
      );
      return;
    }
    if (grant.code.issuedAt) {
      send(
        res,
        200,
        messagePage(
          "Signed in",
          "The app was sent its code. You can close this page.",
          "done",
        ),
        pageHeaders([]),
      );
      return;
    }
    if (grant.status === "denied") {
      dropGrant(grant);
      redirectCode(res, grant.code, issuer, {
        error: "access_denied",
        error_description: "The person denied the request.",
      });
      return;
    }
    if (grant.status === "pending") {
      codeConsentPage(
        res,
        issuer,
        grant,
        "Not approved yet: approve it with Renown or `ph token approve`; this page checks again by itself.",
      );
      return;
    }
    // Approved: whoever takes the grant issues its code, once.
    const taken = takeDeviceGrant(dataDir, grant.id);
    if (!taken?.code) {
      send(
        res,
        200,
        messagePage(
          "Signed in",
          "The app was sent its code. You can close this page.",
          "done",
        ),
        pageHeaders([]),
      );
      return;
    }
    const code = newDeviceCode();
    const at = now();
    writeDeviceGrant(dataDir, {
      ...taken,
      id: grantIdOf(code),
      expiresAt: new Date(at + AUTHORIZATION_CODE_TTL_MS).toISOString(),
      code: { ...taken.code, issuedAt: new Date(at).toISOString() },
    });
    logger.info(
      'Host session @id "@label": authorization code issued to @client',
      shortHostSessionId(taken.sessionId),
      taken.label,
      taken.clientId,
    );
    redirectCode(res, taken.code, issuer, { code });
  };

  /** Dynamic client registration (RFC 7591): public clients, loopback or https redirects. */
  const register = async (req: IncomingMessage, res: ServerResponse) => {
    const issuer = issuerFor(req, res);
    if (!issuer) return;
    const from = clientOf(req);
    if (registrationsLimited(from)) {
      oauthError(
        res,
        "temporarily_unavailable",
        "Too many registrations from this address: wait a minute.",
        429,
      );
      return;
    }
    const metadata = await paramsOf(req);
    const uris = metadata.redirect_uris;
    if (!Array.isArray(uris) || uris.length === 0) {
      oauthError(res, "invalid_redirect_uri", "redirect_uris is required.");
      return;
    }
    if (uris.length > MAX_REDIRECT_URIS) {
      oauthError(
        res,
        "invalid_client_metadata",
        `At most ${MAX_REDIRECT_URIS} redirect URIs.`,
      );
      return;
    }
    for (const uri of uris) {
      const refused = redirectUriRefusal(uri);
      if (refused) {
        oauthError(res, "invalid_redirect_uri", `${refused}.`);
        return;
      }
    }
    const method = metadata.token_endpoint_auth_method;
    if (method !== undefined && method !== "none") {
      oauthError(
        res,
        "invalid_client_metadata",
        'Public clients only: token_endpoint_auth_method "none".',
      );
      return;
    }
    const listed = (value: unknown, needed: string) =>
      value === undefined ||
      (Array.isArray(value) && (value as unknown[]).includes(needed));
    if (
      !listed(metadata.grant_types, "authorization_code") ||
      !listed(metadata.response_types, "code")
    ) {
      oauthError(
        res,
        "invalid_client_metadata",
        "This host registers clients of the authorization code grant (response_type code).",
      );
      return;
    }
    const at = now();
    const clients = listOAuthClients(dataDir, at);
    if (
      clients.length >= MAX_CLIENTS ||
      clients.filter((client) => client.registeredFrom === from).length >=
        CLIENTS_PER_ADDRESS
    ) {
      oauthError(
        res,
        "temporarily_unavailable",
        "This host keeps no more registrations from this address: try again later.",
        429,
      );
      return;
    }
    const name = clientNameOf(metadata.client_name);
    const client: OAuthClient = newOAuthClient({
      ...(name ? { clientName: name } : {}),
      redirectUris: uris as string[],
      registeredFrom: from,
      now: at,
    });
    writeOAuthClient(dataDir, client);
    logger.info(
      'OAuth client @client "@name" registered from @from',
      client.clientId,
      name ?? "",
      from,
    );
    json(res, 201, {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(at / 1000),
      ...(name ? { client_name: name } : {}),
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      scope: HOST_SESSION_SCOPE,
    });
  };

  const sessionView = (session: HostSessionFile) => ({
    id: session.id,
    label: session.credential?.credentialSubject.app ?? session.label,
    scope: session.scope,
    grant: session.grant,
    client_id: session.clientId,
    created_at: session.createdAt,
    approved_at: session.approvedAt ?? null,
    expires_at: session.expiresAt ?? null,
    last_used_at: readHostSessionLastUsed({ dataDir, id: session.id }) ?? null,
  });

  const callerOf = (
    res: ServerResponse,
    user: RouteUser | undefined,
  ): RouteUser | undefined => {
    if (!user) {
      oauthError(
        res,
        "invalid_token",
        "Sign the request with your own session's bearer to see your host sessions.",
        401,
      );
    }
    return user;
  };

  const handles = [
    scope.nodeRoute({
      method: "POST",
      path: "device_authorization",
      auth: "public",
      handler: guarded(deviceAuthorization),
    }),
    scope.nodeRoute({
      method: "POST",
      path: "token",
      auth: "public",
      handler: guarded(token),
    }),
    scope.nodeRoute({
      method: "POST",
      path: "revoke",
      auth: "public",
      handler: guarded(revoke),
    }),
    scope.nodeRoute({
      method: "GET",
      path: "device",
      auth: "public",
      handler: guarded(devicePage),
    }),
    scope.nodeRoute({
      method: "GET",
      path: "device/pending",
      auth: "public",
      handler: guarded(pending),
    }),
    scope.nodeRoute({
      method: "POST",
      path: "device/approve",
      auth: "public",
      handler: guarded(approveRoute),
    }),
    scope.nodeRoute({
      method: "POST",
      path: "device/deny",
      auth: "public",
      handler: guarded(denyRoute),
    }),
    scope.nodeRoute({
      method: "POST",
      path: "device/renown",
      auth: "public",
      handler: guarded(renownRoute),
    }),
    // The authorization code grant, for MCP clients.
    scope.nodeRoute({
      method: "GET",
      path: "authorize",
      auth: "public",
      handler: guarded(authorize),
    }),
    scope.nodeRoute({
      method: "GET",
      path: "authorize/continue",
      auth: "public",
      handler: guarded(authorizeContinue),
    }),
    scope.nodeRoute({
      method: "POST",
      path: "register",
      auth: "public",
      handler: guarded(register),
    }),
    // A person's own sessions: a bearer they signed themselves.
    scope.nodeRoute({
      method: "GET",
      path: "sessions",
      auth: "renown-optional",
      handler: guarded((_req, res, ctx) => {
        const user = callerOf(res, ctx.user);
        if (!user) return;
        json(res, 200, {
          sessions: liveSessionsOf(user.address).map(sessionView),
        });
      }),
    }),
    scope.nodeRoute({
      method: "POST",
      path: "sessions/:id/withdraw",
      auth: "renown-optional",
      handler: guarded((_req, res, ctx) => {
        const user = callerOf(res, ctx.user);
        if (!user) return;
        const session = readHostSession({ dataDir, id: ctx.params.id });
        if (
          !session ||
          session.address?.toLowerCase() !== user.address.toLowerCase()
        ) {
          oauthError(
            res,
            "invalid_request",
            "You hold no such session here.",
            404,
          );
          return;
        }
        withdraw(session, "request");
        json(res, 200, { withdrawn: session.id });
      }),
    }),
  ];

  return {
    dispose() {
      for (const handle of handles) handle.dispose();
      for (const poll of renownPolls.values()) poll.abort.abort();
      renownPolls.clear();
    },
  };
}

type NodeHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  ctx: { params: Record<string, string>; user: RouteUser | undefined },
) => void | Promise<void>;

/** A malformed body is the client's error; anything else the route service logs. */
function guarded(handler: NodeHandler): NodeHandler {
  return async (req, res, ctx) => {
    try {
      await handler(req, res, ctx);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        oauthError(res, "invalid_request", "The body is too large.", 413);
      } else if (error instanceof SyntaxError) {
        oauthError(res, "invalid_request", "The body is not JSON.");
      } else {
        throw error;
      }
    }
  };
}

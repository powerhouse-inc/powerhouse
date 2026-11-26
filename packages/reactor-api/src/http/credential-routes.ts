import {
  credentialBindingOf,
  credentialRecordId,
  CredentialWithdrawnError,
  listCredentialRecords,
  parsePkhIssuer,
  pruneCredentialRecords,
  readCredentialRecord,
  withdrawCredentialRecords,
  writeCredentialRecord,
  writeCredentialWithdrawal,
  type CredentialBinding,
} from "@powerhousedao/shared/clis/credential-records";
import type { IHttpScope } from "@powerhousedao/shared/processors";
import {
  checkCredentialFor,
  expandCarriedCredential,
  recoverCredentialRecordRequestSigner,
  type CredentialRecordRequest,
} from "@renown/sdk/node";
import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { BodyTooLargeError, readBody, writeError } from "./node-response.js";

/**
 * Enrolment for a caller with no file access to this host (hosted Connect with
 * a browser pseudonym): a request signed by the address's own key makes the
 * host keep, or withdraw, a credential's record in its data folder. Public
 * routes, outside the authenticated-caller floor: the caller has no accepted
 * credential yet. The host names itself and hands out single-use nonces.
 */

export interface CredentialRoutesOptions {
  dataDir: string;
  /** The host's own key (did:key), read per request; none: the routes answer 503. */
  hostDid: () => string | undefined;
  /** A record was withdrawn: close what holds it. */
  onWithdrawn: (binding: CredentialBinding) => void;
  now?: () => number;
}

const NONCE_TTL_MS = 5 * 60_000;
const MAX_NONCES = 10_000;
const MAX_BODY_BYTES = 16 * 1024;
const ENROLMENTS_PER_MINUTE = 30;
const RECORDS_PER_ADDRESS = 50;
const ENROLLED_RECORDS = 10_000;

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.setHeader("content-length", Buffer.byteLength(text));
  res.end(text);
}

/** The requesting address: the first forwarded for, else the socket's. */
export function clientOf(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
    ?.split(",")[0]
    ?.trim();
  return first || req.socket.remoteAddress || "unknown";
}

async function bodyOf(req: IncomingMessage): Promise<unknown> {
  const raw = await readBody(req, MAX_BODY_BYTES);
  return JSON.parse(raw.toString("utf8")) as unknown;
}

function asRequest(value: unknown): CredentialRecordRequest | undefined {
  const r = value as Partial<CredentialRecordRequest> | undefined;
  return r &&
    (r.action === "enrol" || r.action === "withdraw") &&
    typeof r.host === "string" &&
    typeof r.nonce === "string" &&
    typeof r.sessionDid === "string" &&
    typeof r.credentialId === "string"
    ? (r as CredentialRecordRequest)
    : undefined;
}

export function mountCredentialRoutes(
  scope: IHttpScope,
  options: CredentialRoutesOptions,
): { dispose(): void } {
  const now = options.now ?? Date.now;
  const nonces = new Map<string, number>();
  const rates = new Map<string, { start: number; count: number }>();

  const issueNonce = (): { nonce: string; expiresAt: number } => {
    const at = now();
    // Oldest first: drop the expired, and the oldest past the cap.
    for (const [nonce, expires] of nonces) {
      if (expires > at && nonces.size < MAX_NONCES) break;
      nonces.delete(nonce);
    }
    const nonce = randomBytes(16).toString("hex");
    const expiresAt = at + NONCE_TTL_MS;
    nonces.set(nonce, expiresAt);
    return { nonce, expiresAt };
  };

  // Single use: a replayed or late request finds it gone.
  const takeNonce = (nonce: string): boolean => {
    const expires = nonces.get(nonce);
    nonces.delete(nonce);
    return expires !== undefined && expires > now();
  };

  const limited = (client: string): boolean => {
    const at = now();
    const rate = rates.get(client);
    if (!rate || at - rate.start >= 60_000) {
      if (rates.size >= MAX_NONCES) rates.clear();
      rates.set(client, { start: at, count: 1 });
      return false;
    }
    rate.count++;
    return rate.count > ENROLMENTS_PER_MINUTE;
  };

  const verifiedRequest = async (
    res: ServerResponse,
    body: { request?: unknown; signature?: unknown },
    action: CredentialRecordRequest["action"],
    chainId: number,
  ) => {
    const host = options.hostDid();
    if (!host) {
      json(res, 503, { error: "This host has no key to name itself with" });
      return undefined;
    }
    const request = asRequest(body.request);
    if (!request || request.action !== action) {
      json(res, 400, { error: `Expected a signed "${action}" request` });
      return undefined;
    }
    if (request.host !== host) {
      json(res, 400, { error: "The request names another host" });
      return undefined;
    }
    if (!takeNonce(request.nonce)) {
      json(res, 400, {
        error: "Unknown or used nonce: ask for a new challenge",
      });
      return undefined;
    }
    const signer =
      typeof body.signature === "string"
        ? await recoverCredentialRecordRequestSigner(
            request,
            body.signature,
            chainId,
          )
        : undefined;
    if (!signer) {
      json(res, 400, { error: "The request's signature does not verify" });
      return undefined;
    }
    return { request, signer: signer.toLowerCase() };
  };

  const enrol = async (req: IncomingMessage, res: ServerResponse) => {
    if (limited(clientOf(req))) {
      json(res, 429, { error: "Too many enrolments: try again in a minute" });
      return;
    }
    const body = (await bodyOf(req)) as {
      credential?: unknown;
      request?: unknown;
      signature?: unknown;
    };
    const credential = expandCarriedCredential(body.credential);
    const binding = credential ? credentialBindingOf(credential) : undefined;
    if (!credential || !binding) {
      json(res, 400, { error: "No credential to enrol" });
      return;
    }
    const verified = await verifiedRequest(res, body, "enrol", binding.chainId);
    if (!verified) return;
    const { request, signer } = verified;
    if (
      signer !== binding.address ||
      request.sessionDid !== binding.sessionDid ||
      request.credentialId !== credential.id
    ) {
      json(res, 403, {
        error: "Only the credential's issuer may enrol it, for its own session",
      });
      return;
    }
    const check = await checkCredentialFor(
      credential,
      {
        ...binding,
        networkId: parsePkhIssuer(credential.issuer.id)?.networkId ?? "",
      },
      now(),
    );
    if (check !== "ok") {
      json(res, 400, { error: `The credential does not verify: ${check}` });
      return;
    }
    const id = credentialRecordId(binding);
    if (!readCredentialRecord({ dataDir: options.dataDir, id })) {
      let records = listCredentialRecords({ dataDir: options.dataDir });
      if (records.length >= ENROLLED_RECORDS) {
        pruneCredentialRecords({ dataDir: options.dataDir });
        records = listCredentialRecords({ dataDir: options.dataDir });
      }
      if (
        records.length >= ENROLLED_RECORDS ||
        records.filter((r) => r.address === binding.address).length >=
          RECORDS_PER_ADDRESS
      ) {
        json(res, 507, { error: "This host keeps no more records" });
        return;
      }
    }
    try {
      writeCredentialRecord({
        dataDir: options.dataDir,
        credential,
        source: "enrolled",
        writtenBy: "enrolment",
      });
    } catch (error) {
      if (error instanceof CredentialWithdrawnError) {
        json(res, 409, { error: error.message });
        return;
      }
      throw error;
    }
    json(res, 201, { id, expiresAt: credential.expirationDate });
  };

  const withdraw = async (req: IncomingMessage, res: ServerResponse) => {
    if (limited(clientOf(req))) {
      json(res, 429, { error: "Too many requests: try again in a minute" });
      return;
    }
    const body = (await bodyOf(req)) as {
      request?: unknown;
      signature?: unknown;
      chainId?: unknown;
    };
    const chainId = Number(body.chainId);
    if (!Number.isInteger(chainId) || chainId <= 0) {
      json(res, 400, { error: "No chain id" });
      return;
    }
    const verified = await verifiedRequest(res, body, "withdraw", chainId);
    if (!verified) return;
    const { request, signer } = verified;
    const ids =
      request.sessionDid === "*"
        ? listCredentialRecords({ dataDir: options.dataDir })
            .filter((r) => r.address === signer && r.chainId === chainId)
            .map((r) => r.id)
        : [
            credentialRecordId({
              address: signer,
              chainId,
              sessionDid: request.sessionDid,
            }),
          ];
    const withdrawn = withdrawCredentialRecords({
      dataDir: options.dataDir,
      ids,
      by: "request",
    });
    // A session this host has no record of is withdrawn here all the same.
    if (request.sessionDid !== "*" && withdrawn.length === 0) {
      withdrawn.push(
        writeCredentialWithdrawal({
          dataDir: options.dataDir,
          binding: { address: signer, chainId, sessionDid: request.sessionDid },
          by: "request",
        }),
      );
    }
    for (const w of withdrawn) options.onWithdrawn(w);
    json(res, 200, { withdrawn: withdrawn.map((w) => w.id) });
  };

  const guarded =
    (handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>) =>
    async (req: IncomingMessage, res: ServerResponse) => {
      try {
        await handler(req, res);
      } catch (error) {
        if (error instanceof BodyTooLargeError) {
          writeError(res, 413, error.message);
        } else if (error instanceof SyntaxError) {
          writeError(res, 400, "The body is not JSON");
        } else {
          throw error;
        }
      }
    };

  const handles = [
    scope.nodeRoute({
      method: "GET",
      path: "challenge",
      auth: "public",
      handler: (_req, res) => {
        const host = options.hostDid();
        if (!host) {
          json(res, 503, { error: "This host has no key to name itself with" });
          return;
        }
        const { nonce, expiresAt } = issueNonce();
        json(res, 200, {
          host,
          nonce,
          expiresAt: new Date(expiresAt).toISOString(),
        });
      },
    }),
    scope.nodeRoute({
      method: "POST",
      path: "enrol",
      auth: "public",
      handler: guarded(enrol),
    }),
    scope.nodeRoute({
      method: "POST",
      path: "withdraw",
      auth: "public",
      handler: guarded(withdraw),
    }),
  ];
  return {
    dispose() {
      for (const handle of handles) handle.dispose();
    },
  };
}

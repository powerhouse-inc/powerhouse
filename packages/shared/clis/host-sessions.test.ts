import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  listCredentialRecords,
  writeCredentialRecord,
  type CredentialLike,
} from "./credential-records.js";
import {
  HOST_SESSION_SCOPE,
  hostSessionEnd,
  hostSessionFile,
  hostSessionOfKey,
  hostSessionSecretHash,
  hostSessionTokenOf,
  hostSessionUsedFile,
  isHostSessionToken,
  listHostSessions,
  markHostSessionKey,
  matchHostSessionToken,
  mintHostSessionToken,
  newHostSession,
  noteHostSessionUsed,
  parseHostSessionToken,
  readHostSession,
  readHostSessionLastUsed,
  removeHostSession,
  shortHostSessionId,
  writeHostSession,
} from "./host-sessions.js";
import { fileAccessList } from "./owner-only.js";
import { didOfP256Jwk } from "./sessions.js";

let root: string;
let dataDir: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-host-sessions-"));
  dataDir = path.join(root, "store");
  fs.mkdirSync(dataDir, { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function expectOwnerOnly(file: string) {
  if (process.platform === "win32") {
    expect(fileAccessList(file)).toHaveLength(1);
  } else {
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  }
}

const session = () =>
  newHostSession({ label: "billing", clientId: "curl", grant: "device" });

describe("host session files", () => {
  it("makes a labelled session with a key of its own, approved by nobody", () => {
    const made = session();
    expect(made.id).toMatch(/^[0-9a-f]{32}$/);
    expect(made.did).toBe(didOfP256Jwk(made.key.publicKey));
    expect(made).toMatchObject({
      format: "ph-host-session",
      version: 1,
      label: "billing",
      clientId: "curl",
      grant: "device",
      scope: HOST_SESSION_SCOPE,
      tokens: [],
    });
    expect(made.credential).toBeUndefined();
    expect(session().id).not.toBe(made.id);
  });

  it("keeps a session owner-only in the store's host-sessions folder", () => {
    const made = session();
    writeHostSession(dataDir, made);
    const file = hostSessionFile(dataDir, made.id);
    expect(file).toBe(
      path.join(dataDir, ".ph", "host-sessions", `${made.id}.json`),
    );
    expectOwnerOnly(file);
    expect(readHostSession({ dataDir, id: made.id })).toEqual(made);
  });

  it("lists sessions oldest first and skips what is not one", () => {
    const first = newHostSession({
      label: "a",
      clientId: "c",
      grant: "device",
      now: new Date("2026-11-01T00:00:00Z"),
    });
    const second = newHostSession({
      label: "b",
      clientId: "c",
      grant: "device",
      now: new Date("2026-11-02T00:00:00Z"),
    });
    writeHostSession(dataDir, second);
    writeHostSession(dataDir, first);
    const dir = path.dirname(hostSessionFile(dataDir, first.id));
    fs.writeFileSync(path.join(dir, "notes.txt"), "x");
    fs.writeFileSync(path.join(dir, `${"0".repeat(32)}.json`), "{");
    expect(listHostSessions({ dataDir }).map((s) => s.id)).toEqual([
      first.id,
      second.id,
    ]);
    removeHostSession({ dataDir, id: first.id });
    expect(readHostSession({ dataDir, id: first.id })).toBeUndefined();
    expect(listHostSessions({ dataDir }).map((s) => s.id)).toEqual([second.id]);
  });

  it("reads nothing for an id that is not one", () => {
    expect(
      readHostSession({ dataDir, id: "../credentials/x" }),
    ).toBeUndefined();
    expect(() => hostSessionFile(dataDir, "nope")).toThrow(
      /no host session id/,
    );
  });

  it("ends with its own end or its credential's, whichever is first", () => {
    const credential = {
      expirationDate: "2026-12-01T00:00:00.000Z",
    } as CredentialLike;
    expect(hostSessionEnd({})).toBeUndefined();
    expect(hostSessionEnd({ credential })).toBe(
      Date.parse("2026-12-01T00:00:00Z"),
    );
    expect(
      hostSessionEnd({ credential, expiresAt: "2026-11-30T00:00:00.000Z" }),
    ).toBe(Date.parse("2026-11-30T00:00:00Z"));
  });

  it("names its credential's record as a host's own", () => {
    const made = session();
    const now = Date.now();
    const credential: CredentialLike = {
      id: "urn:uuid:1",
      issuer: {
        id: "did:pkh:eip155:1:0x00000000000000000000000000000000000000a1",
        ethereumAddress: "0x00000000000000000000000000000000000000a1",
      },
      credentialSubject: { id: made.did, app: "billing" },
      issuanceDate: new Date(now).toISOString(),
      expirationDate: new Date(now + 86_400_000).toISOString(),
      proof: {},
    };
    writeCredentialRecord({ dataDir, credential, source: "host-session" });
    expect(listCredentialRecords({ dataDir })).toMatchObject([
      { source: "host-session", sessionDid: made.did, label: "billing" },
    ]);
  });
});

describe("a host session's last use and key mark", () => {
  it("notes the last use beside the session, and removes it with the session", () => {
    const session = newHostSession({
      label: "billing",
      clientId: "curl",
      grant: "device",
    });
    writeHostSession(dataDir, session);
    expect(readHostSessionLastUsed({ dataDir, id: session.id })).toBe(
      undefined,
    );
    const at = new Date("2026-11-27T10:00:00.000Z");
    noteHostSessionUsed({ dataDir, id: session.id, at });
    expect(readHostSessionLastUsed({ dataDir, id: session.id })).toBe(
      at.toISOString(),
    );
    // Not a session file: listing skips it.
    expect(listHostSessions({ dataDir }).map((s) => s.id)).toEqual([
      session.id,
    ]);
    removeHostSession({ dataDir, id: session.id });
    expect(fs.existsSync(hostSessionUsedFile(dataDir, session.id))).toBe(false);
  });

  it("marks a session's key for good, so it is known after the session goes", () => {
    const session = newHostSession({
      label: "billing",
      clientId: "curl",
      grant: "device",
    });
    expect(hostSessionOfKey(dataDir, session.did)).toBeUndefined();
    markHostSessionKey(dataDir, session);
    removeHostSession({ dataDir, id: session.id });
    expect(hostSessionOfKey(dataDir, session.did)).toEqual({
      did: session.did,
      id: session.id,
      scope: HOST_SESSION_SCOPE,
      grant: "device",
    });
    expect(hostSessionOfKey(dataDir, "did:key:zOther")).toBeUndefined();
  });
});

describe("host session tokens", () => {
  it("are phs_<id>_<secret>, and parse back", () => {
    const { id } = session();
    const { token, hash } = mintHostSessionToken(id);
    expect(token).toMatch(/^phs_[0-9a-f]{32}_[A-Za-z0-9_-]{43}$/);
    const parsed = parseHostSessionToken(token);
    expect(parsed?.id).toBe(id);
    expect(hostSessionSecretHash(parsed!.secret)).toBe(hash);
    expect(shortHostSessionId(id)).toBe(id.slice(0, 8));
  });

  it("refuse anything malformed", () => {
    const { id } = session();
    const { token } = mintHostSessionToken(id);
    for (const bad of [
      "",
      "phs_",
      token.slice(0, -1),
      `${token}x`,
      token.replace("phs_", "pht_"),
      `phs_${id.toUpperCase()}_${token.slice(37)}`,
      "eyJhbGciOiJFUzI1NiJ9.e30.sig",
    ]) {
      expect(parseHostSessionToken(bad), bad).toBeUndefined();
    }
  });

  it("are told from a self-signed bearer by their prefix", () => {
    const { token } = mintHostSessionToken(session().id);
    expect(isHostSessionToken(token)).toBe(true);
    expect(isHostSessionToken("eyJhbGciOi.x.y")).toBe(false);
    expect(isHostSessionToken(undefined)).toBe(false);
    expect(hostSessionTokenOf(`Bearer ${token}`)).toBe(token);
    expect(hostSessionTokenOf("Bearer eyJhbGciOi.x.y")).toBeUndefined();
    expect(hostSessionTokenOf(undefined)).toBeUndefined();
  });

  it("are kept as the hash of their secret only, and matched by it", () => {
    const made = session();
    const one = mintHostSessionToken(made.id);
    const two = mintHostSessionToken(made.id);
    made.tokens.push({ hash: one.hash, expiresAt: "2026-12-01T00:00:00Z" });
    writeHostSession(dataDir, made);
    const text = fs.readFileSync(hostSessionFile(dataDir, made.id), "utf8");
    expect(text).not.toContain(parseHostSessionToken(one.token)!.secret);
    expect(text).toContain(one.hash);

    const kept = readHostSession({ dataDir, id: made.id })!;
    expect(
      matchHostSessionToken(kept, parseHostSessionToken(one.token)!.secret),
    ).toEqual(kept.tokens[0]);
    expect(
      matchHostSessionToken(kept, parseHostSessionToken(two.token)!.secret),
    ).toBeUndefined();
  });
});

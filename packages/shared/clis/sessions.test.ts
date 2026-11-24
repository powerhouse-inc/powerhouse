import { webcrypto } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CredentialLike } from "./credential-records.js";
import { ensurePseudonym, loginPaths } from "./identity.js";
import { fileAccessList } from "./owner-only.js";
import {
  credentialEndsWithin,
  didOfP256Jwk,
  ensureSessionFile,
  newSession,
  peekSessionSigner,
  readSessionFile,
  sessionCredentialFor,
  sessionFilePath,
  sessionSlug,
  writeSessionFile,
} from "./sessions.js";

let root: string;
let env: Record<string, string | undefined>;
let dataDir: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-sessions-"));
  env = { PH_IDENTITY_HOME: path.join(root, "home") };
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

function credentialFor(
  address: string,
  did: string,
  o: { label?: string; days?: number } = {},
): CredentialLike {
  const now = Date.now();
  return {
    id: `urn:uuid:${Math.random().toString(16).slice(2)}`,
    issuer: {
      id: `did:pkh:eip155:1:${address.toLowerCase()}`,
      ethereumAddress: address,
    },
    credentialSubject: { id: did, app: o.label ?? "vetra" },
    issuanceDate: new Date(now).toISOString(),
    expirationDate: new Date(
      now + (o.days ?? 30) * 24 * 60 * 60 * 1000,
    ).toISOString(),
    proof: { proofValue: "0x00" },
  };
}

describe("session files", () => {
  it("names a session by its label", () => {
    expect(sessionSlug("vetra agent vetra-agent")).toBe(
      "vetra-agent-vetra-agent",
    );
    expect(sessionSlug("mcp Claude Code")).toBe("mcp-claude-code");
    expect(() => sessionSlug("  ")).toThrow(/no session label/);
  });

  it("keeps a person's sessions in the home folder and an agent's in the store", () => {
    const address = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf";
    expect(
      sessionFilePath({ place: "home", label: "vetra", address, dataDir, env }),
    ).toBe(
      path.join(root, "home", address.toLowerCase(), "sessions", "vetra.json"),
    );
    expect(
      sessionFilePath({
        place: "data-folder",
        label: "mcp claude-code",
        address,
        dataDir,
        env,
      }),
    ).toBe(path.join(dataDir, ".ph", "sessions", "mcp-claude-code.json"));
  });

  it("makes a key once, owner-only, and reads it back", () => {
    const file = path.join(dataDir, ".ph", "sessions", "vetra.json");
    const made = ensureSessionFile(file, "vetra");
    expect(made.did).toMatch(/^did:key:zDn/);
    expect(made.label).toBe("vetra");
    expectOwnerOnly(file);
    expect(ensureSessionFile(file, "vetra")).toEqual(made);
    expect(readSessionFile(file)).toEqual(made);
  });

  it("writes the did:key of the key it keeps", async () => {
    const session = newSession("vetra");
    const imported = await webcrypto.subtle.importKey(
      "jwk",
      session.key.publicKey as webcrypto.JsonWebKey,
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["verify"],
    );
    const exported = await webcrypto.subtle.exportKey("jwk", imported);
    expect(didOfP256Jwk(exported as Parameters<typeof didOfP256Jwk>[0])).toBe(
      session.did,
    );
    expect(() => didOfP256Jwk({ kty: "RSA" })).toThrow(/P-256/);
  });

  it("knows when a credential is near its end", () => {
    const now = Date.parse("2026-11-24T00:00:00.000Z");
    const ends = (date: string) =>
      ({ expirationDate: date }) as unknown as CredentialLike;
    expect(credentialEndsWithin(ends("2026-12-24T00:00:00.000Z"), 7, now)).toBe(
      false,
    );
    expect(credentialEndsWithin(ends("2026-11-30T00:00:00.000Z"), 7, now)).toBe(
      true,
    );
    expect(credentialEndsWithin(undefined, 7, now)).toBe(true);
  });
});

describe("who would sign", () => {
  it("is nobody before there is a pseudonym or a login", () => {
    expect(
      peekSessionSigner({ dataDir, label: "vetra", place: "home", env }),
    ).toBeUndefined();
  });

  it("is nobody while the session has no key, and makes none", async () => {
    await ensurePseudonym({ dataDir, env });
    expect(
      peekSessionSigner({ dataDir, label: "vetra", place: "home", env }),
    ).toBeUndefined();
    expect(fs.existsSync(path.join(root, "home"))).toBe(true);
    expect(
      fs
        .readdirSync(path.join(root, "home"), { recursive: true })
        .some((name) => String(name).includes("sessions")),
    ).toBe(false);
  });

  it("is the pseudonym, through the session's key, labelled", async () => {
    const pseudonym = await ensurePseudonym({ dataDir, env });
    const file = sessionFilePath({
      place: "home",
      label: "vetra",
      address: pseudonym.address,
      dataDir,
      env,
    });
    const session = ensureSessionFile(file, "vetra");
    expect(
      peekSessionSigner({ dataDir, label: "vetra", place: "home", env }),
    ).toEqual({
      user: { address: pseudonym.address, networkId: "eip155", chainId: 1 },
      app: { name: "vetra", key: session.did },
    });
  });

  it("takes the label its credential signs, and ignores one for another address", async () => {
    const pseudonym = await ensurePseudonym({ dataDir, env });
    const file = sessionFilePath({
      place: "data-folder",
      label: "mcp test",
      address: pseudonym.address,
      dataDir,
      env,
    });
    const session = ensureSessionFile(file, "mcp test");
    writeSessionFile(file, {
      ...session,
      credential: credentialFor(pseudonym.address, session.did, {
        label: "mcp signed",
      }),
    });
    expect(
      peekSessionSigner({
        dataDir,
        label: "mcp test",
        place: "data-folder",
        env,
      })?.app.name,
    ).toBe("mcp signed");

    const other = "0x0000000000000000000000000000000000000001";
    const foreign = {
      ...session,
      credential: credentialFor(other, session.did),
    };
    expect(sessionCredentialFor(foreign, pseudonym.address)).toBeUndefined();
    const ended = {
      ...session,
      credential: credentialFor(pseudonym.address, session.did, { days: -1 }),
    };
    expect(sessionCredentialFor(ended, pseudonym.address)).toBeUndefined();
  });

  it("is a Renown login through the login's own session key", () => {
    const paths = loginPaths(env);
    fs.mkdirSync(paths.dir, { recursive: true });
    const session = newSession("unused");
    fs.writeFileSync(paths.keypair, JSON.stringify(session.key));
    const address = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf";
    fs.writeFileSync(
      paths.file,
      JSON.stringify({
        user: {
          address,
          chainId: 1,
          did: `did:pkh:eip155:1:${address.toLowerCase()}`,
          credential: {
            id: "urn:uuid:login",
            expirationDate: new Date(Date.now() + 86_400_000).toISOString(),
            credentialSubject: { id: session.did, app: "renown-app" },
          },
        },
      }),
    );
    expect(
      peekSessionSigner({ dataDir, label: "vetra", place: "home", env }),
    ).toEqual({
      user: { address, networkId: "eip155", chainId: 1 },
      app: { name: "renown-app", key: session.did },
    });
    // An agent of a Renown user needs its own approved session.
    expect(
      peekSessionSigner({
        dataDir,
        label: "vetra agent x",
        place: "data-folder",
        env,
      }),
    ).toBeUndefined();
  });
});

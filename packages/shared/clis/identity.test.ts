import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addressOfKey,
  changePseudonymPassword,
  checksumAddress,
  dataPseudonymFile,
  decryptKeyV3,
  encryptKeyV3,
  ensurePseudonym,
  homePseudonymFile,
  type KdfParams,
  loginPaths,
  parsePrivateKey,
  parsePseudonymFile,
  PasswordRequiredError,
  pseudonymCopies,
  readActiveIdentity,
  readLogin,
  readPseudonym,
  unlockPseudonym,
  type V3Keystore,
  WrongPasswordError,
} from "./identity.js";
import { fileAccessList } from "./owner-only.js";

const LIGHT: KdfParams = { n: 1024, r: 8, p: 1, dklen: 32 };

let root: string;
let env: Record<string, string | undefined>;
const dir = (name: string) => {
  const folder = path.join(root, name);
  fs.mkdirSync(folder, { recursive: true });
  return folder;
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-identity-"));
  env = { PH_IDENTITY_HOME: path.join(root, "home") };
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

/** Every file under `folder`, as text. */
function allText(folder: string): string {
  if (!fs.existsSync(folder)) return "";
  return fs
    .readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      fs.readFileSync(path.join(entry.parentPath, entry.name), "utf8"),
    )
    .join("\n");
}

function expectOwnerOnly(file: string) {
  if (process.platform === "win32") {
    expect(fileAccessList(file)).toHaveLength(1);
  } else {
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  }
}

describe("keys and addresses", () => {
  it("derives the address of a key", () => {
    expect(addressOfKey(parsePrivateKey(`0x${"00".repeat(31)}01`))).toBe(
      "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
    );
    expect(checksumAddress("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed")).toBe(
      "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
    );
  });

  it("refuses what is not a key", () => {
    expect(() => parsePrivateKey("0x1234")).toThrow(/32 bytes/);
    expect(() => parsePrivateKey("00".repeat(32))).toThrow(/secp256k1/);
  });

  // Written by ethers 6 (`encryptKeystoreJson`, N 1024) for the spec's key. The
  // spec's own scrypt vector (n 262144, r 1) is past OpenSSL's N < 2^(16r).
  it("reads a keystore another wallet wrote", async () => {
    const keystore = {
      address: "008aeeda4d805471df9b2a5b0f38a0c3bcba786b",
      id: "be85e4de-0e61-4a36-bf52-5500061cc1f9",
      version: 3,
      Crypto: {
        cipher: "aes-128-ctr",
        cipherparams: { iv: "50611ba612b80eda3fc61aaa658a3170" },
        ciphertext:
          "c84ce5a506d738a9ff70cbd7d7292ab02dd5c9d42f03173c9fe8958a32a37e33",
        kdf: "scrypt",
        kdfparams: {
          salt: "e2ce4e94702dc079bcd47157fe87d67617df31ea40fb157497edb532bc6b5a71",
          n: 1024,
          dklen: 32,
          p: 1,
          r: 8,
        },
        mac: "5b037216a142c7f67ad7efe4bb3c5db97de63b29709fb2ef0f783ef819ae8869",
      },
    } as unknown as V3Keystore;
    const key = await decryptKeyV3(keystore, "testpassword");
    expect(Buffer.from(key).toString("hex")).toBe(
      "7a28b5ba57c53603b0b07b56bba752f7784bf506fa95edc395f5cf6c7514fe9d",
    );
    expect(addressOfKey(key).toLowerCase()).toBe(`0x${keystore.address}`);
    await expect(decryptKeyV3(keystore, "wrong")).rejects.toThrow(
      WrongPasswordError,
    );
    // A bare keystore (the desktop's local key) reads as a pseudonym.
    expect(parsePseudonymFile(JSON.stringify(keystore)).key.type).toBe("v3");
  }, 30_000);

  it("encrypts and decrypts its own keystore", async () => {
    const key = parsePrivateKey(`0x${"11".repeat(32)}`);
    const keystore = await encryptKeyV3(key, "pw", LIGHT);
    expect(keystore.address).toBe(addressOfKey(key).slice(2).toLowerCase());
    expect(await decryptKeyV3(keystore, "pw")).toEqual(key);
  });
});

describe("ensurePseudonym", () => {
  it("makes one in the home folder and the store, owner-only and ignored by git", async () => {
    const store = dir("store");
    const info = await ensurePseudonym({ dataDir: store, env });
    expect(info).toMatchObject({
      kind: "pseudonym",
      source: "data-folder",
      encrypted: false,
      file: dataPseudonymFile(store),
    });
    expect(info.label).toMatch(
      /^Anonymous 0x[0-9a-fA-F]{4}\.\.\.[0-9a-fA-F]{4}$/,
    );
    const homeFile = homePseudonymFile(info.address, env);
    expect(fs.readFileSync(homeFile, "utf8")).toBe(
      fs.readFileSync(info.file!, "utf8"),
    );
    expectOwnerOnly(homeFile);
    expectOwnerOnly(info.file!);
    expect(fs.readFileSync(path.join(store, ".ph", ".gitignore"), "utf8")).toBe(
      "*\n",
    );
    expect(pseudonymCopies(info.address, env)).toEqual([path.resolve(store)]);
  });

  it("copies the home folder's pseudonym into a new store", async () => {
    const first = await ensurePseudonym({ dataDir: dir("a"), env });
    const second = await ensurePseudonym({ dataDir: dir("b"), env });
    expect(second.address).toBe(first.address);
    expect(fs.readFileSync(second.file!, "utf8")).toBe(
      fs.readFileSync(first.file!, "utf8"),
    );
    expect(pseudonymCopies(first.address, env)).toHaveLength(2);
  });

  it("keeps a store's own pseudonym when the home folder's default differs", async () => {
    const mine = await ensurePseudonym({ dataDir: dir("mine"), env });
    const elsewhere = {
      PH_IDENTITY_HOME: path.join(root, "other-home"),
    };
    const copied = dir("copied");
    const theirs = await ensurePseudonym({ dataDir: copied, env: elsewhere });
    expect(theirs.address).not.toBe(mine.address);

    expect(readPseudonym({ dataDir: copied, env })).toMatchObject({
      address: theirs.address,
      source: "data-folder",
      differsFromHome: mine.address,
    });
    const kept = await ensurePseudonym({ dataDir: copied, env });
    expect(kept.address).toBe(theirs.address);
    // Home keeps a copy of it; the default stays.
    expect(fs.existsSync(homePseudonymFile(theirs.address, env))).toBe(true);
    const fresh = await ensurePseudonym({ dataDir: dir("fresh"), env });
    expect(fresh.address).toBe(mine.address);
  });

  it("gives two racing stores one pseudonym", async () => {
    const [a, b] = await Promise.all([
      ensurePseudonym({ dataDir: dir("race-a"), env }),
      ensurePseudonym({ dataDir: dir("race-b"), env }),
    ]);
    expect(a.address).toBe(b.address);
    const keys = fs
      .readdirSync(env.PH_IDENTITY_HOME!)
      .filter((name) => name.startsWith("0x"));
    expect(keys).toEqual([a.address.toLowerCase()]);
  });

  it("writes nothing for PH_IDENTITY_KEY", async () => {
    const key = `0x${"22".repeat(32)}`;
    const store = dir("env-key");
    const info = await ensurePseudonym({
      dataDir: store,
      env: { ...env, PH_IDENTITY_KEY: key },
    });
    expect(info).toMatchObject({
      source: "env",
      address: addressOfKey(parsePrivateKey(key)),
    });
    expect(fs.existsSync(env.PH_IDENTITY_HOME!)).toBe(false);
    expect(fs.readdirSync(store)).toEqual([]);
  });

  it("keeps no unlocked copy of a key made with a password", async () => {
    const store = dir("locked");
    const info = await ensurePseudonym({
      dataDir: store,
      env,
      password: "secret",
      kdf: LIGHT,
    });
    expect(info.encrypted).toBe(true);
    const key = await unlockPseudonym(info, {
      interactive: false,
      env: { ...env, PH_IDENTITY_PASSWORD: "secret" },
    });
    expect(addressOfKey(key)).toBe(info.address);
    const hex = Buffer.from(key).toString("hex");
    expect(allText(env.PH_IDENTITY_HOME!)).not.toContain(hex);
    expect(allText(store)).not.toContain(hex);
  });
});

describe("unlockPseudonym", () => {
  it("asks in a terminal, takes the env var, and refuses without either", async () => {
    const info = await ensurePseudonym({
      dataDir: dir("s"),
      env,
      password: "pw",
      kdf: LIGHT,
    });
    const answers = ["nope", "pw"];
    const ask = vi.fn(() => Promise.resolve(answers.shift()!));
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const key = await unlockPseudonym(info, { interactive: true, env, ask });
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask).toHaveBeenCalledWith(`Password for ${info.label}: `);
    expect(addressOfKey(key)).toBe(info.address);
    await expect(
      unlockPseudonym(info, { interactive: false, env }),
    ).rejects.toThrow(PasswordRequiredError);
    await expect(
      unlockPseudonym(info, {
        interactive: false,
        env: { ...env, PH_IDENTITY_PASSWORD: "bad" },
      }),
    ).rejects.toThrow(WrongPasswordError);
  });
});

describe("the active identity", () => {
  function writeLogin(expirationDate: string) {
    const { file, dir: loginDir } = loginPaths(env);
    fs.mkdirSync(loginDir, { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({
        user: {
          address: "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed",
          chainId: 1,
          did: "did:pkh:eip155:1:0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed",
          credential: { id: "urn:uuid:1", expirationDate },
          profile: { username: "ada" },
        },
      }),
    );
  }

  it("is the pseudonym without a login, read without a key, a prompt or the network", async () => {
    vi.stubGlobal("fetch", () => {
      throw new Error("no network here");
    });
    const store = dir("p");
    expect(readActiveIdentity({ dataDir: store, env })).toBeUndefined();
    // Nothing was made by reading.
    expect(fs.existsSync(env.PH_IDENTITY_HOME!)).toBe(false);
    const made = await ensurePseudonym({ dataDir: store, env });
    expect(readActiveIdentity({ dataDir: store, env })).toEqual(made);
    // A store without one shows the home folder's.
    expect(readActiveIdentity({ dataDir: dir("q"), env })).toMatchObject({
      address: made.address,
      source: "home",
    });
  });

  it("is the Renown login when there is one, expired included", () => {
    writeLogin(new Date(Date.now() + 60_000).toISOString());
    expect(readActiveIdentity({ dataDir: dir("r"), env })).toMatchObject({
      kind: "renown",
      address: "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
      label: "ada",
      renown: { credentialId: "urn:uuid:1", expired: false },
    });
    writeLogin(new Date(Date.now() - 60_000).toISOString());
    expect(readLogin(env)?.expired).toBe(true);
    // A logged-out file (`{}`) is no login.
    fs.writeFileSync(loginPaths(env).file, "{}");
    expect(readLogin(env)).toBeUndefined();
  });
});

describe("changePseudonymPassword", () => {
  it("rewrites every copy and names the ones it cannot reach", async () => {
    const a = dir("one");
    const b = dir("two");
    const gone = dir("gone");
    const info = await ensurePseudonym({ dataDir: a, env });
    await ensurePseudonym({ dataDir: b, env });
    await ensurePseudonym({ dataDir: gone, env });
    fs.rmSync(gone, { recursive: true });

    const locked = await changePseudonymPassword({
      dataDir: a,
      env,
      newPassword: "pw",
      kdf: LIGHT,
    });
    expect(locked.written).toHaveLength(3);
    expect(locked.missing).toEqual([dataPseudonymFile(path.resolve(gone))]);
    for (const file of locked.written) {
      expect(parsePseudonymFile(fs.readFileSync(file, "utf8")).key.type).toBe(
        "v3",
      );
    }
    const hex = Buffer.from(
      await unlockPseudonym(readPseudonym({ dataDir: b, env })!, {
        interactive: false,
        password: "pw",
      }),
    ).toString("hex");
    expect(allText(root)).not.toContain(hex);

    const open = await changePseudonymPassword({
      dataDir: b,
      env,
      unlock: { interactive: false, password: "pw" },
    });
    expect(open.address).toBe(info.address);
    expect(readPseudonym({ dataDir: a, env })?.encrypted).toBe(false);
  });

  it("makes a pseudonym with the password when there is none", async () => {
    const result = await changePseudonymPassword({
      dataDir: dir("new"),
      env,
      newPassword: "pw",
      kdf: LIGHT,
    });
    expect(result.created).toBe(true);
    expect(readPseudonym({ dataDir: dir("new"), env })?.encrypted).toBe(true);
  });
});

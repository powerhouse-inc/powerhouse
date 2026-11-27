import {
  addressOfKey,
  ensurePseudonym,
  loginPaths,
  parsePrivateKey,
} from "@powerhousedao/shared/clis/identity";
import { fileAccessList } from "@powerhousedao/shared/clis/owner-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  projectLoginNotice,
  runIdentityNew,
  runLogout,
  runWhoami,
} from "../src/services/identity.js";

const ADDRESS = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
const RENOWN = "https://renown.test";
const SWITCHBOARD = "https://switchboard.test/graphql";

let root: string;
let home: string;
let store: string;
let lines: string[];
const print = (line: string) => lines.push(line);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-cli-identity-"));
  home = path.join(root, "home");
  store = path.join(root, "store");
  fs.mkdirSync(store);
  lines = [];
  vi.stubEnv("PH_IDENTITY_HOME", home);
  vi.stubEnv("PH_USER_DATA_DIR", store);
  vi.stubEnv("PH_IDENTITY_KEY", undefined);
  vi.stubEnv("PH_RENOWN_PRIVATE_KEY", undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  fs.rmSync(root, { recursive: true, force: true });
});

/** Renown's discovery finds no switchboard: no network, the REST transport. */
const noRenown = () =>
  vi.stubGlobal("fetch", () =>
    Promise.resolve(new Response("no", { status: 404 })),
  );

/** `ph login` as it ends: the session key and the user, in the home folder. */
async function login() {
  noRenown();
  const { getRenown } = await import("../src/services/auth.js");
  const renown = await getRenown(RENOWN);
  const paths = loginPaths();
  const stored = JSON.parse(fs.readFileSync(paths.file, "utf8")) as Record<
    string,
    unknown
  >;
  stored.user = {
    address: ADDRESS,
    chainId: 1,
    networkId: "eip155",
    did: `did:pkh:eip155:1:${ADDRESS.toLowerCase()}`,
    credential: {
      id: "urn:uuid:login-1",
      expirationDate: new Date(Date.now() + 86_400_000).toISOString(),
    },
  };
  fs.writeFileSync(paths.file, JSON.stringify(stored));
  return renown;
}

describe("ph login", () => {
  it("keeps its key and login in the home folder, not the project", async () => {
    const renown = await login();
    expect(fs.existsSync(loginPaths().keypair)).toBe(true);
    expect(renown.did).toMatch(/^did:key:/);
    expect(fs.existsSync(path.join(store, ".ph"))).toBe(false);
  });

  it("names a login an older ph left in the project", () => {
    expect(projectLoginNotice(store)).toBeUndefined();
    fs.mkdirSync(path.join(store, ".ph"));
    fs.writeFileSync(
      path.join(store, ".ph", ".renown.json"),
      JSON.stringify({ user: { address: ADDRESS } }),
    );
    expect(projectLoginNotice(store)).toMatch(/from before 6\.4/);
  });
});

describe("ph whoami", () => {
  it("says nobody acts yet, and makes nothing", async () => {
    expect(await runWhoami({ renownUrl: RENOWN }, print)).toBe(0);
    expect(lines[0]).toMatch(/^Nobody yet/);
    expect(fs.existsSync(home)).toBe(false);
  });

  it("shows the pseudonym, as text and as JSON", async () => {
    const pseudonym = await ensurePseudonym({ dataDir: store });
    await runWhoami({ renownUrl: RENOWN }, print);
    expect(lines[0]).toBe(`${pseudonym.label} (no Renown login)`);
    expect(lines.join("\n")).toMatch(/this store's own/);
    lines = [];
    await runWhoami({ renownUrl: RENOWN, json: true }, print);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      identity: { kind: "pseudonym", address: pseudonym.address },
    });
  });

  it("shows PH_IDENTITY_KEY's key, with no login to override", async () => {
    vi.stubEnv("PH_IDENTITY_KEY", `0x${"44".repeat(32)}`);
    await runWhoami({ renownUrl: RENOWN }, print);
    expect(lines[0]).toMatch(
      /^Anonymous 0x.{4}\.\.\..{4} \(no Renown login\)$/,
    );
  });

  it("shows the Renown login when there is one", async () => {
    await ensurePseudonym({ dataDir: store });
    await login();
    await runWhoami({ renownUrl: RENOWN }, print);
    expect(lines[0]).toBe("Logged in with Renown as 0x5aAe...eAed");
  });
});

describe("ph logout", () => {
  it("withdraws the login, deletes it with its key, and the pseudonym acts again", async () => {
    const pseudonym = await ensurePseudonym({ dataDir: store });
    await login();
    const requests: string[] = [];
    vi.stubGlobal("fetch", (input: string | URL) => {
      const url = String(input);
      requests.push(url);
      return Promise.resolve(
        url.endsWith("/api/switchboard")
          ? Response.json({ endpoint: SWITCHBOARD })
          : Response.json({ data: { renown_revokeCredential: true } }),
      );
    });
    expect(await runLogout({ renownUrl: RENOWN }, print)).toBe(0);
    expect(requests).toContain(SWITCHBOARD);
    expect(lines[0]).toBe("Withdrew the login at Renown.");
    expect(fs.existsSync(loginPaths().keypair)).toBe(false);
    expect(fs.existsSync(loginPaths().file)).toBe(false);
    expect(lines.at(-1)).toBe(`Now acting as ${pseudonym.label}.`);
  });

  it("says when nobody is logged in", async () => {
    await runLogout({ renownUrl: RENOWN }, print);
    expect(lines[0]).toBe("Not logged in.");
  });
});

describe("ph identity new", () => {
  let out: string[];
  let err: string[];
  const io = () => ({
    out: (line: string) => out.push(line),
    err: (line: string) => err.push(line),
  });
  beforeEach(() => {
    out = [];
    err = [];
  });

  const HEADING =
    /^# (Anonymous 0x[0-9a-fA-F]{4}\.\.\.[0-9a-fA-F]{4})(?: "([^"]+)")?: (0x[0-9a-fA-F]{40})$/;

  it("prints the key as the line a service is given, named as ph whoami names it, and writes nothing", async () => {
    expect(runIdentityNew({ label: "billing  job" }, io())).toBe(0);
    expect(out).toHaveLength(2);
    const [, name, label, address] = HEADING.exec(out[0]!)!;
    expect(label).toBe("billing job");
    const key = /^PH_IDENTITY_KEY=(0x[0-9a-f]{64})$/.exec(out[1]!)![1]!;
    expect(addressOfKey(parsePrivateKey(key))).toBe(address);
    expect(err.join("\n")).toMatch(/Nothing was written/);
    expect(err.join("\n")).toContain(`ADMINS=${address}`);
    expect(fs.existsSync(home)).toBe(false);
    expect(fs.readdirSync(store)).toEqual([]);

    // The process it is given to acts as it, a Renown login or not.
    await login();
    vi.stubEnv("PH_IDENTITY_KEY", key);
    await runWhoami({ renownUrl: RENOWN }, print);
    // The login is there, overridden: not "(no Renown login)".
    expect(lines[0]).toBe(
      `${name} (PH_IDENTITY_KEY overrides the Renown login of 0x5aAe...eAed)`,
    );
    expect(lines.join("\n")).toContain("PH_IDENTITY_KEY (never written)");
    expect(fs.readdirSync(store)).toEqual([]);
  });

  it("makes a new key each time", () => {
    runIdentityNew({}, io());
    runIdentityNew({}, io());
    expect(out[1]).not.toBe(out[3]);
    expect(out[0]).toMatch(HEADING);
    expect(HEADING.exec(out[0]!)![2]).toBeUndefined();
  });

  it("saves it as an env file readable by its owner only, and never overwrites one", () => {
    const file = path.join(root, "secrets", "billing.env");
    expect(
      runIdentityNew(
        { label: "billing", save: file },
        { ...io(), now: () => new Date("2026-11-27T10:00:00Z") },
      ),
    ).toBe(0);
    const text = fs.readFileSync(file, "utf8");
    const key = parseEnv(text).PH_IDENTITY_KEY!;
    const address = addressOfKey(parsePrivateKey(key));
    expect(text.split("\n")[0]).toMatch(HEADING);
    expect(text).toContain("2026-11-27T10:00:00.000Z");
    expect(out.join("\n")).not.toContain(key);
    expect(out[0]).toBe(
      `Anonymous ${address.slice(0, 6)}...${address.slice(-4)} "billing": ${address}`,
    );
    if (process.platform === "win32") {
      expect(fileAccessList(file)).toHaveLength(1);
    } else {
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    }

    out = [];
    err = [];
    expect(runIdentityNew({ save: file }, io())).toBe(1);
    expect(err[0]).toMatch(/exists: nothing was written/);
    expect(out).toEqual([]);
    expect(fs.readFileSync(file, "utf8")).toBe(text);
  });

  it("answers as JSON, with the key only when nothing is saved", () => {
    runIdentityNew({ label: "ci", json: true }, io());
    const printed = JSON.parse(out.join("\n")) as Record<string, string>;
    expect(printed).toMatchObject({ label: "ci", env: "PH_IDENTITY_KEY" });
    expect(addressOfKey(parsePrivateKey(printed.privateKey!))).toBe(
      printed.address,
    );
    expect(printed.name).toMatch(/^Anonymous 0x/);

    out = [];
    const file = path.join(root, "ci.env");
    runIdentityNew({ save: file, json: true }, io());
    const saved = JSON.parse(out.join("\n")) as Record<string, string>;
    expect(saved).toMatchObject({ file, env: "PH_IDENTITY_KEY" });
    expect(saved.privateKey).toBeUndefined();
  });
});

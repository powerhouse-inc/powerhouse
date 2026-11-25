import {
  ensurePseudonym,
  loginPaths,
} from "@powerhousedao/shared/clis/identity";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  projectLoginNotice,
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

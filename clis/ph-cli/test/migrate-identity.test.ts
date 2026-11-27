// `ph migrate`'s identity step on a project as Powerhouse 6.3 left it. Renown
// is the test's in every case: the step's withdraw is a mock, and the global
// fetch refuses, so nothing reaches a real Renown.
import {
  credentialRecordId,
  readCredentialWithdrawal,
} from "@powerhousedao/shared/clis/credential-records";
import type { LoginFiles, WithdrawResult } from "@renown/sdk/identity";
import type { DelegationCredentialStatus } from "@renown/sdk/node";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate } from "../src/commands/migrate.js";
import {
  jsonLike,
  migrateIdentity,
  type IdentityStepIo,
} from "../src/services/migrate-identity.js";
import { resolveMigrateTarget, startMigrate } from "../src/services/migrate.js";

// The version step's: resolving a version asks the npm registry.
vi.mock("../src/services/migrate.js", () => ({
  resolveMigrateTarget: vi.fn(),
  startMigrate: vi.fn(),
}));

const here = path.dirname(fileURLToPath(import.meta.url));
const PH_CLI = path.resolve(here, "../dist/cli.mjs");
const RENOWN = "https://renown.test";
const PERSON = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
const OWNER = "0x1111111111111111111111111111111111111111";
const INSTANCE_DID = "did:key:zDnaeInstanceKey";
const AGENT_DID = "did:key:zDnaeAgentKey";

let root: string;
let project: string;
let ph: string;
let out: string[];
let withdrawn: { files: LoginFiles; renownUrl: string; keyPair?: unknown }[];
let answers: WithdrawResult[];
/** What Renown's read model answers, in turn; "active" when none is left. */
let checks: DelegationCredentialStatus[];
let checked: LoginFiles[];
let fetched: string[];

const credential = (sessionDid: string, days = 30) => ({
  id: `urn:uuid:${sessionDid.slice(-8)}`,
  issuer: {
    id: `did:pkh:eip155:1:${PERSON.toLowerCase()}`,
    ethereumAddress: PERSON,
  },
  credentialSubject: { id: sessionDid, app: "renown-app" },
  issuanceDate: new Date(Date.now() - 86_400_000).toISOString(),
  expirationDate: new Date(Date.now() + days * 86_400_000).toISOString(),
  proof: { type: "EthereumEip712Signature2021" },
});

/** A login as `ph login` wrote it before 6.4. */
const login = (sessionDid: string, days?: number) =>
  JSON.stringify({
    user: {
      address: PERSON,
      chainId: 1,
      networkId: "eip155",
      did: `did:pkh:eip155:1:${PERSON.toLowerCase()}`,
      credential: credential(sessionDid, days),
      profile: { username: "ada" },
    },
  });

function write(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

/** The project as 6.3 left it: every item of the step present. */
function legacyProject() {
  write(path.join(ph, ".renown.json"), login(INSTANCE_DID));
  write(path.join(ph, ".keypair.json"), '{"instance":"key"}');
  write(path.join(ph, "vetra", "agent", ".renown.json"), login(AGENT_DID));
  write(path.join(ph, "vetra", "agent", ".keypair.json"), '{"agent":"key"}');
  write(path.join(ph, "preview-trusted-keys.json"), "{}");
  write(path.join(ph, "vetra", "preview-trusted-keys.json"), "{}");
  write(path.join(ph, ".owner.json"), JSON.stringify({ owner: OWNER }));
  write(path.join(ph, "reactor-storage", "keep.txt"), "the store");
  write(
    path.join(project, "powerhouse.config.json"),
    `${JSON.stringify(
      {
        documentModelsDir: "./document-models",
        auth: {
          enabled: true,
          ownerClaim: true,
          renown: { source: "kept", url: "https://renown.example" },
        },
      },
      null,
      2,
    )}\n`,
  );
  write(
    path.join(project, ".env"),
    "RENOWN_SOURCE=kept\nPORT=4001\nexport RESOLVE_CALLER_IDENTITY=true\n",
  );
  write(
    path.join(ph, "unsigned-writes", "4001.json"),
    JSON.stringify({
      version: 1,
      host: { port: 4001 },
      entries: [
        {
          reason: "host-built",
          field: "Mutation.renameDocument",
          caller: null,
          actions: ["SET_NAME"],
          count: 12,
        },
        {
          reason: "host-built",
          field: "Mutation.renameDocument",
          caller: { address: OWNER },
          actions: ["SET_NAME"],
          count: 3,
        },
        {
          reason: "unsigned-actions",
          field: "Mutation.mutateDocument",
          caller: null,
          actions: ["ADD_FILE"],
          count: 2,
        },
      ],
    }),
  );
}

/** Every file under `dir` with its contents, to tell a run that wrote nothing. */
function tree(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of fs.readdirSync(dir, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    files[path.relative(dir, file)] = fs.readFileSync(file, "utf8");
  }
  return files;
}

function io(over: Partial<IdentityStepIo> = {}): IdentityStepIo {
  return {
    out: (line) => out.push(...line.split("\n")),
    env: { PH_IDENTITY_HOME: path.join(root, "home") },
    withdraw: (files, renownUrl, keyPair) => {
      withdrawn.push({ files, renownUrl, ...(keyPair ? { keyPair } : {}) });
      return Promise.resolve(answers.shift() ?? { status: "withdrawn" });
    },
    check: (files) => {
      checked.push(files);
      return Promise.resolve(checks.shift() ?? "active");
    },
    envKey: () => Promise.resolve(undefined),
    gitTracked: () => [],
    ...over,
  };
}

const run = (dryRun: boolean, over?: Partial<IdentityStepIo>) =>
  migrateIdentity(
    {
      projectDir: project,
      dryRun,
      renownUrl: RENOWN,
      renownUrlFrom: "--renown-url",
    },
    io(over),
  );

const tombstoneOf = (sessionDid: string) =>
  readCredentialWithdrawal({
    dataDir: project,
    id: credentialRecordId({ address: PERSON, chainId: 1, sessionDid }),
  });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-migrate-identity-"));
  project = path.join(root, "project");
  ph = path.join(project, ".ph");
  fs.mkdirSync(project, { recursive: true });
  out = [];
  withdrawn = [];
  answers = [];
  checks = [];
  checked = [];
  fetched = [];
  vi.stubGlobal("fetch", (input: string | URL) => {
    fetched.push(String(input));
    return Promise.reject(new TypeError("no network in this test"));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("ph migrate's identity step", () => {
  it("in a dry run says what it would do, and asks and writes nothing", async () => {
    legacyProject();
    const before = tree(project);
    expect(await run(true)).toBe(0);
    expect(withdrawn).toEqual([]);
    expect(fetched).toEqual([]);
    expect(tree(project)).toEqual(before);
    const text = out.join("\n");
    expect(text).toMatch(/dry run: nothing is asked of Renown/);
    expect(text).toContain(
      `Would withdraw the project's Renown login of ada (${PERSON}) at ${RENOWN} with a bearer of .ph/.keypair.json`,
    );
    expect(text).toContain("Would withdraw Studio's agent login");
    expect(text).toContain("Would delete .ph/.owner.json");
    expect(text).toContain('"auth.renown.source", "auth.ownerClaim"');
    expect(text).toContain(
      "Would remove RENOWN_SOURCE, RESOLVE_CALLER_IDENTITY from .env",
    );
    expect(text).toContain("Would write .ph/.gitignore");
    expect(text).toContain("Would delete .ph/unsigned-writes.");
  });

  it("withdraws the old logins, removes what 6.4 reads no more, and keeps the switchboard's key", async () => {
    legacyProject();
    expect(await run(false)).toBe(0);
    const text = out.join("\n");

    // 1. The project's login: withdrawn with its own key, a tombstone, gone.
    expect(withdrawn).toEqual([
      {
        files: {
          file: path.join(ph, ".renown.json"),
          keypair: path.join(ph, ".keypair.json"),
        },
        renownUrl: RENOWN,
      },
      {
        files: {
          file: path.join(ph, "vetra", "agent", ".renown.json"),
          keypair: path.join(ph, "vetra", "agent", ".keypair.json"),
        },
        renownUrl: RENOWN,
      },
    ]);
    expect(fetched).toEqual([]);
    expect(fs.existsSync(path.join(ph, ".renown.json"))).toBe(false);
    expect(fs.readFileSync(path.join(ph, ".keypair.json"), "utf8")).toBe(
      '{"instance":"key"}',
    );
    const tombstone = readCredentialWithdrawal({
      dataDir: project,
      id: credentialRecordId({
        address: PERSON,
        chainId: 1,
        sessionDid: INSTANCE_DID,
      }),
    });
    expect(tombstone).toMatchObject({
      by: "command",
      address: PERSON.toLowerCase(),
      sessionDid: INSTANCE_DID,
      credential: { id: credential(INSTANCE_DID).id },
    });
    expect(text).toContain(
      ".ph/.keypair.json stays: it is this project's switchboard key",
    );
    expect(text).toContain("Run `ph login` once");

    // 2. The agent's folder and both trusted-key files.
    expect(fs.existsSync(path.join(ph, "vetra", "agent"))).toBe(false);
    expect(fs.existsSync(path.join(ph, "preview-trusted-keys.json"))).toBe(
      false,
    );
    expect(
      fs.existsSync(path.join(ph, "vetra", "preview-trusted-keys.json")),
    ).toBe(false);

    // 3. The owner claim, its address named for ADMINS.
    expect(fs.existsSync(path.join(ph, ".owner.json"))).toBe(false);
    expect(text).toContain(`ADMINS=${OWNER}`);

    // 4. The dead settings; the rest stays as it was.
    expect(
      JSON.parse(
        fs.readFileSync(path.join(project, "powerhouse.config.json"), "utf8"),
      ),
    ).toEqual({
      documentModelsDir: "./document-models",
      auth: { enabled: true, renown: { url: "https://renown.example" } },
    });
    expect(fs.readFileSync(path.join(project, ".env"), "utf8")).toBe(
      "PORT=4001\n",
    );

    // 5. .ph out of git.
    expect(fs.readFileSync(path.join(ph, ".gitignore"), "utf8")).toBe("*\n");

    // 6. Administration.
    expect(text).toContain("No administrator configured for deployments");

    // 7. The 6.3 record of unsigned writes: summed by code and field, gone.
    expect(text).toMatch(/recorded 17 unsigned write\(s\) in 1 file\(s\)/);
    expect(text).toMatch(/host-built\s+Mutation\.renameDocument\s+15/);
    expect(text).toMatch(/unsigned-actions\s+Mutation\.mutateDocument\s+2/);
    expect(fs.existsSync(path.join(ph, "unsigned-writes"))).toBe(false);

    // The store is not the step's.
    expect(fs.existsSync(path.join(ph, "reactor-storage", "keep.txt"))).toBe(
      true,
    );

    // A second run has nothing to do.
    out = [];
    withdrawn = [];
    expect(await run(false)).toBe(0);
    expect(out[0]).toBe("Identity step: nothing to do.");
    expect(withdrawn).toEqual([]);
  });

  it("keeps a login Renown refused to withdraw, says where to withdraw it, exits 1 and does the rest", async () => {
    legacyProject();
    answers = [
      {
        status: "refused",
        reason: "Forbidden: not the issuer",
        revokeUrl: `${RENOWN}/me`,
      },
    ];
    expect(await run(false)).toBe(1);
    const text = out.join("\n");
    expect(text).toContain(
      "Could not withdraw the project's Renown login of ada",
    );
    expect(text).toContain("Forbidden: not the issuer");
    expect(text).toContain(`Withdraw it with your wallet at ${RENOWN}/me`);
    expect(fs.existsSync(path.join(ph, ".renown.json"))).toBe(true);
    expect(
      readCredentialWithdrawal({
        dataDir: project,
        id: credentialRecordId({
          address: PERSON,
          chainId: 1,
          sessionDid: INSTANCE_DID,
        }),
      }),
    ).toBeUndefined();
    // The rest went on.
    expect(fs.existsSync(path.join(ph, "vetra", "agent"))).toBe(false);
    expect(fs.existsSync(path.join(ph, ".owner.json"))).toBe(false);
    expect(fs.existsSync(path.join(ph, "unsigned-writes"))).toBe(false);

    // Once Renown takes it, the next run finishes the item alone.
    out = [];
    expect(await run(false)).toBe(0);
    expect(fs.existsSync(path.join(ph, ".renown.json"))).toBe(false);
    expect(out.join("\n")).toContain("Withdrew the project's Renown login");
  });

  it("keeps the logins while Renown cannot be reached, and exits 1", async () => {
    legacyProject();
    answers = [
      { status: "unavailable", reason: "fetch failed" },
      { status: "unavailable", reason: "fetch failed" },
    ];
    expect(await run(false)).toBe(1);
    const text = out.join("\n");
    expect(text).toContain(
      `Could not withdraw the project's Renown login of ada (${PERSON}) at ${RENOWN}: fetch failed.`,
    );
    expect(text).toContain("Run `ph migrate --identity` again");
    expect(text).toContain(`${RENOWN}/me`);
    expect(fs.existsSync(path.join(ph, ".renown.json"))).toBe(true);
    expect(fs.existsSync(path.join(ph, "vetra", "agent", ".renown.json"))).toBe(
      true,
    );
    expect(text).not.toContain("Run `ph login` once");
  });

  it("deletes an expired login without asking Renown", async () => {
    write(path.join(ph, ".renown.json"), login(INSTANCE_DID, -1));
    expect(await run(false)).toBe(0);
    expect(withdrawn).toEqual([]);
    expect(fs.existsSync(path.join(ph, ".renown.json"))).toBe(false);
    expect(out.join("\n")).toMatch(
      /The project's Renown login of ada \(0x[0-9a-fA-F]{40}\) expired on [^:]+:\d\d:\d\d\.\d+Z: nothing to withdraw; kept its credential as a tombstone in \.ph\/credentials\/withdrawn\/ and deleted \.ph\/\.renown\.json\./,
    );
  });

  it("says which Renown it asks, and why", async () => {
    write(path.join(ph, ".renown.json"), login(INSTANCE_DID));
    write(path.join(ph, ".keypair.json"), '{"instance":"key"}');
    expect(await run(false)).toBe(0);
    expect(out).toContain(`  Asking Renown at ${RENOWN} (--renown-url).`);

    write(path.join(ph, ".renown.json"), login(INSTANCE_DID));
    out = [];
    await migrateIdentity(
      { projectDir: project, dryRun: true, renownUrl: RENOWN },
      io(),
    );
    expect(out.join("\n")).toMatch(
      /Would ask Renown at https:\/\/renown\.test \(the default, where `ph login` logged in before 6\.4; `--renown-url` names another\)\./,
    );
  });

  it("finishes a login withdrawn with the wallet since: Renown refuses the key, its read model says revoked", async () => {
    legacyProject();
    answers = [
      {
        status: "refused",
        reason: "Forbidden: not the issuer",
        revokeUrl: `${RENOWN}/me`,
      },
    ];
    checks = ["revoked"];
    expect(await run(false)).toBe(0);
    expect(checked).toEqual([
      {
        file: path.join(ph, ".renown.json"),
        keypair: path.join(ph, ".keypair.json"),
      },
    ]);
    expect(fs.existsSync(path.join(ph, ".renown.json"))).toBe(false);
    expect(tombstoneOf(INSTANCE_DID)).toMatchObject({ by: "command" });
    expect(out.join("\n")).toContain(
      `${RENOWN} withdrew the project's Renown login of ada (${PERSON}) already, so there was nothing to withdraw; kept its credential as a tombstone`,
    );
  });

  it("keeps a login Renown refuses while its read model holds it, and finishes once the wallet withdrew it", async () => {
    write(path.join(ph, ".renown.json"), login(INSTANCE_DID));
    write(path.join(ph, ".keypair.json"), '{"instance":"key"}');
    const refused: WithdrawResult = {
      status: "refused",
      reason: "Forbidden: not the issuer",
      revokeUrl: `${RENOWN}/me`,
    };
    answers = [refused];
    checks = ["active"];
    expect(await run(false)).toBe(1);
    expect(fs.existsSync(path.join(ph, ".renown.json"))).toBe(true);
    expect(out.join("\n")).toContain(
      `Withdraw it with your wallet at ${RENOWN}/me, then run \`ph migrate --identity\` again: it finds it withdrawn and finishes.`,
    );
    // Withdrawn with the wallet: the key is still refused, the read model says so.
    answers = [refused];
    checks = ["revoked"];
    out = [];
    expect(await run(false)).toBe(0);
    expect(fs.existsSync(path.join(ph, ".renown.json"))).toBe(false);
  });

  it("finishes a login whose key file is gone once Renown holds its credential no more", async () => {
    write(path.join(ph, ".renown.json"), login(INSTANCE_DID));
    for (const status of ["absent", "expired"] as const) {
      write(path.join(ph, ".renown.json"), login(INSTANCE_DID));
      answers = [
        {
          status: "unavailable",
          reason: `its session key ${path.join(ph, ".keypair.json")} is gone`,
          keyMissing: true,
        },
      ];
      checks = [status];
      out = [];
      expect(await run(false)).toBe(0);
      expect(fs.existsSync(path.join(ph, ".renown.json"))).toBe(false);
      expect(out.join("\n")).toContain(
        status === "absent"
          ? `${RENOWN} never held the project's Renown login`
          : `${RENOWN} holds the project's Renown login of ada (${PERSON}) as expired`,
      );
    }
  });

  it("withdraws a login whose key file is gone with the PH_RENOWN_PRIVATE_KEY key its credential names", async () => {
    write(path.join(ph, ".renown.json"), login(INSTANCE_DID));
    const keyPair = { publicKey: { kty: "EC" }, privateKey: { kty: "EC" } };
    const asked: string[] = [];
    answers = [
      {
        status: "unavailable",
        reason: "its session key is gone",
        keyMissing: true,
      },
      { status: "withdrawn" },
    ];
    checks = ["active"];
    expect(
      await run(false, {
        envKey: (did) => {
          asked.push(did);
          return Promise.resolve(did === INSTANCE_DID ? keyPair : undefined);
        },
      }),
    ).toBe(0);
    expect(asked).toEqual([INSTANCE_DID]);
    expect(withdrawn.at(-1)).toMatchObject({ keyPair });
    expect(fs.existsSync(path.join(ph, ".renown.json"))).toBe(false);
    expect(out.join("\n")).toContain(
      "with the key in PH_RENOWN_PRIVATE_KEY, which its credential names",
    );
  });

  it("keeps a login whose key is gone and that Renown still holds, pointing to the wallet", async () => {
    write(path.join(ph, ".renown.json"), login(INSTANCE_DID));
    answers = [
      {
        status: "unavailable",
        reason: "its session key is gone",
        keyMissing: true,
      },
    ];
    checks = ["unknown"];
    expect(await run(false)).toBe(1);
    expect(fs.existsSync(path.join(ph, ".renown.json"))).toBe(true);
    expect(out.join("\n")).toContain(
      `Withdraw it with your wallet at ${RENOWN}/me, then run \`ph migrate --identity\` again`,
    );
  });

  it("asks the read model nothing while Renown cannot be reached", async () => {
    write(path.join(ph, ".renown.json"), login(INSTANCE_DID));
    write(path.join(ph, ".keypair.json"), '{"instance":"key"}');
    answers = [{ status: "unavailable", reason: "fetch failed" }];
    expect(await run(false)).toBe(1);
    expect(checked).toEqual([]);
  });

  it("keeps a login that names no credential and points to the wallet, unless Renown holds it no more", async () => {
    const noId = () => {
      const stored = JSON.parse(login(INSTANCE_DID)) as {
        user: { credential: { id?: string } };
      };
      delete stored.user.credential.id;
      write(path.join(ph, ".renown.json"), JSON.stringify(stored));
    };
    noId();
    checks = ["active"];
    expect(await run(false)).toBe(0);
    expect(withdrawn).toEqual([]);
    expect(fs.existsSync(path.join(ph, ".renown.json"))).toBe(true);
    const text = out.join("\n");
    expect(text).toContain(
      "Kept .ph/.renown.json: the project's Renown login of ada",
    );
    expect(text).toContain(`Withdraw it with your wallet at ${RENOWN}/me`);
    expect(text).not.toContain("Run `ph login` once");

    checks = ["revoked"];
    out = [];
    expect(await run(false)).toBe(0);
    expect(fs.existsSync(path.join(ph, ".renown.json"))).toBe(false);
  });

  it("withdraws a login whose stored credential names no issuer without failing after it", async () => {
    const stored = JSON.parse(login(INSTANCE_DID)) as {
      user: { credential: { issuer?: unknown } };
    };
    delete stored.user.credential.issuer;
    write(path.join(ph, ".renown.json"), JSON.stringify(stored));
    expect(await run(false)).toBe(0);
    expect(fs.existsSync(path.join(ph, ".renown.json"))).toBe(false);
    expect(out.join("\n")).toContain(
      `Withdrew the project's Renown login of ada (${PERSON}) at ${RENOWN}; deleted .ph/.renown.json.`,
    );
  });

  it("keeps powerhouse.config.json's own layout when it removes a setting", async () => {
    const config = [
      "{",
      '\t"documentModelsDir": "./document-models",',
      '\t"auth": {',
      '\t\t"enabled": true,',
      '\t\t"ownerClaim": true',
      "\t}",
      "}",
      "",
    ].join("\r\n");
    write(path.join(project, "powerhouse.config.json"), config);
    expect(await run(false)).toBe(0);
    expect(
      fs.readFileSync(path.join(project, "powerhouse.config.json"), "utf8"),
    ).toBe(
      [
        "{",
        '\t"documentModelsDir": "./document-models",',
        '\t"auth": {',
        '\t\t"enabled": true',
        "\t}",
        "}",
        "",
      ].join("\r\n"),
    );
    expect(jsonLike('{"a":1}', { b: 2 })).toBe('{"b":2}');
    expect(jsonLike('{\n    "a": 1\n}\n', { b: 2 })).toBe('{\n    "b": 2\n}\n');
  });

  it("removes nothing that holds the identity home", async () => {
    legacyProject();
    const home = path.join(ph, "vetra", "agent", "identities");
    fs.mkdirSync(home, { recursive: true });
    expect(await run(false, { env: { PH_IDENTITY_HOME: home } })).toBe(0);
    expect(fs.existsSync(home)).toBe(true);
    expect(fs.existsSync(path.join(ph, "vetra", "agent", ".renown.json"))).toBe(
      true,
    );
    expect(out.join("\n")).toContain(
      `Kept .ph/vetra/agent: it holds the identity home ${home} (PH_IDENTITY_HOME)`,
    );
    // The rest went on.
    expect(fs.existsSync(path.join(ph, ".renown.json"))).toBe(false);
    expect(fs.existsSync(path.join(ph, ".owner.json"))).toBe(false);
  });

  it("outside a project acts on PH_USER_DATA_DIR's .ph alone, and refuses without it", async () => {
    await expect(
      migrateIdentity({ dryRun: false, renownUrl: RENOWN }, io()),
    ).rejects.toThrow(/acts on a project/);
    const dataDir = path.join(root, "data");
    write(
      path.join(dataDir, ".ph", ".owner.json"),
      JSON.stringify({ owner: OWNER }),
    );
    expect(
      await migrateIdentity(
        { dryRun: false, renownUrl: RENOWN },
        io({
          env: {
            PH_IDENTITY_HOME: path.join(root, "home"),
            PH_USER_DATA_DIR: dataDir,
          },
        }),
      ),
    ).toBe(0);
    expect(fs.existsSync(path.join(dataDir, ".ph", ".owner.json"))).toBe(false);
    expect(out.join("\n")).toContain("Deleted .ph/.owner.json");
  });

  it("reports the host files' dead settings by line, and the .ph files git tracks", async () => {
    write(
      path.join(project, "hosts", "switchboard", "host.js"),
      [
        "export default {",
        "  config: { switchboard: { auth: { ownerClaim: true,",
        '    renown: { source: "kept" } } } },',
        "};",
      ].join("\n"),
    );
    fs.mkdirSync(ph, { recursive: true });
    write(path.join(ph, ".gitignore"), "*\n");
    expect(
      await run(false, { gitTracked: () => [".keypair.json", ".gitignore"] }),
    ).toBe(0);
    const text = out.join("\n");
    expect(text).toContain(
      "hosts/switchboard/host.js:2: auth.ownerClaim is no longer read; remove it.",
    );
    expect(text).toContain(
      "hosts/switchboard/host.js:3: auth.renown.source (RENOWN_SOURCE) is no longer read; remove it.",
    );
    expect(text).toContain("git tracks 1 file(s) in .ph");
    expect(text).toContain("git rm -r --cached .ph");
    // The host file itself is the person's to edit.
    expect(
      fs.readFileSync(
        path.join(project, "hosts", "switchboard", "host.js"),
        "utf8",
      ),
    ).toContain("ownerClaim");
  });

  it("names who administers the host over HTTP", async () => {
    write(path.join(project, ".env"), `ADMINS=${OWNER}\n`);
    await run(false, {
      env: { PH_IDENTITY_HOME: path.join(root, "home"), ADMINS: PERSON },
    });
    expect(out.at(-1)).toBe(
      `  Administered over HTTP by ADMINS: ${PERSON}; ADMINS in .env: ${OWNER}, and by whoever runs the host.`,
    );
  });
});

describe("ph migrate --identity", () => {
  const cli = (args: string[]) => {
    const env: Record<string, string | undefined> = {
      ...process.env,
      PH_IDENTITY_HOME: path.join(root, "home"),
      PH_NO_TELEMETRY: "1",
      BROWSER: "none",
    };
    delete env.PH_USER_DATA_DIR;
    delete env.PH_CALLER_CWD;
    return spawnSync(process.execPath, [PH_CLI, "migrate", ...args], {
      cwd: project,
      encoding: "utf8",
      windowsHide: true,
      timeout: 60_000,
      env,
    });
  };

  it("runs the identity step alone, and honours --dry-run", () => {
    write(path.join(project, "package.json"), '{"name":"legacy"}');
    legacyProject();
    const before = tree(project);
    const result = cli(["--identity", "--dry-run"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Identity step (dry run");
    expect(result.stdout).toContain(
      "Would withdraw the project's Renown login",
    );
    expect(tree(project)).toEqual(before);
  }, 60_000);

  it("takes no version and no other step", () => {
    write(path.join(project, "package.json"), '{"name":"legacy"}');
    write(path.join(project, "powerhouse.config.json"), "{}");
    const result = cli(["--identity", "dev"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--identity runs the identity step alone");
  }, 60_000);

  it("stops outside a Powerhouse project, touching nothing there", () => {
    write(path.join(project, ".env"), "RENOWN_SOURCE=kept\n");
    write(path.join(ph, ".owner.json"), JSON.stringify({ owner: OWNER }));
    const before = tree(project);
    const result = cli(["--identity"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("not in a Powerhouse project");
    expect(tree(project)).toEqual(before);
  }, 60_000);
});

describe("ph migrate with a version", () => {
  it("checks the version before the identity step withdraws anything", async () => {
    write(path.join(project, "package.json"), '{"name":"legacy"}');
    legacyProject();
    const before = tree(project);
    vi.mocked(resolveMigrateTarget).mockRejectedValueOnce(
      new Error('Failed to resolve "x" from the npm registry'),
    );
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(project);
    const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`exit ${String(code)}`);
    });
    try {
      await expect(
        migrate.handler({
          versionPositional: undefined,
          version: "x",
          force: undefined,
          debug: undefined,
          subgraphs: undefined,
          subgraph: [],
          documentModels: undefined,
          documentModel: [],
          renameConflictingTypes: undefined,
          strictResolvers: undefined,
          identity: undefined,
          renownUrl: RENOWN,
          dryRun: undefined,
        }),
      ).rejects.toThrow(/Failed to resolve "x"/);
    } finally {
      cwd.mockRestore();
      exit.mockRestore();
    }
    expect(tree(project)).toEqual(before);
    expect(fetched).toEqual([]);
    expect(vi.mocked(startMigrate)).not.toHaveBeenCalled();
  });
});

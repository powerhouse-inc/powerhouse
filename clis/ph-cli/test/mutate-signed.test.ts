/**
 * `ph mutate` end to end: a real switchboard in this process (in memory, its
 * own data folder), a project whose run record names it, and the command's
 * service run in that project with a temporary identity home. The person is
 * a pseudonym made on the spot; ph-cli's session "ph-cli" in the home folder
 * signs, its credential enrolled at the switchboard over HTTP. Every
 * operation the command wrote names that session for the person; none is
 * the switchboard's.
 */
import { writeRunRecord, type RunRecord } from "@powerhousedao/host-core";
import { listCredentialRecords } from "@powerhousedao/shared/clis/credential-records";
import { readActiveIdentity } from "@powerhousedao/shared/clis/identity";
import { sessionFilePath } from "@powerhousedao/shared/clis/sessions";
import type { Operation } from "@powerhousedao/shared/document-model";
import {
  startSwitchboard,
  type SwitchboardReactor,
} from "@powerhousedao/switchboard/server";
import { createSignatureVerifier } from "@renown/sdk";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  describeRefusal,
  MUTATE_SESSION_LABEL,
  mutatePlan,
  refusalsOf,
  runMutate,
  switchboardEndpoint,
  type MutateArgs,
} from "../src/services/mutate.js";

const PROJECT_NAME = "mutate-signed-test";

let root: string;
let project: string;
let hostDir: string;
let home: string;
let switchboard: SwitchboardReactor | undefined;
let origin: string;
let out: string[];
let err: string[];

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-mutate-"));
  project = path.join(root, "project");
  hostDir = path.join(root, "host");
  home = path.join(root, "identities");
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(hostDir, { recursive: true });
  fs.writeFileSync(
    path.join(project, "package.json"),
    JSON.stringify({ name: PROJECT_NAME, private: true }),
  );
  fs.writeFileSync(path.join(project, "powerhouse.config.json"), "{}");

  switchboard = await startSwitchboard(
    {
      server: { port: 0, host: "127.0.0.1" },
      storage: { inMemory: true, userDataDir: hostDir },
      features: { workflows: false, mcp: false },
      packages: { disableLocal: true, list: [] },
      identity: {
        keypairPath: path.join(root, "switchboard", ".keypair.json"),
        storagePath: path.join(root, "switchboard", ".renown.json"),
      },
      protocol: { createSignaturePolicy: "legacy" },
      // A drive to file documents in, which the host itself creates.
      drive: { slug: "vetra", global: { name: "Vetra" } },
    },
    { signalHandlers: false, fatalErrorShutdown: false },
  );
  origin = `http://127.0.0.1:${switchboard.port}`;
  // The project's dev host, as `ph dev` records it: this process, its
  // switchboard member's endpoints.
  const record: RunRecord = {
    version: 2,
    host: "dev",
    projectName: PROJECT_NAME,
    kind: "compound",
    verb: "dev",
    pid: process.pid,
    startedAt: new Date().toISOString(),
    members: {
      switchboard: {
        host: "switchboard",
        runnerModule: "@powerhousedao/ph-cli/runners/switchboard",
        kind: "reactor",
        verb: "dev",
        outputs: {
          origin,
          endpoints: { graphql: `${origin}/graphql` },
          drives: {},
        },
      },
    },
  };
  writeRunRecord(project, record);
}, 120_000);

afterAll(async () => {
  await switchboard?.shutdown();
  fs.rmSync(root, { recursive: true, force: true });
}, 60_000);

beforeEach(() => {
  out = [];
  err = [];
});

const io = () => ({
  out: (line: string) => out.push(line),
  err: (line: string) => err.push(line),
  env: { PH_IDENTITY_HOME: home },
  cwd: project,
  interactive: false,
});

async function mutate(args: MutateArgs): Promise<Record<string, unknown>> {
  out = [];
  err = [];
  const code = await runMutate({ ...args, json: true }, io());
  expect(code, err.join("\n")).toBe(0);
  return JSON.parse(out.join("\n")) as Record<string, unknown>;
}

/** Every operation of `documentId`, all scopes. */
async function operationsOf(documentId: string): Promise<Operation[]> {
  const page = await switchboard!.reactor.getOperations(
    documentId,
    undefined,
    undefined,
    { cursor: "", limit: 1000 },
  );
  return page.results;
}

/** The person's pseudonym and ph-cli's session key. */
function signerOfCommand(): { address: string; sessionKey: string } {
  const person = readActiveIdentity({
    dataDir: project,
    env: { PH_IDENTITY_HOME: home },
  });
  const file = sessionFilePath({
    place: "home",
    label: MUTATE_SESSION_LABEL,
    address: person!.address,
    dataDir: project,
    env: { PH_IDENTITY_HOME: home },
  });
  const session = JSON.parse(fs.readFileSync(file, "utf8")) as { did: string };
  return { address: person!.address, sessionKey: session.did };
}

/** Each operation names ph-cli's session for the person, and verifies against its key. */
async function expectSignedByCommand(operations: Operation[]): Promise<void> {
  expect(operations.length).toBeGreaterThan(0);
  const { address, sessionKey } = signerOfCommand();
  const switchboardKey = switchboard!.renown?.signer.app?.key;
  const verify = createSignatureVerifier(true);
  for (const operation of operations) {
    const signer = operation.action.context?.signer;
    expect(signer?.user.address).toBe(address);
    expect(signer?.app).toEqual({
      name: MUTATE_SESSION_LABEL,
      key: sessionKey,
    });
    expect(signer?.signatures.at(-1)?.[1]).toBe(sessionKey);
    expect(signer?.app.key).not.toBe(switchboardKey);
    expect(await verify(operation, sessionKey)).toBe(true);
  }
}

describe("ph mutate on a real switchboard", () => {
  it("creates a document in a drive, every write signed by the ph-cli session for the person", async () => {
    const created = await mutate({
      create: "powerhouse/document-model",
      parent: "vetra",
      name: "Mutated Model",
    });
    const documentId = created.documentId as string;
    expect(created).toMatchObject({
      documentType: "powerhouse/document-model",
      name: "Mutated Model",
      signer: { session: MUTATE_SESSION_LABEL },
    });

    // The pseudonym, made when the first write was to be signed, and the
    // session's credential enrolled at the switchboard over HTTP.
    const { address, sessionKey } = signerOfCommand();
    expect(listCredentialRecords({ dataDir: hostDir })).toMatchObject([
      {
        address: address.toLowerCase(),
        sessionDid: sessionKey,
        label: MUTATE_SESSION_LABEL,
      },
    ]);

    const operations = await operationsOf(documentId);
    expect(operations.map((op) => op.action.type)).toEqual(
      expect.arrayContaining(["CREATE_DOCUMENT", "UPGRADE_DOCUMENT"]),
    );
    await expectSignedByCommand(operations);

    const drive = await switchboard!.reactor.get("vetra");
    const filing = (await operationsOf(drive.header.id)).filter(
      (op) =>
        (op.action.type === "ADD_FILE" &&
          (op.action.input as { id?: string }).id === documentId) ||
        (op.action.type === "ADD_RELATIONSHIP" &&
          (op.action.input as { targetId?: string }).targetId === documentId),
    );
    expect(filing.map((op) => op.action.type).sort()).toEqual([
      "ADD_FILE",
      "ADD_RELATIONSHIP",
    ]);
    await expectSignedByCommand(filing);
  }, 120_000);

  it("sends one action, then a file of them, plain objects with no model", async () => {
    const { documentId } = (await mutate({
      create: "powerhouse/document-model",
      name: "Changed Model",
    })) as { documentId: string };

    // One action, at the switchboard's base URL.
    const one = await mutate({
      document: documentId,
      type: "SET_MODEL_NAME",
      input: JSON.stringify({ name: "Renamed" }),
      url: origin,
    });
    expect(one).toMatchObject({ documentId, actions: ["SET_MODEL_NAME"] });

    // A file of two, each signed in turn.
    const file = path.join(project, "actions.json");
    fs.writeFileSync(
      file,
      JSON.stringify([
        { type: "SET_MODEL_ID", input: { id: "test/mutated" } },
        {
          type: "SET_MODEL_DESCRIPTION",
          input: { description: "By ph mutate" },
        },
      ]),
    );
    const many = await mutate({
      document: documentId,
      actions: "actions.json",
    });
    expect(many).toMatchObject({
      documentId,
      actions: ["SET_MODEL_ID", "SET_MODEL_DESCRIPTION"],
    });

    const written = (await operationsOf(documentId)).filter((op) =>
      ["SET_MODEL_NAME", "SET_MODEL_ID", "SET_MODEL_DESCRIPTION"].includes(
        op.action.type,
      ),
    );
    expect(written.map((op) => op.action.type)).toEqual([
      "SET_MODEL_NAME",
      "SET_MODEL_ID",
      "SET_MODEL_DESCRIPTION",
    ]);
    await expectSignedByCommand(written);
    const document = await switchboard!.reactor.get(documentId);
    expect((document.state as { global?: unknown }).global).toMatchObject({
      name: "Renamed",
      id: "test/mutated",
      description: "By ph mutate",
    });

    // As a person reads it.
    out = [];
    expect(
      await runMutate(
        {
          document: documentId,
          type: "SET_AUTHOR_NAME",
          input: JSON.stringify({ authorName: "Ada" }),
        },
        io(),
      ),
    ).toBe(0);
    expect(out[0]).toMatch(
      /^Signed SET_AUTHOR_NAME on [^ ]+ as session "ph-cli" for Anonymous 0x[0-9a-fA-F]{4}\.\.\.[0-9a-fA-F]{4}: global revision \d+\.$/,
    );
  }, 120_000);

  it("deletes a filed document by its own signed DELETE_DOCUMENT, which the switchboard completes", async () => {
    const { documentId } = (await mutate({
      create: "powerhouse/document-model",
      parent: "vetra",
      name: "Deleted Model",
    })) as { documentId: string };
    expect(await mutate({ delete: documentId })).toMatchObject({
      documentId,
      deleted: true,
    });
    await expect(switchboard!.reactor.get(documentId)).rejects.toThrow();
    const drive = await switchboard!.reactor.get("vetra");
    const unfiled = (await operationsOf(drive.header.id)).filter(
      (op) =>
        op.action.type === "DELETE_NODE" &&
        (op.action.input as { id?: string }).id === documentId,
    );
    // The drive entry is the switchboard's own work, bound to the signed delete.
    expect(unfiled).toHaveLength(1);
  }, 120_000);

  it("says what the switchboard answered when it refuses, and exits 1", async () => {
    expect(
      await runMutate(
        {
          document: "no-such-document",
          type: "SET_MODEL_NAME",
          input: "{}",
        },
        io(),
      ),
    ).toBe(1);
    expect(err.join("\n")).toMatch(/^(Refused|Failed)/);
    expect(err.join("\n")).toContain("no-such-document");
  }, 60_000);
});

describe("ph mutate's arguments", () => {
  const plan = (args: MutateArgs) =>
    mutatePlan(args, { cwd: project, makeId: () => "id" });

  it("takes one form at a time, and names the forms otherwise", () => {
    expect(() => plan({})).toThrow(/ph mutate <document> <TYPE>/);
    expect(() =>
      plan({ create: "powerhouse/document-model", document: "doc" }),
    ).toThrow(/--create takes no <document>/);
    expect(() => plan({ delete: "doc", input: "{}" })).toThrow(
      /--delete takes no --input/,
    );
    expect(() => plan({ document: "doc", type: "X", cascade: true })).toThrow(
      /takes no --cascade/,
    );
    expect(() => plan({ document: "doc" })).toThrow(/Name the action's type/);
    expect(() =>
      plan({ document: "doc", type: "X", input: "{}", inputFile: "f" }),
    ).toThrow(/--input or --input-file/);
    expect(() => plan({ document: "doc", type: "X", input: "{" })).toThrow(
      /--input is no JSON/,
    );
  });

  it("builds plain actions: global and {} unless told", () => {
    expect(plan({ document: "doc", type: "SET_NAME" })).toMatchObject({
      kind: "actions",
      branch: "main",
      actions: [{ id: "id", type: "SET_NAME", scope: "global", input: {} }],
    });
    expect(
      plan({
        document: "doc",
        type: "SET_THING",
        input: '{"a":1}',
        scope: "local",
        branch: "draft",
      }),
    ).toMatchObject({
      branch: "draft",
      actions: [{ type: "SET_THING", scope: "local", input: { a: 1 } }],
    });
    expect(plan({ delete: "doc", cascade: true })).toEqual({
      kind: "delete",
      document: "doc",
      cascade: true,
    });
  });

  it("names a switchboard by its GraphQL endpoint or its base URL", () => {
    expect(switchboardEndpoint("http://h:4001")).toEqual({
      graphql: "http://h:4001/graphql",
      base: "http://h:4001",
    });
    expect(switchboardEndpoint("https://h/api/graphql/")).toEqual({
      graphql: "https://h/api/graphql",
      base: "https://h/api",
    });
    expect(() => switchboardEndpoint("ftp://h")).toThrow(/http\(s\)/);
  });

  it("prints a refusal's code, reason and fix", () => {
    const refusal = {
      response: {
        errors: [
          {
            message:
              "Refused: this host signs no writes for its callers (Powerhouse 6.4). ...",
            extensions: { code: "UNSIGNED_WRITE", reason: "host-built" },
          },
        ],
      },
    };
    const [first] = refusalsOf(new Error("wrapped", { cause: refusal }));
    expect(describeRefusal(first!)).toBe(
      "Refused (UNSIGNED_WRITE, host-built): Refused: this host signs no writes for its callers (Powerhouse 6.4). ...",
    );
    expect(describeRefusal({ code: "FORBIDDEN", message: "No." })).toBe(
      "Refused (FORBIDDEN): No.",
    );
  });

  it("finds no switchboard where the project runs none", async () => {
    const empty = path.join(root, "empty");
    fs.mkdirSync(empty, { recursive: true });
    fs.writeFileSync(path.join(empty, "powerhouse.config.json"), "{}");
    expect(
      await runMutate(
        { document: "doc", type: "SET_NAME" },
        { ...io(), cwd: empty },
      ),
    ).toBe(1);
    expect(err[0]).toMatch(/No switchboard of the project .* is running/);
  });
});

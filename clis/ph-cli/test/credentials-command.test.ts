import {
  credentialRecordFile,
  readCredentialWithdrawal,
  writeCredentialRecord,
} from "@powerhousedao/shared/clis/credential-records";
import { resolveActiveIdentity } from "@renown/sdk/identity";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  runCredentialsList,
  runCredentialsWithdraw,
} from "../src/services/credentials.js";

// A well-known Anvil dev key; never used for anything real.
const KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

let root: string;
let dataDir: string;
let lines: string[];
const print = (line: string) => lines.push(line);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-cli-credentials-"));
  dataDir = path.join(root, "store");
  lines = [];
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

async function record(session: string, label: string, days = 30) {
  const identity = await resolveActiveIdentity({
    dataDir,
    interactive: false,
    env: { PH_IDENTITY_KEY: KEY, PH_IDENTITY_HOME: path.join(root, "home") },
  });
  const credential = await identity!.issueSessionCredential!(session, {
    label,
    expiresInDays: days,
  });
  return writeCredentialRecord({ dataDir, credential, source: "cli" });
}

describe("ph credentials", () => {
  it("lists records with who, label, source, expiry and state", async () => {
    await record("did:key:zAgent", "vetra agent");
    await record("did:key:zOld", "old session", -1);
    expect(await runCredentialsList({ dataDir }, print)).toBe(0);
    expect(lines[0]).toMatch(/^ID\s+WHO\s+LABEL\s+SOURCE\s+EXPIRES\s+STATE$/);
    expect(lines.find((l) => l.includes("vetra agent"))).toMatch(
      /0x7099\.\.\.79c8\s+vetra agent\s+cli\s+\d{4}-\d\d-\d\d\s+valid$/,
    );
    expect(lines.find((l) => l.includes("old session"))).toMatch(/expired$/);
  });

  it("says when there is nothing, and prints JSON", async () => {
    expect(await runCredentialsList({ dataDir }, print)).toBe(0);
    expect(lines).toEqual([`No credential records in ${dataDir}.`]);
    lines = [];
    const { id } = await record("did:key:zAgent", "vetra agent");
    await runCredentialsList({ dataDir, json: true }, print);
    const listed = JSON.parse(lines.join("\n")) as {
      records: { id: string; state: string; label: string }[];
    };
    expect(listed.records).toEqual([
      expect.objectContaining({ id, state: "valid", label: "vetra agent" }),
    ]);
  });

  it("withdraws by id prefix and keeps the withdrawal, which --all lists", async () => {
    const { id } = await record("did:key:zAgent", "vetra agent");
    expect(
      runCredentialsWithdraw({ dataDir, targets: [id.slice(0, 8)] }, print),
    ).toBe(0);
    expect(lines[0]).toMatch(/^Withdrew .*vetra agent.*next request\.$/);
    expect(fs.existsSync(credentialRecordFile(dataDir, id))).toBe(false);
    expect(readCredentialWithdrawal({ dataDir, id })?.by).toBe("command");
    lines = [];
    await runCredentialsList({ dataDir, all: true }, print);
    expect(lines.join("\n")).toMatch(/Withdrawn:\n.*\n.*vetra agent\s+command/);
  });

  it("refuses an ambiguous or unknown target, withdrawing nothing for it", async () => {
    await record("did:key:zOne", "agent");
    await record("did:key:zTwo", "agent");
    expect(runCredentialsWithdraw({ dataDir, targets: ["agent"] }, print)).toBe(
      1,
    );
    expect(lines[0]).toBe("agent matches 2 records; name one by its id:");
    expect(
      runCredentialsWithdraw({ dataDir, targets: ["nobody"] }, print),
    ).toBe(1);
    expect(runCredentialsWithdraw({ dataDir, targets: [] }, print)).toBe(1);
  });

  it("removes expired records with --expired", async () => {
    await record("did:key:zLive", "live");
    await record("did:key:zOld", "old", -1);
    expect(
      runCredentialsWithdraw({ dataDir, targets: [], expired: true }, print),
    ).toBe(0);
    expect(lines).toEqual(["Removed 1 expired record and 0 old tombstones."]);
  });
});

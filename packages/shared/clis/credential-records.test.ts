import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  credentialBindingOf,
  credentialRecordFile,
  credentialRecordId,
  credentialRecordsDir,
  credentialWithdrawalFile,
  CredentialWithdrawnError,
  listCredentialRecords,
  listCredentialWithdrawals,
  pruneCredentialRecords,
  readCredentialRecord,
  readCredentialWithdrawal,
  writeCredentialRecord,
  writeCredentialWithdrawal,
  withdrawCredentialRecords,
  type CredentialLike,
} from "./credential-records.js";
import { fileAccessList } from "./owner-only.js";

const ADDRESS = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf";
const SESSION = "did:key:zDnaeSession";

function credential(
  o: {
    issued?: string;
    expires?: string;
    session?: string;
    label?: string;
  } = {},
): CredentialLike {
  return {
    id: `urn:uuid:${Math.random().toString(16).slice(2)}`,
    issuer: {
      id: `did:pkh:eip155:1:${ADDRESS.toLowerCase()}`,
      ethereumAddress: ADDRESS,
    },
    credentialSubject: { id: o.session ?? SESSION, app: o.label ?? "agent X" },
    issuanceDate: o.issued ?? "2026-11-24T10:00:00.000Z",
    expirationDate: o.expires ?? "2026-12-24T10:00:00.000Z",
    proof: { proofValue: "0x00" },
  };
}

let dataDir: string;
beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ph-credential-records-"));
});
afterEach(() => fs.rmSync(dataDir, { recursive: true, force: true }));

describe("credential records", () => {
  it("names a record by its binding, the same whatever the address case", () => {
    const id = credentialRecordId({
      address: ADDRESS,
      chainId: 1,
      sessionDid: SESSION,
    });
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(
      credentialRecordId({
        address: ADDRESS.toLowerCase(),
        chainId: 1,
        sessionDid: SESSION,
      }),
    ).toBe(id);
    expect(
      credentialRecordId({ address: ADDRESS, chainId: 2, sessionDid: SESSION }),
    ).not.toBe(id);
    expect(credentialBindingOf(credential())).toEqual({
      address: ADDRESS.toLowerCase(),
      chainId: 1,
      sessionDid: SESSION,
    });
    // A malformed stored credential names no binding, and throws nothing.
    const { issuer: _issuer, ...noIssuer } = credential();
    expect(
      credentialBindingOf(noIssuer as unknown as CredentialLike),
    ).toBeUndefined();
  });

  it("keeps a withdrawn credential in its tombstone when the withdrawer hands it over", () => {
    const given = credential({ label: "renown-app" });
    const binding = credentialBindingOf(given)!;
    const tombstone = writeCredentialWithdrawal({
      dataDir,
      binding,
      by: "command",
      credentialId: given.id,
      credential: given,
    });
    expect(tombstone.credential).toEqual(given);
    expect(
      readCredentialWithdrawal({ dataDir, id: credentialRecordId(binding) }),
    ).toMatchObject({ by: "command", credential: { id: given.id } });
    // Without one, the tombstone holds none.
    const other = credentialBindingOf(
      credential({ session: "did:key:zOther" }),
    )!;
    expect(
      writeCredentialWithdrawal({ dataDir, binding: other, by: "host" }),
    ).not.toHaveProperty("credential");
  });

  it("writes a record its user alone may read, and reads it back", () => {
    const given = credential();
    const { id, file } = writeCredentialRecord({
      dataDir,
      credential: given,
      source: "cli",
      writtenBy: "test",
    });
    expect(file).toBe(credentialRecordFile(dataDir, id));
    expect(path.dirname(file)).toBe(credentialRecordsDir(dataDir));
    const record = readCredentialRecord({ dataDir, id });
    expect(record).toMatchObject({
      format: "ph-credential-record",
      version: 1,
      address: ADDRESS.toLowerCase(),
      chainId: 1,
      sessionDid: SESSION,
      label: "agent X",
      source: "cli",
      writtenBy: "test",
      credential: given,
    });
    if (process.platform === "win32") {
      expect(fileAccessList(file)).toHaveLength(1);
    } else {
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    }
    expect(listCredentialRecords({ dataDir }).map((r) => r.id)).toEqual([id]);
  });

  it("withdraws: the tombstone is written before the record goes", () => {
    const given = credential();
    const { id } = writeCredentialRecord({
      dataDir,
      credential: given,
      source: "cli",
    });
    const [withdrawal] = withdrawCredentialRecords({
      dataDir,
      ids: [id],
      by: "command",
    });
    expect(withdrawal).toMatchObject({
      id,
      credentialId: given.id,
      expiresAt: given.expirationDate,
      by: "command",
    });
    expect(fs.existsSync(credentialRecordFile(dataDir, id))).toBe(false);
    expect(readCredentialWithdrawal({ dataDir, id })?.id).toBe(id);
    expect(listCredentialWithdrawals({ dataDir })).toHaveLength(1);
    expect(listCredentialRecords({ dataDir })).toEqual([]);
  });

  it("refuses a credential issued before its withdrawal; a newer one lifts it", () => {
    const { id } = writeCredentialRecord({
      dataDir,
      credential: credential(),
      source: "cli",
    });
    withdrawCredentialRecords({
      dataDir,
      ids: [id],
      by: "command",
      now: new Date("2026-11-25T00:00:00.000Z"),
    });
    expect(() =>
      writeCredentialRecord({
        dataDir,
        credential: credential(),
        source: "cli",
      }),
    ).toThrow(CredentialWithdrawnError);
    writeCredentialRecord({
      dataDir,
      credential: credential({ issued: "2026-11-26T00:00:00.000Z" }),
      source: "cli",
    });
    expect(readCredentialRecord({ dataDir, id })).toBeDefined();
    expect(fs.existsSync(credentialWithdrawalFile(dataDir, id))).toBe(false);
  });

  it("lists records only, skipping drafts and stray files", () => {
    writeCredentialRecord({ dataDir, credential: credential(), source: "cli" });
    const dir = credentialRecordsDir(dataDir);
    fs.writeFileSync(path.join(dir, "notes.json"), "{}");
    fs.writeFileSync(path.join(dir, `${"a".repeat(32)}.json`), "{ not json");
    fs.writeFileSync(path.join(dir, `${"b".repeat(32)}.json.1.tmp`), "{}");
    expect(listCredentialRecords({ dataDir })).toHaveLength(1);
  });

  it("prunes expired records and tombstones of expired credentials", () => {
    const now = new Date("2026-12-01T00:00:00.000Z");
    const live = writeCredentialRecord({
      dataDir,
      credential: credential({ session: "did:key:zLive" }),
      source: "cli",
    });
    const old = writeCredentialRecord({
      dataDir,
      credential: credential({
        session: "did:key:zOld",
        expires: "2026-11-30T00:00:00.000Z",
      }),
      source: "cli",
    });
    const gone = writeCredentialRecord({
      dataDir,
      credential: credential({
        session: "did:key:zGone",
        expires: "2026-11-29T00:00:00.000Z",
      }),
      source: "cli",
    });
    withdrawCredentialRecords({ dataDir, ids: [gone.id], by: "command" });
    expect(pruneCredentialRecords({ dataDir, now })).toEqual({
      records: [old.id],
      withdrawals: [gone.id],
    });
    expect(listCredentialRecords({ dataDir }).map((r) => r.id)).toEqual([
      live.id,
    ]);
  });

  it("two processes writing one binding leave one whole record", async () => {
    const module = pathToFileURL(
      path.join(import.meta.dirname, "credential-records.ts"),
    ).href;
    const script = path.join(dataDir, "writer.mts");
    fs.writeFileSync(
      script,
      [
        `const { writeCredentialRecord } = await import(${JSON.stringify(module)});`,
        `const credential = JSON.parse(process.argv[2]);`,
        `for (let i = 0; i < 10; i++) writeCredentialRecord({ dataDir: process.argv[3], credential, source: "cli" });`,
      ].join("\n"),
    );
    const run = (label: string) =>
      new Promise<number | null>((resolve) => {
        const child = spawn(
          process.execPath,
          [
            "--import",
            "tsx",
            script,
            JSON.stringify(credential({ label })),
            dataDir,
          ],
          { windowsHide: true, stdio: "ignore" },
        );
        child.on("exit", resolve);
      });
    expect(await Promise.all([run("one"), run("two")])).toEqual([0, 0]);
    const records = listCredentialRecords({ dataDir });
    expect(records).toHaveLength(1);
    expect(["one", "two"]).toContain(records[0].label);
    expect(
      fs
        .readdirSync(credentialRecordsDir(dataDir))
        .filter((n) => n.endsWith(".tmp")),
    ).toEqual([]);
  }, 60_000);
});

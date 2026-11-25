import {
  listCredentialRecords,
  listCredentialWithdrawals,
  pruneCredentialRecords,
  withdrawCredentialRecords,
  type CredentialRecord,
} from "@powerhousedao/shared/clis/credential-records";
import {
  identityDataDir,
  shortAddress,
} from "@powerhousedao/shared/clis/identity";
import path from "node:path";

/**
 * `ph credentials`: the credentials this store's host accepts by its own
 * record (`<dataDir>/.ph/credentials`), and their withdrawal. Runs as the OS
 * user on the files; a running host refuses a withdrawn one at its next request.
 */

type Print = (line: string) => void;

type State = "valid" | "expired" | "does not verify";

function dataDirOf(args: { dataDir?: string }): string {
  return args.dataDir ? path.resolve(args.dataDir) : identityDataDir();
}

async function stateOf(record: CredentialRecord, now: number): Promise<State> {
  const { checkCredentialFor, expandCarriedCredential } =
    await import("@renown/sdk/node");
  const credential = expandCarriedCredential(record.credential);
  const network = record.credential.issuer.id.split(":")[2] ?? "";
  if (!credential) return "does not verify";
  const check = await checkCredentialFor(
    credential,
    {
      address: record.address,
      chainId: record.chainId,
      networkId: network,
      sessionDid: record.sessionDid,
    },
    now,
  );
  return check === "ok"
    ? "valid"
    : check === "expired"
      ? "expired"
      : "does not verify";
}

const day = (date: string | undefined) => (date ?? "").slice(0, 10) || "-";

function table(rows: string[][]): string[] {
  const widths = rows[0].map((_, i) =>
    Math.max(...rows.map((row) => row[i].length)),
  );
  return rows.map((row) =>
    row
      .map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i])))
      .join("  ")
      .trimEnd(),
  );
}

export async function runCredentialsList(
  args: { dataDir?: string; all?: boolean; json?: boolean },
  print: Print = console.log,
): Promise<number> {
  const dataDir = dataDirOf(args);
  const now = Date.now();
  const records = await Promise.all(
    listCredentialRecords({ dataDir }).map(async (record) => ({
      record,
      state: await stateOf(record, now),
    })),
  );
  const withdrawn = args.all ? listCredentialWithdrawals({ dataDir }) : [];
  if (args.json) {
    print(
      JSON.stringify(
        {
          dataDir,
          records: records.map(({ record, state }) => ({
            id: record.id,
            address: record.address,
            chainId: record.chainId,
            sessionDid: record.sessionDid,
            label: record.label,
            source: record.source,
            createdAt: record.createdAt,
            expiresAt: record.credential.expirationDate ?? null,
            state,
          })),
          ...(args.all ? { withdrawn } : {}),
        },
        null,
        2,
      ),
    );
    return 0;
  }
  if (records.length === 0) {
    print(`No credential records in ${dataDir}.`);
  } else {
    for (const line of table([
      ["ID", "WHO", "LABEL", "SOURCE", "EXPIRES", "STATE"],
      ...records.map(({ record, state }) => [
        record.id.slice(0, 8),
        shortAddress(record.address),
        record.label,
        record.source,
        day(record.credential.expirationDate),
        state,
      ]),
    ])) {
      print(line);
    }
  }
  if (args.all) {
    print("");
    if (withdrawn.length === 0) {
      print("No withdrawn credentials.");
    } else {
      print("Withdrawn:");
      for (const line of table([
        ["ID", "WHO", "LABEL", "BY", "WITHDRAWN"],
        ...withdrawn.map((w) => [
          w.id.slice(0, 8),
          shortAddress(w.address),
          w.label ?? "",
          w.by,
          day(w.withdrawnAt),
        ]),
      ])) {
        print(line);
      }
    }
  }
  return 0;
}

/** The records `target` names: an id prefix, an address, or a label. */
function matches(records: CredentialRecord[], target: string) {
  const lower = target.toLowerCase();
  return records.filter(
    (record) =>
      (/^[0-9a-f]{4,32}$/.test(lower) && record.id.startsWith(lower)) ||
      record.address === lower ||
      record.label === target,
  );
}

export function runCredentialsWithdraw(
  args: { targets: string[]; expired?: boolean; dataDir?: string },
  print: Print = console.log,
): number {
  const dataDir = dataDirOf(args);
  if (args.targets.length === 0 && !args.expired) {
    print(
      "Name the records to withdraw (an id prefix, an address or a label), or pass --expired.",
    );
    return 1;
  }
  let status = 0;
  if (args.expired) {
    const { records, withdrawals } = pruneCredentialRecords({ dataDir });
    print(
      `Removed ${records.length} expired record${records.length === 1 ? "" : "s"} and ${withdrawals.length} old tombstone${withdrawals.length === 1 ? "" : "s"}.`,
    );
  }
  const records = listCredentialRecords({ dataDir });
  const ids: string[] = [];
  for (const target of args.targets) {
    const found = matches(records, target);
    if (found.length === 0) {
      print(`No record matches ${target}.`);
      status = 1;
    } else if (found.length > 1) {
      print(`${target} matches ${found.length} records; name one by its id:`);
      for (const record of found) {
        print(
          `  ${record.id.slice(0, 8)}  ${shortAddress(record.address)}  ${record.label}`,
        );
      }
      status = 1;
    } else {
      ids.push(found[0].id);
    }
  }
  for (const withdrawal of withdrawCredentialRecords({
    dataDir,
    ids,
    by: "command",
  })) {
    print(
      `Withdrew ${withdrawal.id.slice(0, 8)} (${shortAddress(withdrawal.address)}, "${withdrawal.label ?? ""}"). A running host refuses it from its next request.`,
    );
  }
  return status;
}

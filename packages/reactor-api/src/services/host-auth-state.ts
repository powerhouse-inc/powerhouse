import {
  warnNotOwnerOnly,
  writeOwnerOnlyFile,
} from "@powerhousedao/shared/clis/owner-only";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

function readJson<T>(filePath: string): T | undefined {
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${filePath} is not valid JSON`);
  }
}

/** The owner: readable by the OS user only. */
function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  if (!writeOwnerOnlyFile(filePath, JSON.stringify(value, null, 2))) {
    warnNotOwnerOnly(filePath);
  }
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

/**
 * Refuses an owner claim on a host others can reach: the first stranger to sign
 * in would own it. A host binds every interface when it names none.
 */
export function assertOwnerClaimBind(host: string | undefined): void {
  if (host !== undefined && LOOPBACK_HOSTS.has(host)) return;
  throw new Error(
    `auth.ownerClaim needs a host bound to loopback, not ${host ?? "every interface"}: set the admins instead`,
  );
}

/**
 * Makes the first verified caller on a host with no admins its admin, so a
 * person's own computer needs no env file. `admins` is the list the auth and
 * authorization services read, so the claim takes effect at once. Inert when
 * admins are configured: a list someone wrote always wins.
 *
 * Only for a host that nobody else can reach before its owner does, which
 * `assertOwnerClaimBind` holds a host to.
 */
export class OwnerClaim {
  readonly #filePath: string;
  readonly #admins: string[];

  constructor(filePath: string, admins: string[]) {
    this.#filePath = filePath;
    this.#admins = admins;
    if (admins.length > 0) return;
    const recorded = readJson<{ owner?: unknown }>(filePath)?.owner;
    if (typeof recorded === "string" && recorded !== "") {
      admins.push(recorded.toLowerCase());
    }
  }

  observe(address: string): void {
    if (this.#admins.length > 0) return;
    const owner = address.toLowerCase();
    writeJson(this.#filePath, { owner });
    this.#admins.push(owner);
  }
}

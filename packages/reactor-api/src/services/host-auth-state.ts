import type { PowerhouseVerifiableCredential } from "@renown/sdk";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const partial = `${filePath}.tmp`;
  writeFileSync(partial, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(partial, filePath);
}

/**
 * Makes the first verified caller on a host with no admins its admin, so a
 * person's own computer needs no env file. `admins` is the list the auth and
 * authorization services read, so the claim takes effect at once. Inert when
 * admins are configured: a list someone wrote always wins.
 *
 * Only for a host that nobody else can reach before its owner does: the desktop
 * host binds loopback for this reason.
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

/** The credentials a host keeps to go on verifying people while Renown is away. */
export interface ICredentialKeep {
  get(
    address: string,
    chainId: number,
    appId: string,
  ): PowerhouseVerifiableCredential | undefined;
  set(
    address: string,
    chainId: number,
    appId: string,
    credential: PowerhouseVerifiableCredential,
  ): void;
  delete(address: string, chainId: number, appId: string): void;
}

/** Keeps them in one JSON file. They hold a public proof, not a secret. */
export class FileCredentialKeep implements ICredentialKeep {
  readonly #filePath: string;
  #entries: Record<string, PowerhouseVerifiableCredential>;

  constructor(filePath: string) {
    this.#filePath = filePath;
    this.#entries =
      readJson<Record<string, PowerhouseVerifiableCredential>>(filePath) ?? {};
  }

  get(
    address: string,
    chainId: number,
    appId: string,
  ): PowerhouseVerifiableCredential | undefined {
    return this.#entries[keyOf(address, chainId, appId)];
  }

  set(
    address: string,
    chainId: number,
    appId: string,
    credential: PowerhouseVerifiableCredential,
  ): void {
    const key = keyOf(address, chainId, appId);
    if (this.#entries[key]?.id === credential.id) return;
    this.#entries = { ...this.#entries, [key]: credential };
    writeJson(this.#filePath, this.#entries);
  }

  delete(address: string, chainId: number, appId: string): void {
    const key = keyOf(address, chainId, appId);
    if (!(key in this.#entries)) return;
    const { [key]: _removed, ...rest } = this.#entries;
    this.#entries = rest;
    writeJson(this.#filePath, this.#entries);
  }
}

function keyOf(address: string, chainId: number, appId: string): string {
  return `${address.toLowerCase()}|${chainId}|${appId}`;
}

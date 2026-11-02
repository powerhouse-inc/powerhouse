import { getConfig } from "@powerhousedao/config/node";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The config file's `ai.demoKeyFile`, made absolute from the config file's
 * folder. Unreadable or unset means this host has no demo key.
 */
export function demoKeyFileOf(configPath: string): string | undefined {
  let named: unknown;
  try {
    named = (getConfig(configPath) as { ai?: { demoKeyFile?: unknown } }).ai
      ?.demoKeyFile;
  } catch {
    return undefined;
  }
  if (typeof named !== "string" || named === "") return undefined;
  return path.resolve(path.dirname(path.resolve(configPath)), named);
}

/** The key in that file, read when asked, so it's in memory only then. */
export async function readDemoKey(
  file: string | undefined,
): Promise<string | undefined> {
  if (!file) return undefined;
  try {
    const key = (await readFile(file, "utf8")).trim();
    return key === "" ? undefined : key;
  } catch {
    return undefined;
  }
}

import { readFileSync } from "node:fs";
import { isPlainObject } from "remeda";

type ConfigFileFailure =
  | "missing"
  | "read-failed"
  | "parse-failed"
  | "not-an-object";

export class ConfigFileError extends Error {
  readonly reason: ConfigFileFailure;
  readonly path: string;

  constructor(reason: ConfigFileFailure, path: string, detail?: string) {
    super(
      `${path} could not be read as a Powerhouse config (${reason})${
        detail === undefined ? "" : `: ${detail}`
      }.`,
    );
    this.name = "ConfigFileError";
    this.reason = reason;
    this.path = path;
  }
}

/** Reads the config without defaults. Throws ConfigFileError on failure. */
export function getConfigStrict(path: string): Record<string, unknown> {
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch (error) {
    const code =
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : undefined;
    throw new ConfigFileError(
      code === "ENOENT" || code === "ENOTDIR" ? "missing" : "read-failed",
      path,
      code,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ConfigFileError(
      "parse-failed",
      path,
      error instanceof Error ? error.message : undefined,
    );
  }
  if (!isPlainObject(parsed)) {
    throw new ConfigFileError("not-an-object", path, typeof parsed);
  }
  return parsed;
}

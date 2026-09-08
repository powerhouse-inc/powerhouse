import { readFileSync } from "node:fs";
import { DEFAULT_CONFIG } from "../constants.js";
import type { PowerhouseConfig } from "../types.js";

export type ConfigFileErrorReason =
  | "not-found"
  | "read-failed"
  | "parse-failed"
  | "root-invalid";

export class ConfigFileError extends Error {
  readonly reason: ConfigFileErrorReason;

  constructor(reason: ConfigFileErrorReason, options?: ErrorOptions) {
    const messages: Record<ConfigFileErrorReason, string> = {
      "not-found": "The Powerhouse config file does not exist.",
      "read-failed": "The Powerhouse config file could not be read.",
      "parse-failed": "The Powerhouse config file is not valid JSON.",
      "root-invalid": "The Powerhouse config root must be a JSON object.",
    };
    super(messages[reason], options);
    this.name = "ConfigFileError";
    this.reason = reason;
  }
}

export function getConfigStrict(
  path = "./powerhouse.config.json",
): PowerhouseConfig {
  let source: string;
  try {
    source = readFileSync(path, "utf-8");
  } catch (error) {
    const reason =
      (error as NodeJS.ErrnoException).code === "ENOENT"
        ? "not-found"
        : "read-failed";
    throw new ConfigFileError(reason, { cause: error });
  }

  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new ConfigFileError("parse-failed", { cause: error });
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ConfigFileError("root-invalid");
  }

  return { ...DEFAULT_CONFIG, ...(value as Partial<PowerhouseConfig>) };
}

import { DEFAULT_CONFIG } from "../constants.js";
import type { PowerhouseConfig } from "../types.js";
import { getConfigStrict } from "./get-config-strict.js";

export function getConfig(path = "./powerhouse.config.json"): PowerhouseConfig {
  try {
    return getConfigStrict(path);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

import { readFileSync } from "node:fs";
import { DEFAULT_CONFIG } from "../constants.js";
import type { PowerhouseConfig } from "../types.js";

export function getConfig(path = "./powerhouse.config.json") {
  let config: PowerhouseConfig = { ...DEFAULT_CONFIG };
  try {
    const configStr = readFileSync(path, "utf-8");
    const userConfig = JSON.parse(configStr) as PowerhouseConfig;
    config = { ...config, ...userConfig };
  } catch {
    // console.warn("No powerhouse.config.json found, using defaults");
  }

  return config;
}

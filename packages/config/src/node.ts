import { readFileSync, writeFileSync } from "node:fs";
import type { PowerhouseConfig } from "./powerhouse.js";
import { DEFAULT_CONFIG } from "./powerhouse.js";

export function getConfig(path = "./powerhouse.config.json") {
  let config: PowerhouseConfig = { ...DEFAULT_CONFIG };
  try {
    const configStr = readFileSync(path, "utf-8");
    const userConfig = JSON.parse(configStr) as PowerhouseConfig;
    config = { ...config, ...userConfig };
  } catch {
    console.warn("No powerhouse.config.json found, using defaults");
  }

  return config;
}

export function writeConfig(
  config: PowerhouseConfig,
  path = "./powerhouse.config.json",
) {
  writeFileSync(path, JSON.stringify(config, null, 4));
}

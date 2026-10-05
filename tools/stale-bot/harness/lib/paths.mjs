/**
 * Path roots for the harness.
 *
 * Two roots matter and they are no longer the same directory:
 *
 *   repoRoot   — this repo (agent definitions, prompts, the harness itself)
 *   vaultRepo  — the Powerhouse knowledge vault repo, which owns the action
 *                linter (scripts/lint-actions.mjs) and the pipeline skills
 *                (skills/verify, skills/health) the pipeline agents run in
 *
 * Before the harness lived here it was inside the vault repo and one root
 * served both. `vaultRepo` is set once from config at startup; reading it
 * before then is a programming error and throws rather than guessing.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expandHome } from "./state.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/** This repo's root. */
export const repoRoot = join(here, "..", "..");

/** This repo's harness directory (config.json, repos.json live here). */
export const harnessDir = join(repoRoot, "harness");

/** This repo's agent definitions. */
export const agentsDir = join(repoRoot, "agents");

let configuredVaultRepo = null;

/** Set the vault repo root (from config.vaultRepo). Idempotent. */
export function setVaultRepo(path) {
  if (!path) throw new Error("setVaultRepo() needs a path");
  configuredVaultRepo = expandHome(path);
  return configuredVaultRepo;
}

/** The vault repo root. Throws if startup never configured it. */
export function vaultRepo() {
  if (!configuredVaultRepo) {
    throw new Error(
      "config.vaultRepo has not been set — loadConfig() must run before any vault operation",
    );
  }
  return configuredVaultRepo;
}

/** The vault repo's pre-dispatch action linter. */
export function lintActionsScript() {
  return join(vaultRepo(), "scripts", "lint-actions.mjs");
}

/** A skill that ships in the vault repo, e.g. skillPath("verify"). */
export function skillPath(name) {
  return join(vaultRepo(), "skills", name, "SKILL.md");
}

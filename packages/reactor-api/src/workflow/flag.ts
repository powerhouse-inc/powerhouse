import { getConfig } from "@powerhousedao/config/node";

export type WorkflowsFlagInput = {
  /** powerhouse.config.json to read `workflows.enabled` from. */
  configFile?: string;
  /** Host's own answer; wins over everything. */
  override?: boolean;
  /** Defaults to process.env; the tests pass their own. */
  env?: Record<string, string | undefined>;
};

function parseEnv(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  const value = raw.trim().toLowerCase();
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return undefined;
}

// Precedence: the host's override, then PH_WORKFLOWS_ENABLED, then the config
// file, then off. An unreadable config file means "not configured", not a boot
// failure: workflows are opt-in.
export function resolveWorkflowsEnabled({
  configFile,
  override,
  env = process.env,
}: WorkflowsFlagInput = {}): boolean {
  if (override !== undefined) return override;

  const fromEnv = parseEnv(env.PH_WORKFLOWS_ENABLED);
  if (fromEnv !== undefined) return fromEnv;

  if (configFile) {
    try {
      return getConfig(configFile).workflows?.enabled ?? false;
    } catch {
      return false;
    }
  }

  return false;
}

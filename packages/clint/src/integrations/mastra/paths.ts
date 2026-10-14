import { join } from "node:path";
import type { WorkdirStore } from "../../core/types.js";

/**
 * Options for getMastraPaths.
 */
export interface MastraPathOptions {
  /** Pre-packaged skill names under `.mastra/skills/`. */
  prePackagedSkills?: string[];
}

/**
 * Structured Mastra paths computed from a WorkdirStore.
 */
export interface MastraPaths {
  /** Root of the `.mastra` folder: `store.getStoreFolder('.mastra')`. */
  rootFolder: string;
  /** Database folder: `store.getStoreFolder('.mastra/db')`. */
  dbFolder: string;
  /** LibSQL database file path. */
  dbPath: string;
  /** The working directory — passed to Mastra as the Workspace basePath. */
  workspaceBasePath: string;
  /** Absolute skill paths: pre-packaged + runtime glob. */
  skillPaths: string[];
  /** Allowed paths for LocalFilesystem containment (the workdir itself). */
  allowedPaths: string[];
}

/**
 * Compute Mastra paths from a WorkdirStore.
 *
 * Layout:
 *   {workdir}/                              ← workspaceBasePath
 *     .ph/{cliName}/                        ← store root
 *       skills/                             ← runtime skills (glob **)
 *       .mastra/
 *         db/
 *           mastra.db                       ← LibSQL database
 *         skills/{skill}/SKILL.md           ← pre-packaged skills
 */
export function getMastraPaths(
  store: WorkdirStore,
  options?: MastraPathOptions,
): MastraPaths {
  const rootFolder = store.getStoreFolder(".mastra");
  const dbFolder = store.getStoreFolder(".mastra/db");
  const dbPath = join(dbFolder, "mastra.db");
  const workspaceBasePath = store.getWorkdir();

  const prePackaged = (options?.prePackagedSkills ?? []).map((name) =>
    store.getStoreFolder(join(".mastra", "skills", name)),
  );
  const runtimeGlob = store.getStoreFolder("skills") + "/**";

  const skillPaths = [...prePackaged, runtimeGlob];

  const allowedPaths = [workspaceBasePath];

  return {
    rootFolder,
    dbFolder,
    dbPath,
    workspaceBasePath,
    skillPaths,
    allowedPaths,
  };
}

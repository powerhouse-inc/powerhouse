import path from "node:path";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * What names one running instance at every layer (host runs, Cli services,
 * the desktop shell): a host and a data folder. The same key asked twice is
 * one instance; two data folders are two instances of the host.
 */
export interface InstanceKey {
  /** The host as `ph run` addresses it: its name, behind its package when an
   * installed package supplies it (`@acme/tools/studio`). */
  host: string;
  /** The folder that holds the instance's `.ph` tree: PH_USER_DATA_DIR when
   * set (a desktop shell's per-user folder), else the project folder. */
  dataDir: string;
  /** Both in one string, equal for equal keys. */
  id: string;
}

/** The data folder of a project: where its `.ph` tree is. */
export function instanceDataDir(
  projectDir: string = process.cwd(),
  env: Env = process.env,
): string {
  return path.resolve(env.PH_USER_DATA_DIR ?? projectDir);
}

/** The key of `host` (a record key, see `runRecordKey`) in a project. */
export function instanceKey(
  host: string,
  projectDir: string = process.cwd(),
  env: Env = process.env,
): InstanceKey {
  const dataDir = instanceDataDir(projectDir, env);
  // Windows paths name one folder in any case.
  const folder = process.platform === "win32" ? dataDir.toLowerCase() : dataDir;
  return { host, dataDir, id: `${host}@${folder}` };
}

/** The `.ph` tree of a data folder. */
export function instancePhDir(key: Pick<InstanceKey, "dataDir">): string {
  return path.join(key.dataDir, ".ph");
}

/** Where the run records of a data folder are: the one place they are kept. */
export function instanceRunDir(key: Pick<InstanceKey, "dataDir">): string {
  return path.join(instancePhDir(key), "run");
}

/** Where a Cli keeps the state of its services: under the data folder, so
 * two project folders never see each other's. */
export function instanceServicesDir(
  key: Pick<InstanceKey, "dataDir">,
  cliName: string,
): string {
  return path.join(instancePhDir(key), cliName, "services");
}

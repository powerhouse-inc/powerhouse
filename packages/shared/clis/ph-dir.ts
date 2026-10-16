import path from "node:path";

/**
 * The project's `.ph` tree — stores, identity, run records, registry cache.
 *
 * Classically `<cwd>/.ph` (every classic command resolves it exactly so). A
 * desktop shell relocates the WHOLE tree under the user's profile by setting
 * `PH_USER_DATA_DIR`: the tree is then `${userData}/.ph`, the same names
 * under a different root, and nothing of the user's lands in the install
 * dir. One resolver replaces the former `.ph/...` literals; it adds no path
 * names and no layout of its own.
 */
export function resolvePhDir(
  base: string = process.cwd(),
  env: Record<string, string | undefined> = process.env,
): string {
  return path.join(env.PH_USER_DATA_DIR ?? base, ".ph");
}

/**
 * The two PGlite store dirs the switchboard defaults to, for the server and
 * for `ph switchboard --reset` (which must touch the same paths). Without a
 * user-data root these are the classic literals, verbatim — byte-identical
 * to every classic boot log and reset prompt. Under PH_USER_DATA_DIR they
 * are the same names inside `${userData}/.ph`.
 */
export function defaultStoreDirs(
  env: Record<string, string | undefined> = process.env,
  phDir?: string,
): { reactor: string; readModel: string } {
  const root =
    phDir ?? (env.PH_USER_DATA_DIR ? resolvePhDir(undefined, env) : undefined);
  if (root === undefined) {
    return { reactor: "./.ph/reactor-storage", readModel: ".ph/read-storage" };
  }
  return {
    reactor: path.join(root, "reactor-storage"),
    readModel: path.join(root, "read-storage"),
  };
}

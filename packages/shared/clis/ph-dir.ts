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
 * What a `.ph` tree kept of identities and unsigned writes before Powerhouse
 * 6.4, none of which 6.4 reads: the project's Renown login (beside the
 * switchboard's own key, which stays), Studio's agent login, the owner claim,
 * the preview server's trusted keys, and a 6.3 host's record of the unsigned
 * writes it signed. `ph migrate`'s identity step withdraws and removes them;
 * a host that finds them says so and touches nothing.
 */
export function legacyIdentityPaths(phDir: string) {
  const agent = path.join(phDir, "vetra", "agent");
  return {
    projectLogin: {
      file: path.join(phDir, ".renown.json"),
      keypair: path.join(phDir, ".keypair.json"),
    },
    agent,
    agentLogin: {
      file: path.join(agent, ".renown.json"),
      keypair: path.join(agent, ".keypair.json"),
    },
    owner: path.join(phDir, ".owner.json"),
    trustedKeys: [
      path.join(phDir, "preview-trusted-keys.json"),
      path.join(phDir, "vetra", "preview-trusted-keys.json"),
    ],
    unsignedWrites: path.join(phDir, "unsigned-writes"),
  };
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

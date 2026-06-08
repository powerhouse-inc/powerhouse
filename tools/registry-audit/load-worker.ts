/**
 * Worker process for load.ts (Phase 5). Not a phase entry point - it is spawned
 * by load.ts (one per package) so a hang or hard crash is isolated to a single
 * child process. Argv[1] is the package name to load ("none" = baseline).
 *
 * Boots a Switchboard (in-process, in-memory PGlite) with the single named
 * package loaded, lists the registered document-model ids, then shuts down. It
 * prints exactly one machine-readable line for the parent to parse:
 *
 *   __SBLOAD__ {"ok":true,"ids":[...],"ms":1234}
 *
 * and exits 0 on success / 1 on any failure.
 *
 * The local Switchboard build is imported by absolute path (it is an app, not
 * hoisted into the root node_modules). load.ts runs this worker with its cwd set
 * to the package's install scaffold, so the Switchboard's package loader resolves
 * the named package (and its dependencies) from that scaffold's node_modules.
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { REPO_ROOT } from "./lib.js";

type DocModule = { documentModel?: { global?: { id?: string } } };
type SwitchboardHandle = {
  port: number;
  reactor: {
    getDocumentModelModules: () => Promise<
      { results?: DocModule[] } | DocModule[]
    >;
  };
  shutdown: () => Promise<void>;
};
type StartSwitchboard = (
  opts: Record<string, unknown>,
) => Promise<SwitchboardHandle>;

function emit(obj: unknown): void {
  console.log(`__SBLOAD__ ${JSON.stringify(obj)}`);
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  const ext = arg && arg !== "none" ? arg : undefined;
  const t0 = Date.now();

  const serverUrl = pathToFileURL(
    join(REPO_ROOT, "apps", "switchboard", "dist", "server.mjs"),
  ).href;
  const mod = (await import(serverUrl)) as {
    startSwitchboard: StartSwitchboard;
  };

  const sb = await mod.startSwitchboard({
    port: 0,
    strictPort: false,
    packages: ext ? [ext] : [],
    disableLocalPackages: true,
    mcp: false,
    enableDocumentModelSubgraphs: true,
  });

  const res = await sb.reactor.getDocumentModelModules();
  const arr = Array.isArray(res) ? res : (res.results ?? []);
  const ids = arr
    .map((m) => m?.documentModel?.global?.id ?? "")
    .filter((id): id is string => id.length > 0);

  await sb.shutdown();
  emit({ ok: true, ids, ms: Date.now() - t0 });
  // Force exit: the reactor/GraphQL stack can leave timers/handles open.
  process.exit(0);
}

main().catch((e: unknown) => {
  const error = e instanceof Error ? (e.stack ?? e.message) : String(e);
  emit({ ok: false, ids: [], error: error.slice(0, 2000) });
  process.exit(1);
});

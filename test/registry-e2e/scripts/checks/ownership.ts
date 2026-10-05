// Which publishes leave an owner row in Postgres, where version B reads package
// names from: Renown publishes, then a verdaccio account with Renown off.
import { verdaccioToken } from "../lib/auth.js";
import { pieceEndpoints, pkgPrefix, type Context } from "../lib/context.js";
import { poll, type PollResult } from "../lib/poll.js";
import { probePackage, publishProbe } from "../lib/publisher.js";
import { log } from "../lib/sh.js";
import { REPLICA_URL, type Stack } from "../lib/stack.js";

export interface OwnershipResult {
  /** Renown-published names and the owners Postgres holds for each. */
  renown: { did: string; owners: Record<string, string[] | null> };
  /** A verdaccio account (`npm adduser`) publish, Renown off. */
  verdaccioUser: {
    user: string;
    name: string;
    publishOk: boolean;
    owners: string[] | null;
    /** The piece read on the replicas it was not published to. */
    visibility: PollResult | null;
  };
  /** A publish with a token no one issued. */
  anonymous: {
    name: string;
    publishOk: boolean;
    output: string;
    owners: string[] | null;
  };
}

export async function ownership(
  ctx: Context,
  renownNames: string[],
  did: string,
): Promise<OwnershipResult> {
  const stack = ctx.stack!;
  const rows = await stack.ownerRows();
  const renown = {
    did,
    owners: Object.fromEntries(renownNames.map((n) => [n, rows[n] ?? null])),
  };

  log("ownership: restarting replicas with verdaccio accounts (Renown off)");
  const plain: Stack = stack.withEnv({ authRenown: false });
  await plain.up();
  const user = `e2e-${ctx.runId}`;
  const token = await verdaccioToken(
    REPLICA_URL["registry-1"],
    user,
    `pw-${ctx.runId}`,
  );
  const pkg = probePackage(`${pkgPrefix(ctx.runId)}-npmuser`, "1.0.0");
  const pub = await publishProbe(pkg, REPLICA_URL["registry-1"], token);
  const visibility = pub.ok
    ? await poll({
        targets: ctx.targets.filter((t) => t.name !== "registry-1"),
        endpoints: pieceEndpoints(pkg.piece, "1.0.0", { latest: true }),
        since: pub.finishedAt,
        timeoutMs: ctx.timing.visibleTimeoutMs,
        holdMs: 5000,
        intervalMs: ctx.timing.intervalMs,
      })
    : null;

  const anon = probePackage(`${pkgPrefix(ctx.runId)}-anon`, "1.0.0");
  // npm refuses to send a publish without a token, so send one nobody signed.
  const anonPub = await publishProbe(
    anon,
    REPLICA_URL["registry-2"],
    "invalid",
  );

  const after = await plain.ownerRows();
  return {
    renown,
    verdaccioUser: {
      user,
      name: pkg.name,
      publishOk: pub.ok,
      owners: after[pkg.name] ?? null,
      visibility,
    },
    anonymous: {
      name: anon.name,
      publishOk: anonPub.ok,
      output: anonPub.output,
      owners: after[anon.name] ?? null,
    },
  };
}

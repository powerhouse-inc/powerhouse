import { isPlainObject } from "./walk.js";

/**
 * The cross-host forms removed in T3 (typed-host-configs 3.7), detected
 * before schema validation so the error names the token form that replaces
 * each one instead of a bare "Unrecognized key". clint's `agents.*.host` and
 * proxy `routes.*.member` are checked by the clint runner schemas.
 */

export interface RemovedForm {
  /** Host path of the removed value. */
  path: string;
  message: string;
}

function outputToken(host: string, path: string[], member?: string): string {
  const memberPart = member ? `, member: "${member}"` : "";
  return `{ $output: { host: "${host}"${memberPart}, path: [${path.map((p) => JSON.stringify(p)).join(", ")}] } }`;
}

function isDriveReference(
  value: unknown,
): value is { from: string; slug: string } {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value).sort();
  return (
    keys.length === 2 &&
    keys[0] === "from" &&
    keys[1] === "slug" &&
    typeof value.from === "string" &&
    typeof value.slug === "string"
  );
}

function checkReactor(
  reactor: unknown,
  base: string,
  found: RemovedForm[],
): void {
  if (!isPlainObject(reactor) || !isPlainObject(reactor.backends)) return;
  for (const [name, backend] of Object.entries(reactor.backends)) {
    if (!isPlainObject(backend) || !isPlainObject(backend.remote)) continue;
    const host = backend.remote.host;
    if (host === undefined) continue;
    const producer = typeof host === "string" ? host : "switchboard";
    found.push({
      path: `${base}reactor.backends.${name}.remote.host`,
      message: `remote: { host } was removed; use a drive address: remote: { url: ${producer}.drives.<slug>.url } with ${producer} from ../${producer}/outputs.js, or remote: { url: ${outputToken(producer, ["drives", "<slug>", "url"])} }.`,
    });
  }
}

function checkPlugins(
  runner: unknown,
  base: string,
  memberHosts: Record<string, string>,
  found: RemovedForm[],
): void {
  if (!isPlainObject(runner) || !Array.isArray(runner.plugins)) return;
  runner.plugins.forEach((entry: unknown, index) => {
    if (!isPlainObject(entry) || !isPlainObject(entry.config)) return;
    for (const [key, value] of Object.entries(entry.config)) {
      if (!isDriveReference(value)) continue;
      const host = memberHosts[value.from] ?? value.from;
      const member = memberHosts[value.from] ? value.from : undefined;
      found.push({
        path: `${base}runner.plugins[${index}].config.${key}`,
        message: `${key}: { from, slug } was removed; use ${host}.drives.${value.slug}.url from ../${host}/outputs.js, or ${outputToken(host, ["drives", value.slug, "url"])}${member ? ` (add member: "${member}" if two members run host "${host}")` : ""}.`,
      });
    }
  });
}

/** Every removed form in a host file (reactor or compound), in document
 * order. Compound wrappers are checked too. */
export function findRemovedForms(host: unknown): RemovedForm[] {
  const found: RemovedForm[] = [];
  if (!isPlainObject(host)) return found;
  const children = isPlainObject(host.children) ? host.children : undefined;
  const memberHosts: Record<string, string> = {};
  for (const [key, wrapper] of Object.entries(children ?? {})) {
    if (isPlainObject(wrapper) && typeof wrapper.host === "string") {
      memberHosts[key] = wrapper.host;
    }
  }

  checkReactor(host.reactor, "", found);
  checkPlugins(host.runner, "", memberHosts, found);
  for (const [key, wrapper] of Object.entries(children ?? {})) {
    if (!isPlainObject(wrapper)) continue;
    checkReactor(wrapper.reactor, `children.${key}.`, found);
    checkPlugins(wrapper.runner, `children.${key}.`, memberHosts, found);
  }
  if (children && isPlainObject(host.config)) {
    for (const key of ["projectDrivesIntoConnect", "drivesPublicBase"]) {
      if (host.config[key] === undefined) continue;
      found.push({
        path: `config.${key}`,
        message: `config.${key} was removed; declare the drives on the member that consumes them, by output token: reactor.drives: [{ slug: "<slug>", remote: { url: ${outputToken("switchboard", ["drives", "<slug>", "url"])} } }].`,
      });
    }
  }
  return found;
}

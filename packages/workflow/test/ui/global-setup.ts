import { buildCss, ensureServers } from "../../scripts/ui-stack.js";

// Starts whatever isn't running yet; the returned teardown stops only those.
export default async function globalSetup() {
  await buildCss();
  const started = await ensureServers();
  return () => {
    for (const child of started) child.kill();
  };
}

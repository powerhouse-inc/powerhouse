import {
  buildCss,
  ensureServers,
  warmConnect,
} from "../../scripts/ui-stack.js";

// Starts whatever isn't running yet; the returned teardown stops only those.
export default async function globalSetup() {
  await buildCss();
  const started = await ensureServers();
  await warmConnect();
  return () => {
    for (const child of started) child.kill();
  };
}

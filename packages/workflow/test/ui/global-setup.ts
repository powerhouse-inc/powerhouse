import {
  buildCss,
  buildHarnesses,
  connectDev,
  ensureServers,
  warmConnect,
} from "../../scripts/ui-stack.js";

// Starts whatever isn't running yet; the returned teardown stops only those.
export default async function globalSetup() {
  await Promise.all([buildCss(), buildHarnesses()]);
  const started = await ensureServers();
  if (connectDev()) await warmConnect();
  return () => {
    for (const child of started) child.kill();
  };
}

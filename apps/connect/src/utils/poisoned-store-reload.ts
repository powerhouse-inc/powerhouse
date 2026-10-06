/** A poisoned store cannot recover inside this worker, so every tab moves to a fresh one. */
export function reloadOnPoisonedStore(
  broadcast: (reason: string, workerGen: string) => void,
): (cause: Error) => void {
  let reloading = false;
  return (cause) => {
    console.error("[reactor.worker] PGlite session poisoned:", cause);
    if (reloading) return;
    reloading = true;
    broadcast("storage session poisoned", crypto.randomUUID());
  };
}

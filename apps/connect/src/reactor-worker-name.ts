const GEN_KEY_PREFIX = "ph-reactor-gen:";

// A persisted generation token, bumped on restart, is folded into the
// SharedWorker name so a restart spawns a fresh worker instance while the
// IndexedDB namespace (and its data) stays put.
export function reactorWorkerName(namespace: string): string {
  const gen = readWorkerGen(namespace);
  return gen ? `ph-reactor:${namespace}#${gen}` : `ph-reactor:${namespace}`;
}

export function readWorkerGen(namespace: string): string | null {
  try {
    return localStorage.getItem(GEN_KEY_PREFIX + namespace);
  } catch {
    return null;
  }
}

export function bumpWorkerGen(namespace: string, gen: string): void {
  try {
    localStorage.setItem(GEN_KEY_PREFIX + namespace, gen);
  } catch {
    // localStorage unavailable; the reload falls back to reusing the worker.
  }
}

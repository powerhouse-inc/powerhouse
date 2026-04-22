export type MigrationPhase = "clone" | "dump" | "restore";

export type MigrationStatus = {
  idbName: string;
  phase: MigrationPhase;
};

let current: MigrationStatus | null = null;
const listeners = new Set<() => void>();

export function setMigrationStatus(status: MigrationStatus | null): void {
  current = status;
  for (const l of listeners) l();
}

export function getMigrationStatus(): MigrationStatus | null {
  return current;
}

export function subscribeMigrationStatus(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

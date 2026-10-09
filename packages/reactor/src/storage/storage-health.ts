export type StorageHealth = {
  /** False once the store's session was poisoned; a host restart clears it. */
  healthy: boolean;
};

export interface IStorageHealthProvider {
  getStorageHealth(): StorageHealth;
}

/** Fed by the poison path so "connected" never reads green over a dead session. */
export class StorageHealthTracker implements IStorageHealthProvider {
  private healthy = true;

  markPoisoned(): void {
    this.healthy = false;
  }

  getStorageHealth(): StorageHealth {
    return { healthy: this.healthy };
  }
}

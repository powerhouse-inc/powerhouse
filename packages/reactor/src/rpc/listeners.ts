export class KeyedListeners<K, A extends unknown[] = []> {
  private readonly map = new Map<K, Set<(...a: A) => void>>();

  add(key: K, fn: (...a: A) => void): () => void {
    let set = this.map.get(key);
    if (!set) {
      set = new Set();
      this.map.set(key, set);
    }
    set.add(fn);
    return () => {
      const current = this.map.get(key);
      if (!current) {
        return;
      }
      current.delete(fn);
      if (current.size === 0) {
        this.map.delete(key);
      }
    };
  }

  emit(key: K, ...a: A): void {
    const set = this.map.get(key);
    if (!set) {
      return;
    }
    for (const fn of [...set]) {
      fn(...a);
    }
  }

  emitAll(...a: A): void {
    for (const set of [...this.map.values()]) {
      for (const fn of [...set]) {
        fn(...a);
      }
    }
  }
}

export class Listeners<A extends unknown[] = []> {
  private readonly keyed = new KeyedListeners<null, A>();

  add(fn: (...a: A) => void): () => void {
    return this.keyed.add(null, fn);
  }

  emit(...a: A): void {
    this.keyed.emit(null, ...a);
  }
}

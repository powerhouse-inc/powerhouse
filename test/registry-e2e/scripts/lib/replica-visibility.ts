// Legacy publish lag: the verdaccio registry has no queue to watch, so time
// how long each published version takes to answer on each replica.
import type { SeedPackage } from "./mix.js";
import { probe } from "./poll.js";
import { sleep } from "./sh.js";

export interface Published extends SeedPackage {
  finishedAt: number;
}

export interface Visibility {
  name: string;
  /** Ms from the publish to the first replica serving it; null if none did */
  firstMs: number | null;
  /** Ms from the publish until every replica served it; null if one never did */
  allMs: number | null;
  perReplica: (number | null)[];
}

export interface SettleOptions {
  /** Give up on everything after this long */
  timeoutMs: number;
  /** Stop once every version is on some replica and this long has passed */
  settleMs: number;
}

// Reads each replica every second until a version is on one of them; the
// other replicas are read again only in `settle`, to bound the probe load
export class VisibilityTracker {
  #pkgs: Published[] = [];
  #seen: (number | null)[][] = [];
  #running = true;
  #settling = false;
  #loop: Promise<void>;

  constructor(
    private replicas: string[],
    private concurrency = 32,
  ) {
    this.#loop = this.#run();
  }

  add(pkg: Published): void {
    this.#pkgs.push(pkg);
    this.#seen.push(this.replicas.map(() => null));
  }

  async #round(): Promise<void> {
    const todo = this.#pkgs.flatMap((pkg, p) => {
      const row = this.#seen[p];
      if (!this.#settling && row.some((at) => at !== null)) return [];
      return this.replicas.flatMap((base, r) =>
        row[r] === null ? [{ pkg, p, base, r }] : [],
      );
    });
    let cursor = 0;
    await Promise.all(
      Array.from({ length: this.concurrency }, async () => {
        while (cursor < todo.length) {
          const { pkg, p, base, r } = todo[cursor++];
          const sample = await probe(
            `${base}/pieces/${pkg.piece}?version=${pkg.version}`,
            10_000,
          );
          if (sample.status === 200 && sample.version === pkg.version) {
            this.#seen[p][r] = sample.at;
          }
        }
      }),
    );
  }

  async #run(): Promise<void> {
    while (this.#running) {
      const started = Date.now();
      await this.#round();
      await sleep(Math.max(0, 1000 - (Date.now() - started)));
    }
  }

  /** Reads every replica until all serve every version or `options` stop it. */
  async settle(options: SettleOptions): Promise<Visibility[]> {
    this.#settling = true;
    const started = Date.now();
    for (;;) {
      const elapsed = Date.now() - started;
      const onSome = this.#seen.every((row) => row.some((at) => at !== null));
      const onAll = this.#seen.every((row) => row.every((at) => at !== null));
      if (onAll || elapsed >= options.timeoutMs) break;
      if (onSome && elapsed >= options.settleMs) break;
      await sleep(500);
    }
    this.#running = false;
    await this.#loop;
    return this.#pkgs.map((pkg, p) => {
      const perReplica = this.#seen[p].map((at) =>
        at === null ? null : Math.max(0, at - pkg.finishedAt),
      );
      const hits = perReplica.filter((ms): ms is number => ms !== null);
      return {
        name: pkg.name,
        firstMs: hits.length ? Math.min(...hits) : null,
        allMs: hits.length === this.replicas.length ? Math.max(...hits) : null,
        perReplica,
      };
    });
  }
}

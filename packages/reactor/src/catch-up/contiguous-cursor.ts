/** In memory, per consumer; tracks ordinals above appliedThrough only. */
export class ContiguousCursor {
  private claimed = new Set<number>();
  private applied = new Set<number>();

  constructor(
    private through: number,
    private limit: number,
  ) {}

  setLimit(limit: number): void {
    this.limit = limit;
  }

  /** Every present ordinal at or below this has been applied. */
  get appliedThrough(): number {
    return this.through;
  }

  get trackedAbove(): number {
    return this.claimed.size + this.applied.size;
  }

  /** Ordinals the caller must apply; the rest are already covered. */
  claim(ordinals: Iterable<number>): Set<number> {
    const mine = new Set<number>();
    for (const ordinal of ordinals) {
      if (ordinal <= this.through) continue;
      if (this.claimed.has(ordinal) || this.applied.has(ordinal)) continue;
      this.claimed.add(ordinal);
      mine.add(ordinal);
    }
    return mine;
  }

  /** Releases claims; committed ones join the applied set. */
  settle(ordinals: Iterable<number>, committed: boolean): void {
    for (const ordinal of ordinals) {
      if (!this.claimed.delete(ordinal)) continue;
      if (committed && ordinal > this.through) this.applied.add(ordinal);
    }
  }

  /** Past the limit, clears the applied set; the next sweep re-applies it. */
  enforceLimit(): void {
    if (this.claimed.size + this.applied.size > this.limit) {
      this.applied.clear();
    }
  }

  /** Present ordinals above the cursor that no path has claimed or applied. */
  missing(present: readonly number[]): number[] {
    return present.filter(
      (ordinal) =>
        ordinal > this.through &&
        !this.claimed.has(ordinal) &&
        !this.applied.has(ordinal),
    );
  }

  /** `settled`, held below the lowest claimed or unapplied ordinal. */
  target(settled: number, present: readonly number[]): number {
    let to = settled;
    for (const ordinal of this.claimed) {
      if (ordinal <= to) to = ordinal - 1;
    }
    for (const ordinal of present) {
      if (ordinal <= this.through || ordinal > to) continue;
      if (!this.applied.has(ordinal)) to = ordinal - 1;
    }
    return Math.max(to, this.through);
  }

  advance(to: number): void {
    if (to <= this.through) return;
    this.through = to;
    for (const ordinal of this.applied) {
      if (ordinal <= to) this.applied.delete(ordinal);
    }
    for (const ordinal of this.claimed) {
      if (ordinal <= to) this.claimed.delete(ordinal);
    }
  }
}

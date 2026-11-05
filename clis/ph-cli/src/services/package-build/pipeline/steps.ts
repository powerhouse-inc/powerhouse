/**
 * One step of `ph build`. A step without `after` follows the step listed
 * before it in its phase; a step with `after` runs as soon as every step it
 * names has run, so a list can insert a step after any other without
 * reordering the rest. A `committed` step runs once the output is replaced,
 * after every other step; a throw from it cannot bring the previous output
 * back.
 */
export type BuildStep<C> = {
  readonly id: string;
  readonly after?: readonly string[];
  readonly when?: "committed";
  readonly run: (ctx: C) => Promise<void>;
};

/** A step's decision not to finish the build. The runner rolls back first. */
export class BuildRefusal extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "BuildRefusal";
    this.exitCode = exitCode;
  }
}

/** The process was told to stop while the build ran; it was rolled back. */
export class BuildStopped extends Error {
  readonly signal: string;

  constructor(signal: string) {
    super(`The build was stopped by ${signal} before it finished.`);
    this.name = "BuildStopped";
    this.signal = signal;
  }
}

function dependencies<C>(
  steps: readonly BuildStep<C>[],
): ReadonlyMap<string, readonly string[]> {
  const ids = new Set<string>();
  for (const { id } of steps) {
    if (ids.has(id)) throw new Error(`Build step "${id}" is listed twice.`);
    ids.add(id);
  }
  const committed = new Set(
    steps.filter(({ when }) => when === "committed").map(({ id }) => id),
  );
  const waits = new Map<string, readonly string[]>();
  steps.forEach((step, index) => {
    const previous = steps
      .slice(0, index)
      .findLast(({ when }) => when === step.when);
    const after = step.after ?? (previous === undefined ? [] : [previous.id]);
    for (const id of after) {
      if (!ids.has(id)) {
        throw new Error(
          `Build step "${step.id}" runs after "${id}", which no step provides.`,
        );
      }
      if (step.when !== "committed" && committed.has(id)) {
        throw new Error(
          `Build step "${step.id}" runs before the output is replaced, so it cannot run after "${id}", which runs once it is.`,
        );
      }
    }
    waits.set(step.id, after);
  });
  return waits;
}

/**
 * The order the steps run in: list order, with each step that names `after`
 * placed right after the last step it waits for, and every `committed` step
 * after every other. Throws on a duplicate id, an unknown `after` id, a step
 * that waits on a later phase, or steps that wait on each other.
 */
export function orderBuildSteps<C>(
  steps: readonly BuildStep<C>[],
): BuildStep<C>[] {
  const waits = dependencies(steps);
  const placed = new Set<string>();
  const ordered: BuildStep<C>[] = [];
  while (ordered.length < steps.length) {
    const ready = steps.filter(
      ({ id }) =>
        !placed.has(id) && waits.get(id)!.every((wait) => placed.has(wait)),
    );
    if (ready.length === 0) {
      const waiting = steps
        .filter(({ id }) => !placed.has(id))
        .map(({ id }) => `"${id}"`);
      throw new Error(`Build steps ${waiting.join(", ")} wait on each other.`);
    }
    const phase = ready.some(({ when }) => when !== "committed")
      ? ready.filter(({ when }) => when !== "committed")
      : ready;
    const next = phase.find((step) => step.after !== undefined) ?? phase[0];
    placed.add(next.id);
    ordered.push(next);
  }
  return ordered;
}

// The app graph's largest packages; none reads the runtime config when evaluated.
const STAGES: (() => Promise<unknown>)[] = [
  () => import("@powerhousedao/reactor-browser"),
  () => import("@powerhousedao/design-system/connect"),
];

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Evaluates them one task each; imported with the app they'd be one long task. */
export async function warmModules(stages = STAGES) {
  for (const stage of stages) {
    await nextTask();
    // The app's own import reports a failure.
    await stage().catch(() => undefined);
  }
}

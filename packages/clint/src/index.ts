/**
 * @powerhousedao/clint — the clint framework in the monorepo (uniform-runners
 * phase 5): AI-powered CLIs over the Powerhouse stack. The port-away from the
 * ph-clint repo lands here in slices (plan of record:
 * uniform-runners-plan/wbs/phase-5.md); the published @powerhousedao/ph-clint*
 * packages are frozen, not republished from this tree.
 *
 * Runner modules: ./clint-runner (the framework shell — services manager,
 * REPL, proxy, agents manager) and ./mastra-runner (the headless agent host).
 */

export const CLINT_PORT_STATUS = "P5.1-scaffold" as const;
